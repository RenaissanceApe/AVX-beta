// Human-readable activity log entries (pure apart from the current UI language; unit tested).
import { t } from '../i18n'
import { shortTime } from './schedule'

export function describeActivity(entry, nameOf) {
  const d = entry.details || {}
  const actor = entry.actor_id ? nameOf(entry.actor_id) : t('common.someone')
  const as = d.function_title ? t('activity.asRole', { role: d.function_title }) : ''
  switch (entry.action) {
    case 'asset_uploaded':    return t('activity.assetUploaded', { actor, name: d.name })
    case 'asset_new_version': return t('activity.assetNewVersion', { actor, name: d.name, version: d.version })
    case 'asset_deleted':     return t('activity.assetDeleted', { actor, name: d.name, version: d.version })
    case 'member_added':
      return d.user_id === entry.actor_id
        ? t('activity.joined', { actor, as })
        : t('activity.memberAdded', { actor, name: nameOf(d.user_id), as })
    case 'member_removed':
      return d.user_id === entry.actor_id
        ? t('activity.left', { actor })
        : t('activity.memberRemoved', { actor, name: nameOf(d.user_id) })
    case 'member_updated':
      return t('activity.memberUpdated', { actor, name: nameOf(d.user_id), call: d.call_time ? t('activity.callSuffix', { time: shortTime(d.call_time) }) : '' })
    case 'schedule_insert':   return t('activity.scheduleInsert', { actor, title: d.title })
    case 'schedule_update':   return t('activity.scheduleUpdate', { actor, title: d.title })
    case 'schedule_delete':   return t('activity.scheduleDelete', { actor, title: d.title })
    case 'gig_status':        return t('activity.status', { actor, from: t(`status.${d.from}`), to: t(`status.${d.to}`) })
    case 'gig_updated':       return t('activity.updated', { actor, fields: (d.changed || []).map(f => t(`activity.field.${f}`)).join(', ') })
    default:                  return `${actor}: ${entry.action}`
  }
}
