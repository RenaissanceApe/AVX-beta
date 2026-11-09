import { Link } from 'react-router-dom'
import { ClipboardCheck } from 'lucide-react'
import { localToday } from '../../lib/gigs'
import { useI18n } from '../../i18n'
import { colors } from '../ui'

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
    // One line on the page ground, no box (DESIGN.md "One box deep")
    <p style={{ display: 'flex', alignItems: 'center', gap: '8px 12px', flexWrap: 'wrap', fontSize: '14px', margin: 0 }}>
      <ClipboardCheck size={16} aria-hidden="true" style={{ color: colors.muted, flexShrink: 0 }} />
      <span style={{ flex: '1 1 200px' }}>{t('wrapup.linkBody')}</span>
      <Link to={`/gig/${gig.id}/wrapup`} style={{ fontWeight: 600, color: colors.accentText }}>{t('wrapup.linkOpen')}</Link>
    </p>
  )
}
