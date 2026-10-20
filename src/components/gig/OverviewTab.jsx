import { FileText, Users, MessageSquare, Plus, UserPlus, ArrowRight, Eye, CalendarClock } from 'lucide-react'
import { shortTime, groupByDay } from '../../lib/schedule'
import { localToday } from '../../lib/gigs'
import { useI18n } from '../../i18n'
import { card, colors, tint } from '../ui'
import { assetType, Avatar, RoleBadge, FeedPost, SectionTitle, SmallBtn, EmptyMini, linkBtn } from './parts'

// Upcoming schedule items: today and later, at most `limit`.
function upcoming(schedule, limit = 4) {
  const today = localToday()
  return groupByDay(schedule.filter(s => s.day >= today)).flatMap(g => g.items).slice(0, limit)
}

export default function OverviewTab({ gig, assets, members, posts, schedule, canUpload, isPM, nameOf, setTab, openUpload, openInvite, onOpenAsset }) {
  const { t, fmt } = useI18n()
  const next = upcoming(schedule)
  const panel = { ...card, padding: '18px 20px', borderRadius: '16px' }
  const header = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', animation: 'fadeIn 0.3s ease' }}>
      {gig.description && (
        <div style={{ ...panel, gridColumn: '1 / -1' }}>
          <div style={{ marginBottom: '10px' }}><SectionTitle icon={<FileText size={14} />} title={t('overview.description')} /></div>
          <p style={{ color: colors.soft, fontSize: '14px', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{gig.description}</p>
        </div>
      )}

      <div style={{ ...panel, gridColumn: '1 / -1' }}>
        <div style={header}>
          <SectionTitle icon={<CalendarClock size={14} />} title={t('overview.comingUp')} />
          <SmallBtn onClick={() => setTab('schedule')} icon={<ArrowRight size={12} />} label={t('overview.fullSchedule')} />
        </div>
        {next.length === 0 ? <EmptyMini text={t('overview.noUpcoming')} /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {next.map(s => (
              <div key={s.id} style={{ display: 'flex', gap: '12px', fontSize: '14px', alignItems: 'baseline' }}>
                <span style={{ color: colors.muted, fontSize: '12px', minWidth: '78px' }}>{fmt(s.day, 'EEE d MMM')}</span>
                <span style={{ color: colors.accentText, fontWeight: 700, minWidth: '44px', fontVariantNumeric: 'tabular-nums' }}>{shortTime(s.start_time)}</span>
                <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={panel}>
        <div style={header}>
          <SectionTitle icon={<FileText size={14} />} title={t('gig.tab.assets')} />
          {canUpload && <SmallBtn onClick={openUpload} icon={<Plus size={12} />} label={t('common.upload')} />}
        </div>
        {assets.length === 0 ? <EmptyMini text={t('overview.noAssets')} /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {assets.slice(0, 4).map(a => {
              const cfg = assetType(a.type)
              const Icon = cfg.icon
              return (
                <button key={a.id} onClick={() => onOpenAsset(a)} style={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '9px', textAlign: 'left',
                  background: 'color-mix(in srgb, var(--fg) min(100%, calc(3% * var(--line-k))), transparent)', border: '1px solid color-mix(in srgb, var(--fg) min(100%, calc(6% * var(--line-k))), transparent)', cursor: 'pointer', color: 'var(--text)', width: '100%',
                }}>
                  <span style={{ width: '28px', height: '28px', borderRadius: '7px', flexShrink: 0, background: tint(cfg.color, 9), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={14} color={cfg.color} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</span>
                    <span style={{ display: 'block', fontSize: '11px', color: colors.muted }}>v{a.version} · {t(`assetType.${a.type}`)}</span>
                  </span>
                  <Eye size={13} color="var(--muted)" />
                </button>
              )
            })}
            {assets.length > 4 && <button onClick={() => setTab('assets')} style={{ ...linkBtn, marginTop: '4px' }}>{t('overview.viewAllAssets', { count: assets.length })}</button>}
          </div>
        )}
      </div>

      <div style={panel}>
        <div style={header}>
          <SectionTitle icon={<Users size={14} />} title={t('gig.tab.crew')} />
          {isPM && <SmallBtn onClick={openInvite} icon={<UserPlus size={12} />} label={t('common.invite')} />}
        </div>
        {members.length === 0 ? <EmptyMini text={t('overview.noCrew')} /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {members.slice(0, 5).map(m => (
              <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Avatar uid={m.user_id} name={nameOf(m.user_id)} size={30} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>{nameOf(m.user_id)}</div>
                  <div style={{ fontSize: '11px', color: colors.muted }}>
                    {m.function_title || t(`gigRoleLong.${m.role}`)}
                    {m.call_time && <span style={{ color: colors.accentText, marginLeft: '6px' }}>· {shortTime(m.call_time)}</span>}
                  </div>
                </div>
                <RoleBadge role={m.role} />
              </div>
            ))}
            {members.length > 5 && <button onClick={() => setTab('crew')} style={{ ...linkBtn, marginTop: '4px' }}>{t('overview.viewAllCrew', { count: members.length })}</button>}
          </div>
        )}
      </div>

      <div style={{ ...panel, gridColumn: '1 / -1' }}>
        <div style={header}>
          <SectionTitle icon={<MessageSquare size={14} />} title={t('overview.recentUpdates')} />
          <SmallBtn onClick={() => setTab('feed')} icon={<ArrowRight size={12} />} label={t('overview.fullFeed')} />
        </div>
        {posts.length === 0 ? <EmptyMini text={t('overview.noUpdates')} /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {posts.slice(-3).map(p => <FeedPost key={p.id} post={p} name={nameOf(p.user_id)} />)}
          </div>
        )}
      </div>
    </div>
  )
}
