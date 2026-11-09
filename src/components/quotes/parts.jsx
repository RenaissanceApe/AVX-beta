import { t } from '../../i18n'
import { StatusBadge } from '../ui'

// Quote statuses as StatusBadge tones: Draft dashed, Sent info, Accepted ok, Declined danger
export const STATUS_TONE = { draft: 'draft', sent: 'info', accepted: 'ok', declined: 'danger', cancelled: 'draft' }

export function QuoteStatusBadge({ status }) {
  return <StatusBadge tone={STATUS_TONE[status] || 'draft'}>{t(`quoteStatus.${status}`)}</StatusBadge>
}
