import { History } from 'lucide-react'
import { describeActivity } from '../../lib/activity'
import { useI18n } from '../../i18n'
import { colors } from '../ui'
import EmptyState from '../EmptyState'
import { TabHeader } from './parts'

// Who changed what on this gig, newest first. Entries are written by database triggers.
export default function ActivityTab({ entries, nameOf }) {
  const { t, fmt, ago } = useI18n()
  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <TabHeader title={t('gig.tab.activity')} hint={t('activity.subtitle')} />
      {entries.length === 0 ? (
        <EmptyState compact icon={<History size={24} />} title={t('activity.empty')} />
      ) : (
        <ol style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', margin: 0, padding: 0 }}>
          {entries.map(e => (
            <li key={e.id} style={{ display: 'flex', gap: '12px', padding: 'var(--space-3) 0', borderBottom: `1px solid ${colors.border}` }}>
              <span aria-hidden style={{ width: '8px', height: '8px', background: colors.lineStrong, marginTop: '8px', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', lineHeight: 1.5 }}>{describeActivity(e, nameOf)}</div>
                <time dateTime={e.created_at} title={fmt(e.created_at, 'd MMM yyyy, HH:mm')} style={{ fontSize: '13px', color: colors.muted }}>
                  {ago(e.created_at)}
                </time>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
