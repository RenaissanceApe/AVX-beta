import { supabase } from './supabase'
import { logger } from './logger'
import { track } from './usage'
import { t } from '../i18n'

// Adds a person to a gig or organisation by email via the send-invite Edge Function,
// which also emails people who don't have an account yet.
// Returns { result: 'added' | 'already_member' | 'invited', emailed: boolean }.
export async function sendInvite({ kind, targetId, email, role, functionTitle, callTime }) {
  const { data, error } = await supabase.functions.invoke('send-invite', {
    body: {
      kind,
      target_id: targetId,
      email: email.trim(),
      role,
      function_title: functionTitle || null,
      call_time: callTime || null,
    },
  })
  if (error) {
    // FunctionsHttpError carries the JSON body with the database's message
    let message = error.message
    try {
      const body = await error.context?.json?.()
      if (body?.error) message = body.error
    } catch { /* not JSON */ }
    throw new Error(message)
  }
  if (data?.email_error) logger.warn('invites', 'Invite stored but email not sent', { kind })
  track(`invite:${kind}-${data?.result || 'sent'}`)
  return data
}

export function inviteMessage(email, { result, emailed, email_error: emailError }) {
  if (result === 'added') return { kind: 'success', text: t('invite.added', { email }) }
  if (result === 'already_member') return { kind: 'info', text: t('invite.already', { email }) }
  if (emailed) return { kind: 'success', text: t('invite.emailed', { email }) }
  if (emailError === 'rate_limited') return { kind: 'info', text: t('invite.rateLimited', { email, link: `${window.location.origin}/auth` }) }
  return { kind: 'info', text: t('invite.notEmailed', { email, link: `${window.location.origin}/auth` }) }
}
