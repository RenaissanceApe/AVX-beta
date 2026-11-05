import { ArrowLeft, MapPin, Calendar, Users, RefreshCw, Pencil, Building2 } from 'lucide-react'
import { shortTime } from '../../lib/schedule'
import { useI18n } from '../../i18n'
import { colors, btn, mono, CallChip } from '../ui'
import { GigLabels } from './parts'
import { PageHelp } from '../help/HelpParts'

export const GIG_TABS = ['overview', 'schedule', 'tasks', 'assets', 'crew', 'equipment', 'tools', 'chat', 'updates']
// Older links still work: Feed and Activity are now the two halves of Updates (FIELD_TOOLS.md, F1)
export const TAB_ALIASES = { feed: 'updates', activity: 'updates' }

export default function GigHeader({ gig, crewCount, myMembership, canEdit, tab, setTab, tabs = GIG_TABS, counts, onBack, onRefresh, onEdit, company, orgRole }) {
  const { t, fmt } = useI18n()
  return (
    <>
      <div style={{ background: 'var(--bg)', borderBottom: '1px solid var(--line)', padding: '14px 16px 0' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          {/* Where this gig belongs and your place in it: the company, and your role there */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
            <button onClick={onBack} style={{ ...btn, padding: '5px 10px', fontWeight: 500 }}><ArrowLeft size={14} /> {t('common.back')}</button>
            {company && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: colors.soft }}>
                <Building2 size={13} /> {company}{orgRole ? ` · ${t(`orgRole.${orgRole}`)}` : ''}
              </span>
            )}
            <button onClick={onRefresh} aria-label={t('common.refresh')} title={t('common.refresh')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: colors.muted, display: 'flex', padding: '6px' }}>
              <RefreshCw size={15} />
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '220px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
                <h1 style={{ fontSize: '24px', lineHeight: '30px', fontWeight: 700 }}>{gig.name}</h1>
                <GigLabels gig={gig} />
                <PageHelp page="gig" />
              </div>
              <div style={{ display: 'flex', gap: '6px 16px', flexWrap: 'wrap', fontSize: '13px', color: colors.muted }}>
                {gig.venue && <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-2)' }}><MapPin size={14} aria-hidden="true" /> {gig.venue}</span>}
                {gig.start_date && (
                  <span style={{ ...mono, display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-2)' }}>
                    <Calendar size={14} aria-hidden="true" /> {fmt(gig.start_date, 'dd MMM yyyy')}
                    {gig.end_date && gig.end_date !== gig.start_date && ` → ${fmt(gig.end_date, 'dd MMM yyyy')}`}
                  </span>
                )}
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-2)' }}><Users size={14} aria-hidden="true" /> {t('gig.crewCount', { count: crewCount })}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              {canEdit && (
                <button onClick={onEdit} style={btn}><Pencil size={14} /> {t('gig.edit')}</button>
              )}
              {myMembership && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', fontSize: '12px', whiteSpace: 'nowrap' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-2)', fontSize: '13px' }}>{myMembership.function_title || t(`gigRoleLong.${myMembership.role}`)}</div>
                  {myMembership.call_time && <CallChip me label={t('crew.callKey')} time={shortTime(myMembership.call_time)} title={t('crew.call', { time: shortTime(myMembership.call_time) })} />}
                </div>
              )}
            </div>
          </div>

          {/* Scrolls sideways only: without overflow-y hidden, phones let the tabs (1 px taller than the
              strip, for the underline) be dragged up and down too */}
          <div role="tablist" aria-label={gig.name} style={{ display: 'flex', overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none' }}>
            {tabs.map(key => (
              <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} style={{
                padding: '12px 14px', minHeight: '44px', whiteSpace: 'nowrap', flexShrink: 0, border: 'none', background: 'none', cursor: 'pointer',
                fontSize: '14px', fontWeight: 500, color: tab === key ? 'var(--text)' : colors.muted,
                borderBottom: tab === key ? `2px solid ${colors.accent}` : '2px solid transparent', position: 'relative', top: '1px', transition: 'color .15s, border-color .25s',
              }}>
                {t(`gig.tab.${key}`)}
                {counts[key] > 0 && (
                  <span style={{
                    ...mono, marginLeft: '6px', fontSize: '11px', fontWeight: 700, padding: '1px 5px',
                    border: '1px solid var(--line)', color: key === 'assets' || key === 'chat' ? colors.accentText : colors.muted,
                  }}>{counts[key]}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
