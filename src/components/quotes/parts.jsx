import { t } from '../../i18n'

export const STATUS_COLORS = {
  draft:    { color: '#8A9BAE', bg: 'rgba(138,155,174,0.12)' },
  sent:     { color: '#60A5FA', bg: 'rgba(59,130,246,0.15)' },
  accepted: { color: '#1EC878', bg: 'rgba(30,200,120,0.15)' },
  declined: { color: '#F87171', bg: 'rgba(248,113,113,0.12)' },
}

export function QuoteStatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.draft
  return (
    <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '20px', color: c.color, background: c.bg, whiteSpace: 'nowrap' }}>
      {t(`quoteStatus.${status}`)}
    </span>
  )
}
