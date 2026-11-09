import { useNavigate } from 'react-router-dom'
import { FileText, MessageCircle, Wrench, ChevronRight, Clock, MapPin, CalendarDays, List } from 'lucide-react'
import { useI18n } from '../i18n'
import { localToday } from '../lib/gigs'
import EmptyState from './EmptyState'
import ReadAloud from './ReadAloud'
import { btnPrimary, btn, card, colors, label, space, Stack, Section } from './ui'

const shortTime = v => (v ? String(v).slice(0, 5) : '')

// The gigs still to come: not over yet and not cancelled or archived, soonest first
export function upcomingGigs(gigs, today = localToday()) {
  return (gigs || [])
    .filter(g => !['archived', 'completed', 'cancelled'].includes(g.status) && (g.end_date || g.start_date || '9999') >= today)
    .sort((a, b) => (a.start_date || '9').localeCompare(b.start_date || '9'))
}

// Simple mode's home (docs/HELP.md, H4): the next gig, big, with your call time and the three
// things crew need on the day, then the gigs after it. "All my gigs" shows the full list.
export default function SimpleHome({ gigs, onShowAll }) {
  const { t, fmt } = useI18n()
  const navigate = useNavigate()
  const [next, ...later] = upcomingGigs(gigs)

  const big = { ...btnPrimary, justifyContent: 'center', minHeight: '52px', fontSize: '16px', flex: '1 1 140px' }
  const action = { ...btn, justifyContent: 'center', minHeight: '52px', fontSize: '16px', flex: '1 1 140px' }

  return (
    <Stack gap="section">
      {!next ? (
        <EmptyState icon={<CalendarDays size={28} />} title={t('simple.noneTitle')} body={t('simple.noneBody')} guide="crew-unavailable" />
      ) : (
        <section aria-labelledby="next-gig" style={{ ...card, padding: space[5], borderColor: 'var(--line-strong)' }}>
          <p style={{ ...label, color: colors.accentText, marginBottom: space[2] }}>{t('simple.next')}</p>
          <h2 id="next-gig" style={{ fontSize: '24px', fontWeight: 700, margin: `0 0 ${space[2]}`, lineHeight: 1.2, overflowWrap: 'anywhere' }}>{next.name}</h2>
          <Stack gap={1}>
            <p style={{ fontSize: '16px', color: colors.text, display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
              <CalendarDays size={16} aria-hidden="true" color={colors.muted} />
              {next.start_date ? fmt(next.start_date, 'EEEE, d MMMM') : t('callsheet.datesTbc')}
            </p>
            {next.venue && <p style={{ fontSize: '16px', color: colors.soft, display: 'flex', alignItems: 'center', gap: space[2] }}><MapPin size={16} aria-hidden="true" /> {next.venue}</p>}
          </Stack>
          {(next.myCallTime || next.myFunction) && (
            <div style={{ marginTop: space[4], padding: `${space[3]} ${space[4]}`, background: 'var(--selection)', display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
              {next.myCallTime && (
                <span style={{ display: 'flex', alignItems: 'center', gap: space[2], fontFamily: 'var(--font-mono)', fontSize: '24px', fontWeight: 700, color: colors.accentText }}>
                  <Clock size={22} aria-hidden="true" /> {t('crew.call', { time: shortTime(next.myCallTime) })}
                </span>
              )}
              {next.myFunction && <span style={{ fontSize: '16px', color: colors.text }}>{next.myFunction}</span>}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: space[2], marginTop: space[5] }}>
            <button type="button" onClick={() => navigate(`/gig/${next.id}/callsheet`)} style={{ ...big, gridColumn: '1 / -1' }}><FileText size={18} aria-hidden="true" /> {t('schedule.callSheet')}</button>
            <button type="button" onClick={() => navigate(`/gig/${next.id}?tab=chat`)} style={action}><MessageCircle size={18} aria-hidden="true" /> {t('gig.tab.chat')}</button>
            <button type="button" onClick={() => navigate(`/gig/${next.id}`)} style={action}><ChevronRight size={18} aria-hidden="true" /> {t('simple.openGig')}</button>
            <button type="button" onClick={() => navigate(`/gig/${next.id}?tab=equipment&report=1`)} style={action}><Wrench size={18} aria-hidden="true" /> {t('report.title')}</button>
            <ReadAloud style={action} text={() => [
              t('speak.nextGig', { name: next.name }),
              next.start_date && fmt(next.start_date, 'EEEE, d MMMM') + '.',
              next.venue && next.venue + '.',
              next.myCallTime && t('speak.yourCall', { time: shortTime(next.myCallTime) }) + (next.myFunction ? `, ${next.myFunction}` : '') + '.',
            ].filter(Boolean).join(' ')} />
          </div>
        </section>
      )}

      {later.length > 0 && (
        <Section id="later-gigs" title={t('simple.later')}>
          <ul style={{ listStyle: 'none', padding: 0, borderTop: `1px solid ${colors.line}` }}>
            {later.slice(0, 5).map(g => (
              <li key={g.id} style={{ borderBottom: `1px solid ${colors.line}` }}>
                <button type="button" onClick={() => navigate(`/gig/${g.id}`)} style={{ background: 'none', border: 'none', padding: `${space[2]} 0`, width: '100%', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: space[3], color: colors.text, font: 'inherit', minHeight: '56px' }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ display: 'block', fontSize: '16px' }}>{g.name}</strong>
                    <span style={{ fontSize: '13px', color: colors.muted }}>
                      {[g.start_date && fmt(g.start_date, 'EEE d MMM'), g.myCallTime && t('crew.call', { time: shortTime(g.myCallTime) }), g.venue].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <ChevronRight size={18} color={colors.muted} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <button type="button" onClick={onShowAll} style={{ ...btn, alignSelf: 'flex-start', minHeight: '44px' }}><List size={16} aria-hidden="true" /> {t('simple.allGigs')}</button>
    </Stack>
  )
}
