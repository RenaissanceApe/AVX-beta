// send-invite: add someone to a gig or organisation by email, and email them an
// invitation if they don't have an AVX account yet.
//
// Permission checks happen in the database: the invite_to_gig / invite_to_org RPCs
// run as the calling user. Only when the RPC reports 'invited' (no account yet) does
// this function use the service role to send Supabase's "Invite user" email, which
// goes out through the project's SMTP settings. Creating that auth user fires
// handle_new_user, which turns the pending invite into a membership.
//
// Each invite email counts against the send limits (claim_send, as the user). Over a limit the
// invite is still stored and the app says the email wasn't sent (email_error: 'rate_limited').

import { createClient } from 'npm:@supabase/supabase-js@2'
import { claimSend } from '../_shared/send-limits.ts'

const ALLOWED_ORIGINS = [
  'https://avx-beta.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
]
// Vercel preview deployments of this project
const PREVIEW_ORIGIN = /^https:\/\/avx-beta-[a-z0-9-]+\.vercel\.app$/

function allowedOrigin(origin: string | null): string | null {
  if (!origin) return null
  return ALLOWED_ORIGINS.includes(origin) || PREVIEW_ORIGIN.test(origin) ? origin : null
}

function corsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': allowedOrigin(origin) ?? ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, origin)

  const authorization = req.headers.get('Authorization')
  if (!authorization) return json({ error: 'Not signed in' }, 401, origin)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid request' }, 400, origin)
  }

  const kind = body.kind
  const targetId = String(body.target_id ?? '')
  const email = String(body.email ?? '').trim().toLowerCase()
  if ((kind !== 'gig' && kind !== 'org') || !targetId || !email) {
    return json({ error: 'Invalid request' }, 400, origin)
  }

  const url = Deno.env.get('SUPABASE_URL')!
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  })

  const rpc = kind === 'gig'
    ? userClient.rpc('invite_to_gig', {
        p_gig: targetId,
        p_email: email,
        p_role: body.role ?? 'crew',
        p_function_title: body.function_title ?? null,
        p_call_time: body.call_time || null,
      })
    : userClient.rpc('invite_to_org', { p_org: targetId, p_email: email, p_role: body.role ?? 'member' })

  const { data: result, error: rpcError } = await rpc
  if (rpcError) {
    // Permission and validation messages come from the database and are safe to show
    return json({ error: rpcError.message }, 400, origin)
  }
  if (result !== 'invited') return json({ result, emailed: false }, 200, origin)

  const claim = await claimSend(userClient, 'claim_send', {
    p_kind: 'invite', p_recipient: email, ...(kind === 'gig' ? { p_gig: targetId } : { p_org: targetId }),
  })
  if (claim !== 'ok') {
    return json({ result, emailed: false, email_error: claim === 'limited' ? 'rate_limited' : 'send_failed' }, 200, origin)
  }

  const appOrigin = allowedOrigin(origin) ?? ALLOWED_ORIGINS[0]
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${appOrigin}/welcome`,
  })
  if (inviteError) {
    // The pending invite is stored either way; the person can still sign up themselves.
    console.error(JSON.stringify({ fn: 'send-invite', step: 'inviteUserByEmail', kind, status: inviteError.status, message: inviteError.message }))
    return json({ result, emailed: false, email_error: inviteError.message }, 200, origin)
  }
  console.log(JSON.stringify({ fn: 'send-invite', step: 'emailed', kind }))
  return json({ result, emailed: true }, 200, origin)
})
