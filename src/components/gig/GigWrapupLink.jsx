import { Link } from 'react-router-dom'
import { ClipboardCheck } from 'lucide-react'
import { localToday } from '../../lib/gigs'
import { useI18n } from '../../i18n'
import { card, colors } from '../ui'

// Once a gig has ended (its last day is before today), its managers and the organisation's admins
// and members get a link to the wrap-up page (K7). Cancelled gigs have nothing to wrap up.
export const gigHasEnded = (gig, today = localToday()) => {
  const last = gig?.end_date || gig?.start_date
  return !!last && last < today && gig.status !== 'cancelled'
}

export default function GigWrapupLink({ gig }) {
  const { t } = useI18n()
  if (!gigHasEnded(gig)) return null
  return (
    <div style={{ ...card, padding: '12px 14px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
      <ClipboardCheck size={18} aria-hidden="true" style={{ color: colors.accentText }} />
      <span style={{ flex: '1 1 200px', fontSize: '13px' }}>{t('wrapup.linkBody')}</span>
      <Link to={`/gig/${gig.id}/wrapup`} style={{ fontSize: '13px', fontWeight: 700, color: colors.accentText }}>{t('wrapup.linkOpen')}</Link>
    </div>
  )
}
