import { useI18n } from '../../i18n'
import { colors, tint } from '../ui'
import FeedTab from './FeedTab'
import ActivityTab from './ActivityTab'

// Updates (docs/FIELD_TOOLS.md, F1): the gig's posts (the old Feed) and its history (the old
// Activity) in one tab, so the gig keeps eight tabs when Tools arrives.
export default function UpdatesTab({ view, setView, feed, activity }) {
  const { t } = useI18n()
  const choice = on => ({
    padding: '8px 14px', borderRadius: '999px', fontSize: '14px', fontWeight: 700, cursor: 'pointer',
    border: `1px solid ${on ? colors.accent : colors.border}`, background: on ? tint(colors.accent, 12) : 'transparent',
    color: on ? 'var(--text)' : colors.soft,
  })
  return (
    <div>
      <div role="radiogroup" aria-label={t('updates.view')} style={{ display: 'flex', gap: '6px', marginBottom: '18px' }}>
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
