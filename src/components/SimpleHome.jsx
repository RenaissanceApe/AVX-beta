import { useNavigate } from 'react-router-dom'
import { FileText, MessageCircle, Wrench, ChevronRight, Clock, MapPin, CalendarDays, List } from 'lucide-react'
import { useI18n } from '../i18n'
import { localToday } from '../lib/gigs'
import EmptyState from './EmptyState'
import { btnPrimary, btn, card, colors, tint } from './ui'

const shortTime = v => (v ? String(v).slice(0, 5) : '')

// The gigs still to come: not over yet and not cancelled or archived, soonest first
export function upcomingGigs(gigs, today = localToday()) {
  return (gigs || [])
    .filter(g => g.status !== 'archived' && g.status !== 'completed' && (g.end_date || g.start_date || '9999') >= today)
    .sort((a, b) => (a.start_date || '9').localeCompare(b.start_date || '9'))
}

// Simple mode's home (docs/HELP.md, H4): the next gig, big, with your call time and the three
// things crew need on the day, then the gigs after it. "All my gigs" shows the full list.
export default function SimpleHome({ gigs, onShowAll }) {
  const { t, fmt } = useI18n()
  const navigate = useNavigate()
  const [next, ...later] = upcomingGigs(gigs)

  const big = { ...btnPrimary, justifyContent: 'center', minHeight: '52px', fontSize: '16px', flex: '1 1 140px' }
  const action = { ...btn, justifyContent: 'center', minHeight: '52px', fontSize: '15px', flex: '1 1 140px' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {!next ? (
        <EmptyState icon={<CalendarDays size={28} />} title={t('simple.noneTitle')} body={t('simple.noneBody')} guide="crew-unavailable" />
      ) : (
        <section aria-labelledby="next-gig" style={{ ...card, padding: '20px', borderColor: tint(colors.accent, 35) }}>
          <p style={{ fontSize: '13px', fontWeight: 700, color: colors.accentText, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('simple.next')}</p>
          <h2 id="next-gig" style={{ fontSize: '24px', fontWeight: 800, margin: '6px 0 4px', lineHeight: 1.2 }}>{next.name}</h2>
          <p style={{ fontSize: '16px', color: colors.text, display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <CalendarDays size={16} aria-hidden="true" color={colors.muted} />
            {next.start_date ? fmt(next.start_date, 'EEEE, d MMMM') : t('callsheet.datesTbc')}
          </p>
          {next.venue && <p style={{ fontSize: '15px', color: colors.soft, display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}><MapPin size={15} aria-hidden="true" /> {next.venue}</p>}
          {(next.myCallTime || next.myFunction) && (
            <div style={{ marginTop: '14px', padding: '12px 14px', borderRadius: '12px', background: tint(colors.accent, 10), display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              {next.myCallTime && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '22px', fontWeight: 800, color: colors.accentText }}>
                  <Clock size={22} aria-hidden="true" /> {t('crew.call', { time: shortTime(next.myCallTime) })}
                </span>
              )}
              {next.myFunction && <span style={{ fontSize: '15px', color: colors.text }}>{next.myFunction}</span>}
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '16px' }}>
            <button type="button" onClick={() => navigate(`/gig/${next.id}/callsheet`)} style={big}><FileText size={18} /> {t('schedule.callSheet')}</button>
            <button type="button" onClick={() => navigate(`/gig/${next.id}?tab=chat`)} style={action}><MessageCircle size={18} /> {t('gig.tab.chat')}</button>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
            <button type="button" onClick={() => navigate(`/gig/${next.id}`)} style={action}><ChevronRight size={18} /> {t('simple.openGig')}</button>
            <button type="button" onClick={() => navigate(`/gig/${next.id}?tab=equipment&report=1`)} style={action}><Wrench size={18} /> {t('report.title')}</button>
          </div>
        </section>
      )}

      {later.length > 0 && (
        <section aria-labelledby="later-gigs">
          <h2 id="later-gigs" style={{ fontSize: '14px', fontWeight: 700, color: colors.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>{t('simple.later')}</h2>
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {later.slice(0, 5).map(g => (
              <li key={g.id}>
                <button type="button" onClick={() => navigate(`/gig/${g.id}`)} style={{ ...card, width: '100%', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', color: colors.text, font: 'inherit', minHeight: '56px' }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ display: 'block', fontSize: '15px' }}>{g.name}</strong>
                    <span style={{ fontSize: '13px', color: colors.muted }}>
                      {[g.start_date && fmt(g.start_date, 'EEE d MMM'), g.myCallTime && t('crew.call', { time: shortTime(g.myCallTime) }), g.venue].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <ChevronRight size={18} color={colors.muted} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <button type="button" onClick={onShowAll} style={{ ...btn, alignSelf: 'flex-start' }}><List size={15} /> {t('simple.allGigs')}</button>
    </div>
  )
}
