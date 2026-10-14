import { supabase } from './supabase'
import { logger } from './logger'

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
  return data
}

export function inviteMessage(email, { result, emailed }) {
  if (result === 'added') return { kind: 'success', text: `${email} has been added.` }
  if (result === 'already_member') return { kind: 'info', text: `${email} is already a member.` }
  if (emailed) return { kind: 'success', text: `Invitation emailed to ${email}. They'll be added as soon as they accept.` }
  return {
    kind: 'info',
    text: `${email} doesn't have an account yet and the invitation email couldn't be sent. Share ${window.location.origin}/auth with them — once they sign up with this email they'll be added automatically.`,
  }
}
