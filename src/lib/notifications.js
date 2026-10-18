import { t } from '../i18n'
import { shortTime } from './schedule'

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
    default:                  return t('notif.generic', { gig })
  }
}

export function notificationLink(n) {
  if (n.details?.quote_id) return `/quote/${n.details.quote_id}`
  if (n.gig_id) return n.kind === 'schedule_changed' ? `/gig/${n.gig_id}?tab=schedule` : `/gig/${n.gig_id}`
  return '/dashboard'
}
