import { ArrowLeft, MapPin, Calendar, Users, RefreshCw, Pencil, Building2 } from 'lucide-react'
import { shortTime } from '../../lib/schedule'
import { useI18n } from '../../i18n'
import { colors } from '../ui'
import { StatusBadge } from './parts'

export const GIG_TABS = ['overview', 'schedule', 'assets', 'crew', 'feed', 'activity']

export default function GigHeader({ gig, crewCount, myMembership, canEdit, tab, setTab, counts, onBack, onRefresh, onEdit, company, orgRole }) {
  const { t, fmt } = useI18n()
  return (
    <>
      <div style={{ background: 'linear-gradient(180deg, rgba(30,200,120,0.07) 0%, transparent 100%)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '14px 16px 0' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          {/* Where this gig belongs and your place in it: the company, and your role there */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
            <button onClick={onBack} style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px',
              padding: '5px 10px', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px',
            }}><ArrowLeft size={14} /> {t('common.back')}</button>
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
                <h1 style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.4px' }}>{gig.name}</h1>
                <StatusBadge status={gig.status} />
              </div>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '13px', color: colors.muted }}>
                {gig.venue && <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><MapPin size={13} /> {gig.venue}</span>}
                {gig.start_date && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Calendar size={13} /> {fmt(gig.start_date, 'dd MMM yyyy')}
                    {gig.end_date && gig.end_date !== gig.start_date && ` → ${fmt(gig.end_date, 'dd MMM yyyy')}`}
                  </span>
                )}
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><Users size={13} /> {t('gig.crewCount', { count: crewCount })}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              {canEdit && (
                <button onClick={onEdit} style={{
                  display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 11px', borderRadius: '8px', cursor: 'pointer',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: colors.soft, fontSize: '12px', fontWeight: 600,
                }}><Pencil size={12} /> {t('gig.edit')}</button>
              )}
              {myMembership && (
                <div style={{ padding: '6px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${colors.border}`, fontSize: '12px', color: colors.muted, textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <div style={{ fontWeight: 700, color: '#fff', fontSize: '13px' }}>{myMembership.function_title || t(`gigRoleLong.${myMembership.role}`)}</div>
                  {myMembership.call_time && <div style={{ color: colors.accent, fontWeight: 600, marginTop: '2px' }}>{t('crew.call', { time: shortTime(myMembership.call_time) })}</div>}
                </div>
              )}
            </div>
          </div>

          <div role="tablist" aria-label={gig.name} style={{ display: 'flex', overflowX: 'auto', scrollbarWidth: 'none' }}>
            {GIG_TABS.map(key => (
              <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} style={{
                padding: '10px 16px', whiteSpace: 'nowrap', flexShrink: 0, border: 'none', background: 'none', cursor: 'pointer',
                fontSize: '14px', fontWeight: 600, color: tab === key ? colors.accent : colors.muted,
                borderBottom: tab === key ? `2px solid ${colors.accent}` : '2px solid transparent', position: 'relative', top: '1px',
              }}>
                {t(`gig.tab.${key}`)}
                {counts[key] > 0 && (
                  <span style={{
                    marginLeft: '6px', fontSize: '11px', fontWeight: 700, padding: '1px 6px', borderRadius: '10px',
                    background: key === 'assets' ? 'rgba(30,200,120,0.2)' : 'rgba(255,255,255,0.08)', color: key === 'assets' ? colors.accent : colors.muted,
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
