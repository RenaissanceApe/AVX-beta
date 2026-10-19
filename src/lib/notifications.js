import { t, fmt } from '../i18n'
import { dayRange } from './messages'
import { shortTime } from './schedule'
import { rangeText } from './clashes'

// Text for one notification row (uses the current UI language).
export function describeNotification(n, nameOf) {
  const d = n.details || {}
  const actor = n.actor_id ? nameOf(n.actor_id) : t('common.someone')
  const gig = d.gig_name || ''
  switch (n.kind) {
    case 'added_to_gig':      return t('notif.addedToGig', { actor, gig, role: d.function_title || t(`gigRoleLong.${d.role || 'crew'}`) })
    case 'added_to_org':      return t('notif.addedToOrg', { actor, org: d.org_name, role: t(`orgRole.${d.role || 'member'}`) })
    case 'call_time_changed': return t('notif.callTime', { gig, time: shortTime(d.call_time) || '—' })
    case 'asset_new_version': return t('notif.newVersion', { actor, name: d.name, version: d.version, gig })
    case 'asset_uploaded':    return t('notif.uploaded', { actor, name: d.name, gig })
    case 'important_post':    return t('notif.important', { actor, gig, excerpt: d.excerpt })
    case 'schedule_changed':  return t('notif.schedule', { actor, gig })
    case 'gig_status':        return t('notif.status', { gig, status: t(`status.${d.status}`) })
    case 'gig_details':       return t('notif.details', { actor, gig })
    case 'gig_deleted':       return t('notif.gigDeleted', { actor, gig })
    case 'org_deleted':       return t('notif.orgDeleted', { actor, org: d.org_name })
    case 'quote_accepted':    return t('notif.quoteAccepted', { client: d.client_name, number: d.number, title: d.quote_title })
    case 'quote_declined':    return t('notif.quoteDeclined', { client: d.client_name, number: d.number, title: d.quote_title })
    case 'availability_request': return t('notif.availabilityRequest', { actor, gig, range: d.from && d.until ? rangeText(d.from, d.until) : '—' })
    case 'availability_reply': return t(d.answer === 'available' ? 'notif.availabilityYes' : 'notif.availabilityNo', { actor, gig }) + (d.note ? `: “${d.note}”` : '')
    case 'damage_reported':   return t('notif.damage', { actor, item: [d.item_name, d.unit_code].filter(Boolean).join(' · '), gig: gig || '—', excerpt: d.excerpt || '' })
    case 'inspection_due':    return t('notif.inspectionDue', { count: d.count || 0, org: d.org_name || '' })
    case 'hire_request':      return t('notif.hireRequest', { org: d.from_org || '', range: d.starts_at && d.ends_at ? rangeText(d.starts_at, d.ends_at) : '—' })
    case 'crew_call':         return t('notif.crewCall', { actor, title: d.title || '', gig, range: d.start_date ? dayRange(d.start_date, d.end_date, fmt) : '—' })
    case 'crew_call_answer':  return t(`notif.crewCall.${d.answer === 'accepted' ? 'accepted' : 'declined'}`, { actor, title: d.title || '', gig })
    case 'guest_message':     return t(Number(d.count) > 1 ? 'notif.guestMany' : 'notif.guest', {
      guest: d.guest_name || t('common.someone'), about: d.about || t(`chat.context.kind.${d.about_kind || 'quote'}`), count: d.count || 1, excerpt: d.excerpt || '' })
    case 'announcement':      return t('notif.announcement', { actor, where: d.where || gig || '', excerpt: d.excerpt || '' })
    case 'message': {
      const key = d.why === 'mention' ? 'notif.messageMention' : d.gig_name ? 'notif.messageReply' : 'notif.messageDirect'
      if (!d.excerpt) return t(d.gig_name ? 'notif.messageNoTextGig' : 'notif.messageNoText', { actor, gig })
      return t(key, { actor, gig, count: d.count || 1, excerpt: d.excerpt })
    }
    case 'hire_answered':     return t(d.answer === 'confirmed' ? 'notif.hireConfirmed' : 'notif.hireDeclined', { supplier: d.supplier || '' })
    case 'booking_changed':   return d.booked_from && d.booked_until
      ? t('notif.bookingChanged', { actor, gig, range: rangeText(d.booked_from, d.booked_until) })
      : t('notif.bookingCleared', { actor, gig })
    default:                  return t('notif.generic', { gig })
  }
}

// Kinds that are a direct question to you: they still count when the organisation is muted
export const DIRECT_KINDS = new Set(['availability_request', 'message', 'announcement', 'crew_call', 'guest_message'])
export const countsAsUnread = (n, mutedOrgIds) => !n.read_at && (!n.org_id || !mutedOrgIds?.has(n.org_id) || DIRECT_KINDS.has(n.kind))

export function notificationLink(n) {
  if ((n.kind === 'message' || n.kind === 'crew_call' || n.kind === 'guest_message') && n.details?.conversation_id) return `/messages/${n.details.conversation_id}`
  if (n.kind === 'announcement' && n.details?.conversation_id) return `/messages/${n.details.conversation_id}?m=${n.details.message_id}`
  if (n.details?.quote_id) return `/quote/${n.details.quote_id}`
  if ((n.kind === 'damage_reported' || n.kind === 'inspection_due') && n.org_id) return `/org/${n.org_id}/inventory?tab=maintenance`
  if ((n.kind === 'hire_request' || n.kind === 'hire_answered') && n.org_id) return `/org/${n.org_id}/inventory?tab=subrentals`
  // Requests are answered in My work (you may not be on the gig yet)
  if (n.kind === 'availability_request') return '/me#requests'
  if (n.gig_id && (n.kind === 'availability_reply' || n.kind === 'booking_changed' || n.kind === 'crew_call_answer')) return `/gig/${n.gig_id}?tab=crew`
  if (n.gig_id) return n.kind === 'schedule_changed' ? `/gig/${n.gig_id}?tab=schedule` : `/gig/${n.gig_id}`
  return '/dashboard'
}
