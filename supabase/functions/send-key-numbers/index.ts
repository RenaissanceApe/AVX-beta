// send-key-numbers: once a week (Monday morning), email each admin who opted in (Settings →
// Notifications → Weekly key numbers) the Overview's key numbers of each organisation they run.
// Sent through Brevo's transactional email API, like the daily summary (send-digest).
//
// Called by the "Weekly key numbers" GitHub Actions workflow (.github/workflows/key-numbers.yml),
// not by the app, so JWT verification is off and the caller must send the shared secret in the
// x-digest-secret header (the same DIGEST_SECRET as the daily summary).
//
// Required function secrets: BREVO_API_KEY, DIGEST_FROM, DIGEST_SECRET. Optional: APP_URL.
//
// Rules:
// - recipients from public.weekly_numbers_recipients: admins with profiles.weekly_numbers, once per
//   organisation they administer, not for organisations they muted
// - the numbers from public.weekly_key_numbers, counted as that admin with the same report functions
//   as the Overview (it checks again that they are an admin and opted in)
// - public.claim_weekly_numbers just before sending: one email per person, organisation and week,
//   under the project's daily email cap
// - ?dry=1 counts what would be sent without emailing or recording anything
// - every call out has a time limit; no new email starts after the run budget (_shared/timeout.ts)
// Logs carry counts only, never addresses or numbers.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { type Lang, renderKeyNumbersEmail, weekStart } from '../_shared/key-numbers-email.ts'
import { fetchWithTimeout, isTimeout, runBudget } from '../_shared/timeout.ts'

const MAX_PER_RUN = 500

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function sameSecret(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!sameSecret(req.headers.get('x-digest-secret') ?? '', Deno.env.get('DIGEST_SECRET') ?? '')) return json({ error: 'Forbidden' }, 403)

  const dryRun = new URL(req.url).searchParams.get('dry') === '1'
  const apiKey = Deno.env.get('BREVO_API_KEY')
  const from = Deno.env.get('DIGEST_FROM')
  if (!dryRun && (!apiKey || !from)) {
    console.log(JSON.stringify({ fn: 'send-key-numbers', step: 'skipped', reason: 'not configured' }))
    return json({ skipped: 'BREVO_API_KEY or DIGEST_FROM not set' })
  }
  const appUrl = (Deno.env.get('APP_URL') ?? 'https://avx-beta.vercel.app').replace(/\/$/, '')
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    global: { fetch: fetchWithTimeout }, auth: { persistSession: false },
  })

  const { data: recipients, error } = await admin.rpc('weekly_numbers_recipients')
  if (error) {
    console.error(JSON.stringify({ fn: 'send-key-numbers', step: 'load', code: error.code, timeout: isTimeout(error) }))
    return json({ error: 'Could not load recipients' }, 500)
  }
  const now = new Date()
  const week = weekStart(now)
  const emails = new Map<string, string | null>()
  let sent = 0, failed = 0, limited = 0, empty = 0, timedOut = false, outOfTime = false
  const overBudget = runBudget()

  for (const r of (recipients ?? []) as { user_id: string; org_id: string; org_name: string; language: string }[]) {
    if (!outOfTime && overBudget()) outOfTime = true
    if (timedOut || outOfTime || sent >= MAX_PER_RUN) { limited++; continue }

    const { data: numbers, error: numErr } = await admin.rpc('weekly_key_numbers', { p_org: r.org_id, p_user: r.user_id, p_at: now.toISOString() })
    if (numErr) { failed++; console.error(JSON.stringify({ fn: 'send-key-numbers', step: 'numbers', code: numErr.code })); continue }
    if (!numbers) { empty++; continue }

    if (!emails.has(r.user_id)) {
      const { data: userRes } = await admin.auth.admin.getUserById(r.user_id)
      emails.set(r.user_id, userRes?.user?.email ?? null)
    }
    const email = emails.get(r.user_id)
    if (!email) { failed++; continue }
    if (dryRun) { sent++; continue }

    const { error: claimErr } = await admin.rpc('claim_weekly_numbers', { p_user: r.user_id, p_org: r.org_id, p_week: week })
    if (claimErr) {
      if (claimErr.code === '54000') limited++
      else { failed++; console.error(JSON.stringify({ fn: 'send-key-numbers', step: 'claim', code: claimErr.code })) }
      continue
    }

    const lang: Lang = r.language === 'pt' ? 'pt' : 'en'
    const { subject, html, text } = renderKeyNumbersEmail(numbers, { lang, orgName: r.org_name, orgId: r.org_id, appUrl, week })
    try {
      const res = await fetchWithTimeout('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': apiKey!, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ sender: { name: 'AVX', email: from }, to: [{ email }], subject, htmlContent: html, textContent: text, tags: ['key-numbers'] }),
      })
      if (!res.ok) { failed++; console.error(JSON.stringify({ fn: 'send-key-numbers', step: 'brevo', status: res.status })); continue }
      sent++
    } catch (err) {
      // Already claimed for this week, so it isn't sent twice; stop the run if Brevo is slow
      failed++
      timedOut = isTimeout(err)
      console.error(JSON.stringify({ fn: 'send-key-numbers', step: 'brevo', timeout: timedOut }))
    }
  }

  const summary = { recipients: recipients?.length ?? 0, sent, empty, limited, failed, timedOut, outOfTime, dryRun, week }
  console.log(JSON.stringify({ fn: 'send-key-numbers', step: 'done', ...summary }))
  return json(summary)
})
