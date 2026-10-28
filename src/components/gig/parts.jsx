import { FileText, Image, Clock, Music, Layout, ClipboardList, Trash2 } from 'lucide-react'
import { useI18n } from '../../i18n'
import { colors, iconBtn, tint } from '../ui'
import { gigStatusLabel, gigTypeOf, labelStyle } from '../../lib/gigLabels'

// Pieces shared by the gig page tabs.

export const ASSET_TYPES = [
  { value: 'patch_list', icon: ClipboardList, color: 'var(--accent-text)' },
  { value: 'plot',       icon: Layout,        color: 'var(--info)' },
  { value: 'schedule',   icon: Clock,         color: 'var(--warn)' },
  { value: 'rider',      icon: Music,         color: 'var(--purple)' },
  { value: 'document',   icon: FileText,      color: 'var(--soft)' },
  { value: 'image',      icon: Image,         color: 'var(--pink)' },
]
export const assetType = type => ASSET_TYPES.find(a => a.value === type) || ASSET_TYPES[4]

export const STATUS_STYLE = {
  draft:     { color: 'var(--muted)', bg: 'color-mix(in srgb, var(--muted) 15%, transparent)' },
  confirmed: { color: 'var(--info)', bg: 'color-mix(in srgb, var(--info) 15%, transparent)' },
  active:    { color: 'var(--accent-text)', bg: 'color-mix(in srgb, var(--accent) 15%, transparent)' },
  completed: { color: 'var(--purple)', bg: 'color-mix(in srgb, var(--purple) 15%, transparent)' },
  archived:  { color: 'var(--soft)', bg: 'color-mix(in srgb, var(--soft) 10%, transparent)' },
}
export const GIG_STATUSES = Object.keys(STATUS_STYLE)

export function StatusBadge({ status }) {
  const { t } = useI18n()
  const st = STATUS_STYLE[status] || STATUS_STYLE.draft
  return (
    <span style={{
      fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '20px',
      color: st.color, background: st.bg, textTransform: 'uppercase', letterSpacing: '0.06em',
    }}>{t(`status.${status}`)}</span>
  )
}

// A gig's status as its organisation names it (docs/TOOLS_PLAN.md step 6), and its type
export function GigLabels({ gig }) {
  const { t } = useI18n()
  const own = gigStatusLabel(gig, t)
  const type = gigTypeOf(gig)
  const chip = { fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '20px', letterSpacing: '0.04em', overflowWrap: 'anywhere' }
  return (
    <>
      {own.custom
        ? <span style={{ ...chip, ...labelStyle(own.colour), textTransform: 'uppercase' }}>{own.name}</span>
        : <StatusBadge status={gig.status} />}
      {type && <span style={{ ...chip, ...labelStyle(type.colour), background: 'transparent', border: '1px solid currentColor' }}>{type.name}</span>}
    </>
  )
}

const AVATAR_COLORS = ['var(--accent-text)', 'var(--info)', 'var(--purple)', 'var(--warn)', 'var(--pink)', 'var(--sky)']

export function Avatar({ uid, name, size = 32 }) {
  const c = AVATAR_COLORS[uid ? uid.charCodeAt(0) % AVATAR_COLORS.length : 0]
  const initials = (name || '?').split(' ').map(x => x[0]).join('').toUpperCase().slice(0, 2)
  return (
    <div aria-hidden style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: tint(c, 19), border: `1px solid ${tint(c, 31)}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.35, fontWeight: 700, color: c,
    }}>{initials}</div>
  )
}

const ROLE_STYLE = {
  pm:     { color: 'var(--accent-text)', bg: 'color-mix(in srgb, var(--accent) 12%, transparent)' },
  crew:   { color: 'var(--muted)', bg: 'color-mix(in srgb, var(--muted) 12%, transparent)' },
  viewer: { color: 'var(--soft)', bg: 'color-mix(in srgb, var(--soft) 12%, transparent)' },
}

export function RoleBadge({ role, large = false }) {
  const { t } = useI18n()
  const st = ROLE_STYLE[role] || ROLE_STYLE.crew
  return (
    <span style={{
      fontSize: large ? '12px' : '11px', fontWeight: 700, padding: large ? '4px 10px' : '2px 8px', borderRadius: '20px',
      color: st.color, background: st.bg, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
    }}>{t(`gigRole.${role}`)}</span>
  )
}

export function FeedPost({ post, name, large = false, onDelete = null }) {
  const { t, ago } = useI18n()
  return (
    <div style={{
      padding: large ? '14px 16px' : '10px 12px', borderRadius: '12px', animation: 'fadeIn 0.3s ease',
      background: post.is_important ? 'color-mix(in srgb, var(--danger) 6%, transparent)' : 'color-mix(in srgb, var(--fg) min(100%, calc(3% * var(--line-k))), transparent)',
      border: post.is_important ? '1px solid color-mix(in srgb, var(--danger) 20%, transparent)' : '1px solid color-mix(in srgb, var(--fg) min(100%, calc(6% * var(--line-k))), transparent)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px 8px', marginBottom: '6px', flexWrap: 'wrap' }}>
        <Avatar uid={post.user_id} name={name} size={24} />
        <span style={{ fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap' }}>{name}</span>
        {post.is_important && (
          <span style={{
            fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '20px',
            color: colors.danger, background: 'color-mix(in srgb, var(--danger) 15%, transparent)', textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>{t('feed.important')}</span>
        )}
        <span style={{ fontSize: '11px', color: 'var(--muted)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>{ago(post.created_at)}</span>
        {onDelete && (
          <button onClick={onDelete} aria-label={t('feed.deleteUpdate')} title={t('common.delete')} style={{ ...iconBtn, padding: '2px' }}>
            <Trash2 size={13} />
          </button>
        )}
      </div>
      <p style={{ margin: 0, fontSize: large ? '14px' : '13px', color: colors.soft, lineHeight: 1.6, paddingLeft: '32px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {post.content}
      </p>
    </div>
  )
}

export function SectionTitle({ icon, title }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
      <span style={{ color: colors.muted, display: 'flex' }}>{icon}</span>
      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</span>
    </div>
  )
}

export function SmallBtn({ onClick, icon, label }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 11px', borderRadius: '8px', cursor: 'pointer',
      background: 'color-mix(in srgb, var(--accent) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', color: colors.accentText, fontSize: '12px', fontWeight: 600,
    }}>{icon} {label}</button>
  )
}

export function EmptyMini({ text }) {
  return <p style={{ color: 'var(--muted)', fontSize: '13px', textAlign: 'center', padding: '12px 0' }}>{text}</p>
}

export function TabHeader({ title, subtitle, action }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
      <div>
        <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>{title}</h2>
        {subtitle && <p style={{ color: colors.muted, fontSize: '13px' }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export const linkBtn = {
  background: 'none', border: 'none', cursor: 'pointer', color: colors.accentText, fontSize: '12px', fontWeight: 600,
  padding: '4px 0', display: 'block', width: '100%', textAlign: 'left',
}
