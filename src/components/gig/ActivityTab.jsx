import { formatDistanceToNow, format } from 'date-fns'
import { History } from 'lucide-react'
import { describeActivity } from '../../lib/activity'
import { colors } from '../ui'

// Who changed what on this gig, newest first. Entries are written by database triggers.
export default function ActivityTab({ entries, nameOf }) {
  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>Activity</h2>
      <p style={{ color: colors.muted, fontSize: '13px', marginBottom: '20px' }}>Uploads, crew and schedule changes on this gig.</p>
      {entries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: colors.muted }}>
          <History size={28} color={colors.accent} style={{ marginBottom: '12px' }} />
          <p style={{ fontSize: '14px' }}>Nothing yet. Changes from now on will show up here.</p>
        </div>
      ) : (
        <ol style={{ listStyle: 'none', display: 'flex', flexDirection: 'column' }}>
          {entries.map(e => (
            <li key={e.id} style={{ display: 'flex', gap: '12px', padding: '10px 0', borderBottom: `1px solid ${colors.border}` }}>
              <span aria-hidden style={{ width: '8px', height: '8px', borderRadius: '50%', background: colors.accent, marginTop: '7px', flexShrink: 0, opacity: 0.7 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', lineHeight: 1.5 }}>{describeActivity(e, nameOf)}</div>
                <time dateTime={e.created_at} title={format(new Date(e.created_at), 'd MMM yyyy, HH:mm')} style={{ fontSize: '12px', color: colors.muted }}>
                  {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                </time>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
