import { FileText, Image, Clock, Music, Layout, ClipboardList, Trash2 } from 'lucide-react'
import { useI18n } from '../../i18n'
import { colors, iconBtn, StatusBadge as UiStatusBadge, LabelChip, Avatar as UiAvatar } from '../ui'
import { gigStatusLabel, gigTypeOf } from '../../lib/gigLabels'

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

// Built-in gig statuses as StatusBadge tones (DESIGN.md: Draft dashed, Confirmed ok, Active info, Completed/Archived off)
export const STATUS_TONE = { draft: 'draft', confirmed: 'ok', active: 'info', completed: 'off', archived: 'off' }
export const GIG_STATUSES = Object.keys(STATUS_TONE)

export function StatusBadge({ status }) {
  const { t } = useI18n()
  return <UiStatusBadge tone={STATUS_TONE[status] || 'draft'}>{t(`status.${status}`)}</UiStatusBadge>
}

// A gig's status as its organisation names it (docs/TOOLS_PLAN.md step 6), and its type
export function GigLabels({ gig }) {
  const { t } = useI18n()
  const own = gigStatusLabel(gig, t)
  const type = gigTypeOf(gig)
  return (
    <>
      {own.custom
        ? <UiStatusBadge tone={STATUS_TONE[gig.status] || 'draft'} colour={own.colour}>{own.name}</UiStatusBadge>
        : <StatusBadge status={gig.status} />}
      {type && <LabelChip colour={type.colour}>{type.name}</LabelChip>}
    </>
  )
}

// Square initials, never coloured (uid kept so callers don't change)
// eslint-disable-next-line no-unused-vars
export function Avatar({ uid, name, size = 32 }) {
  return <UiAvatar name={name} size={size} />
}

export function RoleBadge({ role, large = false }) {
  const { t } = useI18n()
  return <LabelChip role large={large}>{t(`gigRole.${role}`)}</LabelChip>
}

export function FeedPost({ post, name, large = false, onDelete = null }) {
  const { t, ago } = useI18n()
  return (
    <div style={{
      padding: large ? '14px 16px' : '10px 12px', animation: 'fadeIn 0.3s ease',
      background: post.is_important ? 'var(--danger-soft)' : 'var(--fill)',
      border: post.is_important ? '1px solid var(--danger)' : '1px solid var(--line)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px 8px', marginBottom: '6px', flexWrap: 'wrap' }}>
        <Avatar uid={post.user_id} name={name} size={24} />
        <span style={{ fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap' }}>{name}</span>
        {post.is_important && (
          <span style={{
            fontSize: '10px', fontWeight: 700, padding: '2px 7px', 
            color: colors.danger, background: 'var(--danger-soft)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.05em',
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
      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.16em' }}>{title}</span>
    </div>
  )
}

export function SmallBtn({ onClick, icon, label }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: '6px', height: '28px', padding: '0 10px', cursor: 'pointer',
      background: 'transparent', border: '1px solid var(--line-strong)', color: 'var(--text)', fontSize: '12px', fontWeight: 600,
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
