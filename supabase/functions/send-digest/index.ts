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
// Logs carry counts only, never addresses or content.

import { createClient } from 'npm:@supabase/supabase-js@2'

type Lang = 'en' | 'pt'
type Notification = {
  id: number
  user_id: string
  gig_id: string | null
  actor_id: string | null
  kind: string
  details: Record<string, unknown>
  created_at: string
}

const MAX_LINES = 20

const STRINGS: Record<Lang, Record<string, string>> = {
  en: {
    subjectOne: 'AVX: 1 update you haven’t seen',
    subjectMany: 'AVX: {count} updates you haven’t seen',
    intro: 'Here’s what happened on your gigs since you last checked AVX.',
    more: '…and {count} more in the app.',
    open: 'Open AVX',
    footer: 'You get this summary because you have unread notifications in AVX. Turn it off under Account → Email summary.',
    someone: 'Someone',
    addedToGig: '{actor} added you to {gig} as {role}',
    addedToOrg: '{actor} added you to {org} as {role}',
    callTime: 'Your call time for {gig} is now {time}',
    newVersion: '{actor} uploaded version {version} of “{name}” on {gig}',
    uploaded: '{actor} uploaded “{name}” on {gig}',
    important: '{actor} posted an important update on {gig}: {excerpt}',
    schedule: '{actor} changed the schedule for {gig}',
    status: '{gig} is now {status}',
    details: '{actor} changed the dates or venue of {gig}',
    generic: 'Update on {gig}',
    gigDeleted: '{actor} deleted the gig {gig}',
    orgDeleted: '{actor} deleted the organisation {org}',
    quoteAccepted: '{client} accepted quote {number} · {title}',
    quoteDeclined: '{client} declined quote {number} · {title}',
    'role.pm': 'Production Manager', 'role.crew': 'Crew', 'role.viewer': 'Viewer',
    'orgRole.admin': 'Admin', 'orgRole.member': 'Member', 'orgRole.viewer': 'Viewer',
    'status.draft': 'Draft', 'status.confirmed': 'Confirmed', 'status.active': 'Active',
    'status.completed': 'Done', 'status.archived': 'Archived',
  },
  pt: {
    subjectOne: 'AVX: 1 atualização por ver',
    subjectMany: 'AVX: {count} atualizações por ver',
    intro: 'Eis o que aconteceu nos seus eventos desde a última vez que abriu o AVX.',
    more: '…e mais {count} na aplicação.',
    open: 'Abrir o AVX',
    footer: 'Recebe este resumo porque tem notificações por ler no AVX. Pode desativá-lo em Conta → Resumo por email.',
    someone: 'Alguém',
    addedToGig: '{actor} adicionou-o a {gig} como {role}',
    addedToOrg: '{actor} adicionou-o a {org} como {role}',
    callTime: 'A sua hora de chamada para {gig} passou a {time}',
    newVersion: '{actor} carregou a versão {version} de “{name}” em {gig}',
    uploaded: '{actor} carregou “{name}” em {gig}',
    important: '{actor} publicou uma atualização importante em {gig}: {excerpt}',
    schedule: '{actor} alterou o horário de {gig}',
    status: '{gig} está agora {status}',
    details: '{actor} alterou as datas ou o local de {gig}',
    generic: 'Atualização em {gig}',
    gigDeleted: '{actor} eliminou o evento {gig}',
    orgDeleted: '{actor} eliminou a organização {org}',
    quoteAccepted: '{client} aceitou o orçamento {number} · {title}',
    quoteDeclined: '{client} recusou o orçamento {number} · {title}',
    'role.pm': 'Production Manager', 'role.crew': 'Equipa', 'role.viewer': 'Leitor',
    'orgRole.admin': 'Administrador', 'orgRole.member': 'Membro', 'orgRole.viewer': 'Leitor',
    'status.draft': 'Rascunho', 'status.confirmed': 'Confirmado', 'status.active': 'Em curso',
    'status.completed': 'Concluído', 'status.archived': 'Arquivado',
  },
}

function fill(text: string, vars: Record<string, unknown>) {
  return text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''))
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

// Same wording as src/lib/notifications.js, rendered in the recipient's language.
function describe(n: Notification, lang: Lang, actorName: string | undefined) {
  const s = STRINGS[lang]
  const d = n.details || {}
  const actor = actorName || s.someone
  const gig = String(d.gig_name ?? '')
  switch (n.kind) {
    case 'added_to_gig': return fill(s.addedToGig, { actor, gig, role: d.function_title || s[`role.${d.role || 'crew'}`] })
    case 'added_to_org': return fill(s.addedToOrg, { actor, org: d.org_name, role: s[`orgRole.${d.role || 'member'}`] })
    case 'call_time_changed': return fill(s.callTime, { gig, time: String(d.call_time ?? '—').slice(0, 5) })
    case 'asset_new_version': return fill(s.newVersion, { actor, name: d.name, version: d.version, gig })
    case 'asset_uploaded': return fill(s.uploaded, { actor, name: d.name, gig })
    case 'important_post': return fill(s.important, { actor, gig, excerpt: d.excerpt })
    case 'schedule_changed': return fill(s.schedule, { actor, gig })
    case 'gig_status': return fill(s.status, { gig, status: s[`status.${d.status}`] ?? d.status })
    case 'gig_details': return fill(s.details, { actor, gig })
    case 'gig_deleted': return fill(s.gigDeleted, { actor, gig })
    case 'org_deleted': return fill(s.orgDeleted, { actor, org: d.org_name })
    case 'quote_accepted': return fill(s.quoteAccepted, { client: d.client_name, number: d.number, title: d.quote_title })
    case 'quote_declined': return fill(s.quoteDeclined, { client: d.client_name, number: d.number, title: d.quote_title })
    default: return fill(s.generic, { gig })
  }
}

function linkFor(n: Notification, appUrl: string) {
  if (n.details?.quote_id) return `${appUrl}/quote/${n.details.quote_id}`
  if (!n.gig_id) return `${appUrl}/dashboard`
  return n.kind === 'schedule_changed' ? `${appUrl}/gig/${n.gig_id}?tab=schedule` : `${appUrl}/gig/${n.gig_id}`
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
    auth: { persistSession: false },
  })

  const now = Date.now()
  const { data: pending, error } = await admin.from('notifications')
    .select('id, user_id, gig_id, actor_id, kind, details, created_at')
    .is('read_at', null).is('emailed_at', null)
    .gte('created_at', new Date(now - 7 * 24 * 3600e3).toISOString())
    .lte('created_at', new Date(now - 30 * 60e3).toISOString())
    .order('created_at', { ascending: false })
    .limit(5000)
  if (error) {
    console.error(JSON.stringify({ fn: 'send-digest', step: 'load', message: error.message }))
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
  const [{ data: recipients }, { data: actors }] = await Promise.all([
    admin.from('profiles').select('id, language, email_digest').in('id', userIds),
    actorIds.length ? admin.from('profiles').select('id, full_name').in('id', actorIds) : Promise.resolve({ data: [] }),
  ])
  const prefs = new Map((recipients ?? []).map(p => [p.id, p]))
  const names: Record<string, string> = Object.fromEntries((actors ?? []).filter(p => p.full_name).map(p => [p.id, p.full_name]))

  let sent = 0, optedOut = 0, failed = 0
  for (const [userId, items] of byUser) {
    const pref = prefs.get(userId)
    if (!pref || pref.email_digest === false) { optedOut++; continue }

    const { data: userRes, error: userErr } = await admin.auth.admin.getUserById(userId)
    const email = userRes?.user?.email
    if (userErr || !email) { failed++; continue }

    if (dryRun) { sent++; continue }

    const lang: Lang = pref.language === 'pt' ? 'pt' : 'en'
    const { subject, html, text } = renderEmail(items, lang, names, appUrl)
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
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

  const summary = { users: byUser.size, sent, optedOut, failed, dryRun }
  console.log(JSON.stringify({ fn: 'send-digest', step: 'done', ...summary }))
  return json(summary)
})
