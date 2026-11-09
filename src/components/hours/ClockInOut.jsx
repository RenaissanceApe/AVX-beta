// On-site mode (step 8): "Clock in" keeps the start time on this phone; "Clock out" sends the day
// to the gig's hours (queued when there's no connection). Break, travel and km are added after.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Timer, LogIn, LogOut } from 'lucide-react'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { saveHours } from '../../lib/hours'
import { localDay } from '../../lib/onSite'
import { useI18n, fmt } from '../../i18n'
import { btnPrimary, card, colors, AvxLoader } from '../ui'

const key = (userId, gigId) => `avx.clockIn.${userId}.${gigId}`
const read = k => { try { return JSON.parse(localStorage.getItem(k) || 'null') } catch { return null } }
const write = (k, v) => { try { v ? localStorage.setItem(k, JSON.stringify(v)) : localStorage.removeItem(k) } catch { /* blocked */ } }

export default function ClockInOut({ gig, userId }) {
  const { t } = useI18n()
  const { notify } = useToast()
  const k = key(userId, gig.id)
  const [clock, setClock] = useState(() => read(k))
  const [busy, setBusy] = useState(false)
  const now = () => fmt(new Date(), 'HH:mm')

  function clockIn() {
    const v = { day: localDay(), start: now() }
    write(k, v)
    setClock(v)
    track('hours:clock-in')
  }
  async function clockOut() {
    const end = now()
    if (end === clock.start) return notify(t('hours.clockTooShort'), 'error')
    setBusy(true)
    try {
      const { queued } = await saveHours(userId, { isNew: true, gig_id: gig.id, user_id: userId, work_date: clock.day, start_time: clock.start, end_time: end, gig_name: gig.name })
      write(k, null)
      setClock(null)
      track('hours:clock-out')
      notify(queued ? t('hours.queued') : t('hours.clockedOut', { start: clock.start, end }), 'success')
    } catch (error) {
      logger.error('hours', error, { step: 'clockOut' })
      notify(error?.code === '23505' ? t('hours.dayTaken') : userMessage(error), 'error')
    }
    setBusy(false)
  }

  return (
    <div style={{ ...card, display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
      <Timer size={28} color={colors.accentText} aria-hidden="true" />
      <div style={{ flex: '1 1 160px', minWidth: 0 }}>
        <div style={{ fontSize: '13px', color: colors.muted }}>{t('hours.clockTitle')}</div>
        <div style={{ fontSize: '16px', fontWeight: 700 }}>
          {clock ? t('hours.clockedInAt', { time: clock.start }) : t('hours.notClockedIn')}
        </div>
        <Link to={`/gig/${gig.id}?tab=crew`} style={{ fontSize: '13px', color: colors.accentText }}>{t('hours.addBreak')}</Link>
      </div>
      {clock ? (
        <button type="button" onClick={clockOut} disabled={busy} style={{ ...btnPrimary, fontSize: '16px', padding: '12px 18px' }}>
          {busy ? <AvxLoader size={16} /> : <LogOut size={16} />} {t('hours.clockOut')}
        </button>
      ) : (
        <button type="button" onClick={clockIn} style={{ ...btnPrimary, fontSize: '16px', padding: '12px 18px' }}><LogIn size={16} /> {t('hours.clockIn')}</button>
      )}
    </div>
  )
}
