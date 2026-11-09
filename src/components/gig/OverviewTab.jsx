import { Plus, UserPlus, ChevronRight } from 'lucide-react'
import { shortTime, groupByDay } from '../../lib/schedule'
import { localToday } from '../../lib/gigs'
import { useI18n } from '../../i18n'
import { useCustomFields } from '../../lib/customFields'
import { CustomFieldList } from '../CustomFields'
import { btn, colors, mono, Section } from '../ui'
import { assetType, Avatar, RoleBadge, FeedPost, EmptyMini, linkBtn, rowLine } from './parts'

// Upcoming schedule items: today and later, at most `limit`.
function upcoming(schedule, limit = 4) {
  const today = localToday()
  return groupByDay(schedule.filter(s => s.day >= today)).flatMap(g => g.items).slice(0, limit)
}

// A link on a section's right that opens another tab (the tabs are not routes)
function TabLink({ onClick, children }) {
  return (
    <button type="button" onClick={onClick} className="avx-section__link" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', fontSize: '13px' }}>
      {children} <ChevronRight size={14} aria-hidden="true" />
    </button>
  )
}

const smallBtn = { ...btn, padding: '4px 12px' }
const row = i => ({ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minHeight: '52px', padding: 'var(--space-2) 0', ...rowLine(i) })

// The gig's Overview (DESIGN.md "Room to breathe"): sections on the page ground, most important first —
// what's coming up, what the gig is, who's on it, its files, then the latest posts.
export default function OverviewTab({ gig, assets, members, posts, schedule, canUpload, isPM, nameOf, setTab, openUpload, openInvite, onOpenAsset }) {
  const { t, fmt } = useI18n()
  const next = upcoming(schedule)
  const { fields } = useCustomFields(gig.org_id, 'gig')
  const customFilled = fields.some(f => gig.custom_values?.[f.id] != null)

  return (
    <>
      <Section id="ov-coming" title={t('overview.comingUp')} aside={<TabLink onClick={() => setTab('schedule')}>{t('overview.fullSchedule')}</TabLink>}>
        {next.length === 0 ? <EmptyMini text={t('overview.noUpcoming')} /> : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {next.map((s, i) => (
              <li key={s.id} style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'baseline', padding: 'var(--space-3) 0', flexWrap: 'wrap', ...rowLine(i) }}>
                <span style={{ ...mono, color: colors.muted, fontSize: '13px', minWidth: '96px' }}>{fmt(s.day, 'EEE d MMM')}</span>
                <span style={{ ...mono, fontWeight: 700, fontSize: '14px', minWidth: '48px' }}>{shortTime(s.start_time)}</span>
                <span style={{ fontSize: '14px', fontWeight: 600, flex: '1 1 160px', minWidth: 0, overflowWrap: 'anywhere' }}>{s.title}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {gig.description && (
        <Section id="ov-description" title={t('overview.description')}>
          <p style={{ color: colors.soft, fontSize: '14px', lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: 0 }}>{gig.description}</p>
        </Section>
      )}

      {customFilled && (
        <Section id="ov-details" title={t('custom.details')}>
          <CustomFieldList fields={fields} values={gig.custom_values} />
        </Section>
      )}

      <Section id="ov-crew" title={t('gig.tab.crew')}
        aside={isPM ? <button type="button" onClick={openInvite} style={smallBtn}><UserPlus size={14} aria-hidden="true" /> {t('common.invite')}</button> : null}>
        {members.length === 0 ? <EmptyMini text={t('overview.noCrew')} /> : (
          <>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {members.slice(0, 5).map((m, i) => (
                <li key={m.user_id} style={row(i)}>
                  <Avatar uid={m.user_id} name={nameOf(m.user_id)} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: 600 }}>{nameOf(m.user_id)}</div>
                    <div style={{ fontSize: '13px', color: colors.muted }}>
                      {m.function_title || t(`gigRoleLong.${m.role}`)}
                      {m.call_time && <span style={{ ...mono, color: 'var(--text-2)' }}> · {shortTime(m.call_time)}</span>}
                    </div>
                  </div>
                  <RoleBadge role={m.role} />
                </li>
              ))}
            </ul>
            {members.length > 5 && <button type="button" onClick={() => setTab('crew')} style={linkBtn}>{t('overview.viewAllCrew', { count: members.length })} <ChevronRight size={14} aria-hidden="true" /></button>}
          </>
        )}
      </Section>

      <Section id="ov-files" title={t('gig.tab.assets')}
        aside={canUpload ? <button type="button" onClick={openUpload} style={smallBtn}><Plus size={14} aria-hidden="true" /> {t('common.upload')}</button> : null}>
        {assets.length === 0 ? <EmptyMini text={t('overview.noAssets')} /> : (
          <>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {assets.slice(0, 4).map((a, i) => {
                const Icon = assetType(a.type).icon
                return (
                  <li key={a.id} style={rowLine(i)}>
                    <button type="button" onClick={() => onOpenAsset(a)} style={{ ...row(0), width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', font: 'inherit' }}>
                      <Icon size={16} color="var(--muted)" aria-hidden="true" style={{ flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</span>
                        <span style={{ display: 'block', fontSize: '13px', color: colors.muted }}>v{a.version} · {t(`assetType.${a.type}`)}</span>
                      </span>
                      <ChevronRight size={16} color="var(--muted)" aria-hidden="true" style={{ flexShrink: 0 }} />
                    </button>
                  </li>
                )
              })}
            </ul>
            {assets.length > 4 && <button type="button" onClick={() => setTab('assets')} style={linkBtn}>{t('overview.viewAllAssets', { count: assets.length })} <ChevronRight size={14} aria-hidden="true" /></button>}
          </>
        )}
      </Section>

      <Section id="ov-updates" title={t('overview.recentUpdates')} aside={<TabLink onClick={() => setTab('updates')}>{t('overview.fullFeed')}</TabLink>}>
        {posts.length === 0 ? <EmptyMini text={t('overview.noUpdates')} /> : (
          <div>
            {posts.slice(-3).map((p, i) => <div key={p.id} style={rowLine(i)}><FeedPost post={p} name={nameOf(p.user_id)} /></div>)}
          </div>
        )}
      </Section>
    </>
  )
}
