import { t } from '../i18n'
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
    case 'booking_changed':   return d.booked_from && d.booked_until
      ? t('notif.bookingChanged', { actor, gig, range: rangeText(d.booked_from, d.booked_until) })
      : t('notif.bookingCleared', { actor, gig })
    default:                  return t('notif.generic', { gig })
  }
}

// Kinds that are a direct question to you: they still count when the organisation is muted
export const DIRECT_KINDS = new Set(['availability_request'])
export const countsAsUnread = (n, mutedOrgIds) => !n.read_at && (!n.org_id || !mutedOrgIds?.has(n.org_id) || DIRECT_KINDS.has(n.kind))

export function notificationLink(n) {
  if (n.details?.quote_id) return `/quote/${n.details.quote_id}`
  // Requests are answered in My work (you may not be on the gig yet)
  if (n.kind === 'availability_request') return '/me#requests'
  if (n.gig_id && (n.kind === 'availability_reply' || n.kind === 'booking_changed')) return `/gig/${n.gig_id}?tab=crew`
  if (n.gig_id) return n.kind === 'schedule_changed' ? `/gig/${n.gig_id}?tab=schedule` : `/gig/${n.gig_id}`
  return '/dashboard'
}
