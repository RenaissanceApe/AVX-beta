import { FileText, Image, Clock, Music, Layout, ClipboardList, Trash2 } from 'lucide-react'
import { useI18n } from '../../i18n'
import { colors, iconBtn } from '../ui'

// Pieces shared by the gig page tabs.

export const ASSET_TYPES = [
  { value: 'patch_list', icon: ClipboardList, color: '#1EC878' },
  { value: 'plot',       icon: Layout,        color: '#60A5FA' },
  { value: 'schedule',   icon: Clock,         color: '#F59E0B' },
  { value: 'rider',      icon: Music,         color: '#A78BFA' },
  { value: 'document',   icon: FileText,      color: '#6B7280' },
  { value: 'image',      icon: Image,         color: '#F472B6' },
]
export const assetType = type => ASSET_TYPES.find(a => a.value === type) || ASSET_TYPES[4]

export const STATUS_STYLE = {
  draft:     { color: '#7D93A9', bg: 'rgba(74,96,112,0.15)' },
  confirmed: { color: '#60A5FA', bg: 'rgba(59,130,246,0.15)' },
  active:    { color: '#1EC878', bg: 'rgba(30,200,120,0.15)' },
  completed: { color: '#A78BFA', bg: 'rgba(139,92,246,0.15)' },
  archived:  { color: '#374151', bg: 'rgba(55,65,81,0.1)' },
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

const AVATAR_COLORS = ['#1EC878', '#60A5FA', '#A78BFA', '#F59E0B', '#F472B6', '#06B6D4']

export function Avatar({ uid, name, size = 32 }) {
  const c = AVATAR_COLORS[uid ? uid.charCodeAt(0) % AVATAR_COLORS.length : 0]
  const initials = (name || '?').split(' ').map(x => x[0]).join('').toUpperCase().slice(0, 2)
  return (
    <div aria-hidden style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `${c}30`, border: `1px solid ${c}50`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.35, fontWeight: 700, color: c,
    }}>{initials}</div>
  )
}

const ROLE_STYLE = {
  pm:     { color: '#1EC878', bg: 'rgba(30,200,120,0.12)' },
  crew:   { color: '#7D93A9', bg: 'rgba(74,96,112,0.12)' },
  viewer: { color: '#374151', bg: 'rgba(55,65,81,0.12)' },
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
      background: post.is_important ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.03)',
      border: post.is_important ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px 8px', marginBottom: '6px', flexWrap: 'wrap' }}>
        <Avatar uid={post.user_id} name={name} size={24} />
        <span style={{ fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap' }}>{name}</span>
        {post.is_important && (
          <span style={{
            fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '20px',
            color: colors.danger, background: 'rgba(239,68,68,0.15)', textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>{t('feed.important')}</span>
        )}
        <span style={{ fontSize: '11px', color: '#7D93A9', marginLeft: 'auto', whiteSpace: 'nowrap' }}>{ago(post.created_at)}</span>
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
      <span style={{ fontSize: '13px', fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</span>
    </div>
  )
}

export function SmallBtn({ onClick, icon, label }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 11px', borderRadius: '8px', cursor: 'pointer',
      background: 'rgba(30,200,120,0.1)', border: '1px solid rgba(30,200,120,0.2)', color: colors.accent, fontSize: '12px', fontWeight: 600,
    }}>{icon} {label}</button>
  )
}

export function EmptyMini({ text }) {
  return <p style={{ color: '#7D93A9', fontSize: '13px', textAlign: 'center', padding: '12px 0' }}>{text}</p>
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
  background: 'none', border: 'none', cursor: 'pointer', color: colors.accent, fontSize: '12px', fontWeight: 600,
  padding: '4px 0', display: 'block', width: '100%', textAlign: 'left',
}
