import { t } from '../../i18n'

export const STATUS_COLORS = {
  draft:    { color: 'var(--soft)', bg: 'color-mix(in srgb, var(--soft) 12%, transparent)' },
  sent:     { color: 'var(--info)', bg: 'color-mix(in srgb, var(--info) 15%, transparent)' },
  accepted: { color: 'var(--accent-text)', bg: 'color-mix(in srgb, var(--accent) 15%, transparent)' },
  declined: { color: 'var(--danger)', bg: 'color-mix(in srgb, var(--danger) 12%, transparent)' },
}

export function QuoteStatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.draft
  return (
    <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '20px', color: c.color, background: c.bg, whiteSpace: 'nowrap' }}>
      {t(`quoteStatus.${status}`)}
    </span>
  )
}
