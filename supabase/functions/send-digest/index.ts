// send-digest: once a day, email each person a short summary of the notifications
// they haven't read in the app yet. Sent through Brevo's transactional email API.
//
// Called by the "Email digest" GitHub Actions workflow (.github/workflows/digest.yml),
// not by the app, so JWT verification is off and the caller must send the shared
// secret in the x-digest-secret header instead.
//
// Required function secrets: BREVO_API_KEY, DIGEST_FROM (a sender verified in Brevo),
// DIGEST_SECRET. Optional: APP_URL (defaults to the production URL).
//
// Rules:
// - only notifications that are unread, not yet emailed, from the last 7 days and at
//   least 30 minutes old (if you saw it in the app straight away, no email)
// - only people whose profile has email_digest = true
// - each notification is emailed at most once (notifications.emailed_at)
// - nothing from organisations the person muted (org_mutes), except direct questions
//   to them (availability requests, messages, announcements, crew calls, client/supplier messages)
// - send limits (claim_system_send): one digest per person per 20 hours, and the project's daily
//   email cap; at most MAX_PER_RUN emails per run. Whatever is held back goes in the next digest.
// - every call out has a time limit (_shared/timeout.ts). If Brevo doesn't answer in time, that
//   person's notifications are marked emailed (it may have gone out; better a missed summary than
//   the same one twice) and the run stops; the rest go in the next run. Nothing is retried.
// Logs carry counts only, never addresses or content.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { type Lang, type Notification, DIRECT_KINDS, STRINGS, fill, describe, linkFor } from '../_shared/notification-text.ts'
import { claimSend } from '../_shared/send-limits.ts'
import { fetchWithTimeout, isTimeout } from '../_shared/timeout.ts'

const MAX_LINES = 20
const MAX_PER_RUN = 2000

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function renderEmail(items: Notification[], lang: Lang, names: Record<string, string>, appUrl: string) {
  const s = STRINGS[lang]
  const shown = items.slice(0, MAX_LINES)
  const extra = items.length - shown.length
  const subject = items.length === 1 ? s.subjectOne : fill(s.subjectMany, { count: items.length })
  const lines = shown.map(n => ({ text: describe(n, lang, n.actor_id ? names[n.actor_id] : undefined), href: linkFor(n, appUrl) }))

  const html = `<!doctype html><html lang="${lang}"><body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:12px;padding:28px" cellpadding="0" cellspacing="0">
<tr><td style="font-size:20px;font-weight:800;padding-bottom:6px">AVX</td></tr>
<tr><td style="font-size:14px;color:#444;padding-bottom:18px">${escapeHtml(s.intro)}</td></tr>
${lines.map(l => `<tr><td style="padding:10px 0;border-top:1px solid #eee;font-size:14px;line-height:1.5"><a href="${escapeHtml(l.href)}" style="color:#111;text-decoration:none">${escapeHtml(l.text)}</a></td></tr>`).join('\n')}
${extra > 0 ? `<tr><td style="padding:10px 0;border-top:1px solid #eee;font-size:13px;color:#666">${escapeHtml(fill(s.more, { count: extra }))}</td></tr>` : ''}
<tr><td style="padding-top:20px"><a href="${escapeHtml(appUrl)}/dashboard" style="display:inline-block;background:#1ec878;color:#04110a;font-weight:700;font-size:14px;padding:12px 20px;border-radius:8px;text-decoration:none">${escapeHtml(s.open)}</a></td></tr>
<tr><td style="padding-top:22px;font-size:12px;color:#888;line-height:1.5">${escapeHtml(s.footer)}</td></tr>
</table></td></tr></table></body></html>`

  const text = [s.intro, '', ...lines.map(l => `• ${l.text}\n  ${l.href}`), ...(extra > 0 ? ['', fill(s.more, { count: extra })] : []),
    '', `${s.open}: ${appUrl}/dashboard`, '', s.footer].join('\n')

  return { subject, html, text }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

// Constant-time comparison for the shared secret
function sameSecret(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const secret = Deno.env.get('DIGEST_SECRET') ?? ''
  if (!sameSecret(req.headers.get('x-digest-secret') ?? '', secret)) return json({ error: 'Forbidden' }, 403)

  const apiKey = Deno.env.get('BREVO_API_KEY')
  const from = Deno.env.get('DIGEST_FROM')
  if (!apiKey || !from) {
    console.log(JSON.stringify({ fn: 'send-digest', step: 'skipped', reason: 'not configured' }))
    return json({ skipped: 'BREVO_API_KEY or DIGEST_FROM not set' })
  }
  const appUrl = (Deno.env.get('APP_URL') ?? 'https://avx-beta.vercel.app').replace(/\/$/, '')
  // ?dry=1 counts what would be sent without emailing or marking anything
  const dryRun = new URL(req.url).searchParams.get('dry') === '1'

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    global: { fetch: fetchWithTimeout }, auth: { persistSession: false },
  })

  const now = Date.now()
  const { data: pending, error } = await admin.from('notifications')
    .select('id, user_id, gig_id, org_id, actor_id, kind, details, created_at')
    .is('read_at', null).is('emailed_at', null)
    .gte('created_at', new Date(now - 7 * 24 * 3600e3).toISOString())
    .lte('created_at', new Date(now - 30 * 60e3).toISOString())
    .order('created_at', { ascending: false })
    .limit(5000)
  if (error) {
    console.error(JSON.stringify({ fn: 'send-digest', step: 'load', message: error.message, timeout: isTimeout(error) }))
    return json({ error: 'Could not load notifications' }, 500)
  }

  const byUser = new Map<string, Notification[]>()
  for (const n of (pending ?? []) as Notification[]) {
    if (!byUser.has(n.user_id)) byUser.set(n.user_id, [])
    byUser.get(n.user_id)!.push(n)
  }
  if (!byUser.size) {
    console.log(JSON.stringify({ fn: 'send-digest', step: 'done', users: 0, sent: 0 }))
    return json({ users: 0, sent: 0 })
  }

  const userIds = [...byUser.keys()]
  const actorIds = [...new Set((pending ?? []).map(n => n.actor_id).filter(Boolean))] as string[]
  const [{ data: recipients }, { data: actors }, { data: mutes }] = await Promise.all([
    admin.from('profiles').select('id, language, email_digest').in('id', userIds),
    actorIds.length ? admin.from('profiles').select('id, full_name').in('id', actorIds) : Promise.resolve({ data: [] }),
    admin.from('org_mutes').select('user_id, org_id').in('user_id', userIds),
  ])
  const muted = new Set((mutes ?? []).map(m => `${m.user_id}:${m.org_id}`))
  const prefs = new Map((recipients ?? []).map(p => [p.id, p]))
  const names: Record<string, string> = Object.fromEntries((actors ?? []).filter(p => p.full_name).map(p => [p.id, p.full_name]))

  let sent = 0, optedOut = 0, failed = 0, mutedOnly = 0, limited = 0, timedOut = false
  for (const [userId, all] of byUser) {
    if (timedOut) { limited++; continue }
    if (sent >= MAX_PER_RUN) { limited++; continue }
    const pref = prefs.get(userId)
    if (!pref || pref.email_digest === false) { optedOut++; continue }
    const items = all.filter(n => !n.org_id || DIRECT_KINDS.has(n.kind) || !muted.has(`${userId}:${n.org_id}`))
    if (!items.length) { mutedOnly++; continue }

    const { data: userRes, error: userErr } = await admin.auth.admin.getUserById(userId)
    const email = userRes?.user?.email
    if (userErr || !email) { failed++; continue }

    if (dryRun) { sent++; continue }

    const claim = await claimSend(admin, 'claim_system_send', { p_kind: 'digest', p_user: userId })
    if (claim === 'limited') { limited++; continue }
    if (claim === 'error') { failed++; continue }

    const lang: Lang = pref.language === 'pt' ? 'pt' : 'en'
    const { subject, html, text } = renderEmail(items, lang, names, appUrl)
    let res: Response
    try {
      res = await fetchWithTimeout('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': apiKey, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          sender: { name: 'AVX', email: from },
          to: [{ email }],
          subject,
          htmlContent: html,
          textContent: text,
          tags: ['digest'],
        }),
      })
    } catch (err) {
      failed++
      timedOut = isTimeout(err)
      console.error(JSON.stringify({ fn: 'send-digest', step: 'brevo', timeout: timedOut }))
      if (!timedOut) continue
      // It may have gone out: don't put the same notifications in tomorrow's email
      const { error: markErr } = await admin.from('notifications')
        .update({ emailed_at: new Date().toISOString() }).in('id', items.map(n => n.id))
      if (markErr) console.error(JSON.stringify({ fn: 'send-digest', step: 'mark', message: markErr.message }))
      continue
    }
    if (!res.ok) {
      failed++
      console.error(JSON.stringify({ fn: 'send-digest', step: 'brevo', status: res.status }))
      continue
    }
    const { error: markErr } = await admin.from('notifications')
      .update({ emailed_at: new Date().toISOString() }).in('id', items.map(n => n.id))
    if (markErr) console.error(JSON.stringify({ fn: 'send-digest', step: 'mark', message: markErr.message }))
    sent++
  }

  const summary = { users: byUser.size, sent, optedOut, mutedOnly, limited, failed, timedOut, dryRun }
  console.log(JSON.stringify({ fn: 'send-digest', step: 'done', ...summary }))
  return json(summary)
})
