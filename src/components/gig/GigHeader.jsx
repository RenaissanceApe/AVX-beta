import { ArrowLeft, RefreshCw, Pencil } from 'lucide-react'
import { shortTime } from '../../lib/schedule'
import { useI18n } from '../../i18n'
import { colors, btn, iconBtn, mono, CallChip, PageHeader } from '../ui'
import { GigLabels } from './parts'
import { PageHelp } from '../help/HelpParts'

export const GIG_TABS = ['overview', 'schedule', 'tasks', 'assets', 'crew', 'equipment', 'transport', 'tools', 'chat', 'updates']
// Older links still work: Feed and Activity are now the two halves of Updates (FIELD_TOOLS.md, F1)
export const TAB_ALIASES = { feed: 'updates', activity: 'updates' }

// The gig's header (DESIGN.md "Room to breathe"): back and where the gig belongs, then the title with its
// labels and your call, one line (venue · dates · your role), Edit (in ⋯ on a phone), then the tabs.
export default function GigHeader({ gig, myMembership, canEdit, tab, setTab, tabs = GIG_TABS, counts, onBack, onRefresh, onEdit, company, orgRole }) {
  const { t, fmt } = useI18n()
  const dates = gig.start_date
    ? fmt(gig.start_date, 'dd MMM yyyy') + (gig.end_date && gig.end_date !== gig.start_date ? ` → ${fmt(gig.end_date, 'dd MMM yyyy')}` : '')
    : null
  const myRole = myMembership ? (myMembership.function_title || t(`gigRoleLong.${myMembership.role}`)) : null
  const line = [gig.venue, dates, myRole].filter(Boolean)
  return (
    <div style={{ background: 'var(--bg)', borderBottom: '1px solid var(--line)', padding: 'var(--space-4) var(--gutter) 0' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-5)', flexWrap: 'wrap' }}>
          <button type="button" onClick={onBack} style={{ ...btn, padding: '4px 12px', fontWeight: 500 }}><ArrowLeft size={14} aria-hidden="true" /> {t('common.back')}</button>
          {company && <span style={{ fontSize: '13px', color: colors.muted }}>{company}{orgRole ? ` · ${t(`orgRole.${orgRole}`)}` : ''}</span>}
          <button type="button" onClick={onRefresh} aria-label={t('common.refresh')} title={t('common.refresh')} style={{ ...iconBtn, marginLeft: 'auto' }}>
            <RefreshCw size={16} aria-hidden="true" />
          </button>
        </div>
        <PageHeader className="avx-gig-head" title={gig.name}
          after={<>
            <GigLabels gig={gig} />
            {/* Your call, without the green fill: the screen's one green thing is its primary action */}
            {myMembership?.call_time && <CallChip label={t('crew.callKey')} time={shortTime(myMembership.call_time)} title={t('crew.call', { time: shortTime(myMembership.call_time) })} />}
          </>}
          help={<PageHelp page="gig" />}
          line={line.length > 0 && (
            <span>
              {line.map((part, i) => (
                <span key={i} style={{ color: 'var(--text-2)' }}>{i > 0 && ' · '}<span style={part === dates ? { ...mono, whiteSpace: 'nowrap' } : undefined}>{part}</span></span>
              ))}
            </span>
          )}
          secondary={canEdit ? [{ label: t('gig.edit'), icon: <Pencil size={14} aria-hidden="true" />, onClick: onEdit }] : []} />

        {/* Scrolls sideways only: without overflow-y hidden, phones let the tabs (1 px taller than the
            strip, for the underline) be dragged up and down too */}
        <div role="tablist" aria-label={gig.name} style={{ display: 'flex', overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none', margin: '0 calc(-1 * var(--space-4))' }}>
          {tabs.map(key => (
            <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} style={{
              padding: '12px 16px', minHeight: '44px', whiteSpace: 'nowrap', flexShrink: 0, border: 'none', background: 'none', cursor: 'pointer',
              fontSize: '14px', fontWeight: 500, color: tab === key ? 'var(--text)' : colors.muted,
              borderBottom: tab === key ? `2px solid ${colors.accent}` : '2px solid transparent', position: 'relative', top: '1px', transition: 'color .15s, border-color .25s',
            }}>
              {t(`gig.tab.${key}`)}
              {counts[key] > 0 && <span style={{ ...mono, marginLeft: 'var(--space-2)', fontSize: '13px', color: colors.muted }}>{counts[key]}</span>}
            </button>
          ))}
        </div>
      </div>
      <style>{'.avx-gig-head { margin-bottom: var(--space-5); }'}</style>
    </div>
  )
}
