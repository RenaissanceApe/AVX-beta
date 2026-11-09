import { useI18n } from '../../i18n'
import { colors } from '../ui'
import FeedTab from './FeedTab'
import ActivityTab from './ActivityTab'

// Updates (docs/FIELD_TOOLS.md, F1): the gig's posts (the old Feed) and its history (the old
// Activity) in one tab, so the gig keeps eight tabs when Tools arrives.
export default function UpdatesTab({ view, setView, feed, activity }) {
  const { t } = useI18n()
  // The chosen view is text + a 2px accent bar, never a fill (DESIGN.md "One loud thing")
  const choice = on => ({
    padding: '8px 12px', minHeight: '44px', fontSize: '14px', fontWeight: 500, cursor: 'pointer', background: 'none',
    border: 'none', borderBottom: `2px solid ${on ? colors.accent : 'transparent'}`, color: on ? 'var(--text)' : colors.muted,
    position: 'relative', top: '1px',
  })
  return (
    <div>
      <div role="radiogroup" aria-label={t('updates.view')} style={{ display: 'flex', gap: '4px', marginBottom: 'var(--space-5)', borderBottom: `1px solid ${colors.border}` }}>
        {['posts', 'history'].map(v => (
          <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => setView(v)} style={choice(view === v)}>
            {t(`updates.${v}`)}
          </button>
        ))}
      </div>
      {view === 'history' ? <ActivityTab {...activity} /> : <FeedTab {...feed} />}
    </div>
  )
}
