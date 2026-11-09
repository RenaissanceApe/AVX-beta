import { FileText, Image, Clock, Music, Layout, ClipboardList, Trash2 } from 'lucide-react'
import { useI18n } from '../../i18n'
import { colors, iconBtn, StatusBadge as UiStatusBadge, LabelChip, Avatar as UiAvatar, MoreMenu } from '../ui'
import { Hint } from '../help/HelpParts'
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

// A post in a list: a hairline row, not a card (DESIGN.md "One box deep"). Important posts keep the danger wash.
export function FeedPost({ post, name, large = false, onDelete = null }) {
  const { t, ago } = useI18n()
  return (
    <div style={{
      padding: post.is_important ? 'var(--space-3)' : 'var(--space-3) 0', animation: 'fadeIn 0.3s ease',
      background: post.is_important ? 'var(--danger-soft)' : 'transparent',
      borderLeft: post.is_important ? '2px solid var(--danger)' : 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px 8px', marginBottom: 'var(--space-1)', flexWrap: 'wrap' }}>
        <Avatar uid={post.user_id} name={name} size={24} />
        <span style={{ fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap' }}>{name}</span>
        {post.is_important && (
          <span style={{
            fontSize: '11px', fontWeight: 700, color: colors.danger, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.16em',
          }}>{t('feed.important')}</span>
        )}
        <span style={{ fontSize: '13px', color: 'var(--muted)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>{ago(post.created_at)}</span>
        {onDelete && (
          <button onClick={onDelete} aria-label={t('feed.deleteUpdate')} title={t('common.delete')} style={{ ...iconBtn, padding: '4px' }}>
            <Trash2 size={14} />
          </button>
        )}
      </div>
      <p style={{ margin: 0, fontSize: large ? '14px' : '13px', color: colors.soft, lineHeight: 1.6, paddingLeft: '32px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {post.content}
      </p>
    </div>
  )
}

// Rows separated by one hairline (lists are rows, not a card per row)
export const rowLine = (i) => (i > 0 ? { borderTop: '1px solid var(--line)' } : {})

export function EmptyMini({ text }) {
  return <p style={{ color: 'var(--muted)', fontSize: '13px', padding: 'var(--space-2) 0', margin: 0 }}>{text}</p>
}

// The top of a gig tab: a 16px heading, an optional short line (a count), the ⓘ for what the tab is for,
// one primary action and at most one more in view; the rest go in the ⋯ menu (DESIGN.md "Room to breathe" 4, 5).
//   <TabHeader title="Crew" subtitle="4 crew" hint="What this tab is for" action={<button style={btnPrimary}>Invite</button>}
//     secondary={<button style={btn}>Crew call</button>} more={[{ label: 'Post a job', onClick }]} />
export function TabHeader({ title, subtitle, hint, action, secondary, more = [] }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: 'var(--space-5)' }}>
      <div style={{ minWidth: 0 }}>
        <h2 className="avx-section__title">{title}{hint && <Hint text={hint} label={title} />}</h2>
        {subtitle && <p style={{ color: colors.muted, fontSize: '13px', margin: 0 }}>{subtitle}</p>}
      </div>
      {(action || secondary || more.length > 0) && (
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
          {secondary}
          {action}
          <MoreMenu items={more} />
        </div>
      )}
    </div>
  )
}

export const linkBtn = {
  background: 'none', border: 'none', cursor: 'pointer', color: colors.accentText, fontSize: '13px', fontWeight: 600,
  padding: 'var(--space-2) 0', display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', textAlign: 'left',
}
