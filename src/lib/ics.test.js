import { describe, it, expect } from 'vitest'
import { buildCalendar, gigEvent, leaveEvent, appointmentEvent, escapeText, fold, feedZone } from '../../supabase/functions/_shared/ics.ts'

const APP = 'https://avx-beta.vercel.app'
const NOW = new Date('2026-10-21T12:00:00Z')

describe('calendar feed', () => {
  it('escapes text and folds long lines', () => {
    expect(escapeText('Rock, Pop; Jazz\nLine 2 \\ end')).toBe('Rock\\, Pop\\; Jazz\\nLine 2 \\\\ end')
    const long = `SUMMARY:${'Festival Lumière '.repeat(8)}`
    const folded = fold(long)
    expect(folded.split('\r\n ').every(part => new TextEncoder().encode(part).length <= 75)).toBe(true)
    expect(folded.replace(/\r\n /g, '')).toBe(long)
  })

  it('shows a gig as all-day days, or at the person’s own booking times', () => {
    const allDay = gigEvent({ id: 'g1', name: 'Summer Festival', start_date: '2026-11-10', end_date: '2026-11-12', venue: 'Parque', org: 'Lumen and Pixel',
      role: 'crew', function_title: 'Sound engineer', call_time: '09:30:00', status: 'confirmed' }, 'en', APP, NOW)
    expect(allDay).toContain('DTSTART;VALUE=DATE:20261110')
    expect(allDay).toContain('DTEND;VALUE=DATE:20261113')
    expect(allDay).toContain('SUMMARY:Summer Festival · Lumen and Pixel')
    expect(allDay).toContain('LOCATION:Parque')
    expect(allDay.find(l => l.startsWith('DESCRIPTION'))).toBe('DESCRIPTION:Role: Sound engineer\\nCall time: 09:30\\nOpen in AVX: https://avx-beta.vercel.app/gig/g1')
    expect(allDay).toContain('STATUS:CONFIRMED')
    const booked = gigEvent({ id: 'g2', name: 'Gala', start_date: '2026-11-20', booked_from: '2026-11-20T08:00:00+00:00', booked_until: '2026-11-20T23:30:00+00:00', status: 'draft', role: 'pm' }, 'pt', APP, NOW)
    expect(booked).toContain('DTSTART:20261120T080000Z')
    expect(booked).toContain('DTEND:20261120T233000Z')
    expect(booked).toContain('STATUS:TENTATIVE')
    expect(booked.find(l => l.startsWith('DESCRIPTION'))).toContain('Rascunho')
    expect(gigEvent({ id: 'g3', name: 'No date' }, 'en', APP, NOW)).toEqual([])
  })

  it('lists the person’s own logged hours in the description', () => {
    const ev = gigEvent({ id: 'g3', name: 'Show', start_date: '2026-12-04', status: 'confirmed',
      hours: [{ work_date: '2026-12-04', start_time: '14:00:00', end_time: '02:00:00', status: 'approved' }, { work_date: '2026-12-05', start_time: '10:00:00', end_time: '18:00:00', status: 'submitted' }] }, 'en', APP, NOW)
    expect(ev.find(l => l.startsWith('DESCRIPTION'))).toContain('Your hours:\\n2026-12-04 14:00–02:00 (approved)\\n2026-12-05 10:00–18:00 (waiting for approval)')
  })

  it('builds a calendar without archived gigs, with CRLF line ends', () => {
    const ics = buildCalendar([
      { id: 'a', name: 'On', start_date: '2026-11-01', status: 'confirmed' },
      { id: 'b', name: 'Old', start_date: '2026-01-01', status: 'archived' },
    ], 'en', APP, NOW)
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1)
    expect(ics).toContain('UID:a@avx')
    expect(ics).toContain('DTEND;VALUE=DATE:20261102')
    expect(ics).toContain('X-WR-CALNAME:AVX gigs')
  })

  it('adds the person’s own approved leave as all-day events (step 9)', () => {
    const ev = leaveEvent({ id: 'l1', type: 'holiday', start_date: '2027-03-01', end_date: '2027-03-05', org: 'Lumen and Pixel' }, 'en', NOW)
    expect(ev).toContain('UID:leave-l1@avx')
    expect(ev).toContain('DTSTART;VALUE=DATE:20270301')
    expect(ev).toContain('DTEND;VALUE=DATE:20270306')
    expect(ev).toContain('SUMMARY:Holiday · Lumen and Pixel')
    const half = leaveEvent({ id: 'l2', type: 'training', start_date: '2027-03-08', end_date: '2027-03-08', end_half: true }, 'pt', NOW)
    expect(half).toContain('SUMMARY:Formação (08/03 manhã)')
    const cal = buildCalendar([], 'en', APP, NOW, [{ id: 'l3', type: 'other', start_date: '2027-04-01', end_date: '2027-04-01' }])
    expect(cal).toContain('SUMMARY:Unavailable')
  })

  it('names the calendar\'s time zone after the organisations\' (U1), Lisbon by default', () => {
    expect(buildCalendar([], 'en', APP, NOW)).toContain('X-WR-TIMEZONE:Europe/Lisbon')
    const ny = { id: 'g1', name: 'NY gig', start_date: '2027-01-10', status: 'confirmed', call_time: '09:30:00', time_zone: 'America/New_York' }
    const ldn = { id: 'g2', name: 'London gig', start_date: '2027-01-12', status: 'confirmed', call_time: '08:00:00', time_zone: 'Europe/London' }
    const ny2 = { ...ny, id: 'g3' }
    expect(feedZone([ny, ldn, ny2])).toBe('America/New_York')
    expect(feedZone([])).toBe('Europe/Lisbon')
    const cal = buildCalendar([ny, ldn, ny2], 'en', APP, NOW)
    expect(cal).toContain('X-WR-TIMEZONE:America/New_York')
    // All-day dates stay the gig's own dates; a call time on another clock names its zone
    expect(cal).toContain('DTSTART;VALUE=DATE:20270110')
    expect(cal).toContain('Call time: 09:30\\n')
    expect(cal).toContain('Call time: 08:00 (Europe/London)')
  })

  it('adds appointments with real times or whole days', () => {
    const timed = appointmentEvent({ id: 'a1', kind: 'site_visit', title: 'Venue walk, stage left', place: 'Coliseu', all_day: false,
      starts_at: '2027-01-10T14:30:00Z', ends_at: '2027-01-10T16:00:00Z', org: 'Lumen' }, 'en', APP, NOW).join('\n')
    expect(timed).toContain('UID:appointment-a1@avx')
    expect(timed).toContain('DTSTART:20270110T143000Z')
    expect(timed).toContain('SUMMARY:Venue walk\\, stage left · Lumen')
    expect(timed).toContain('LOCATION:Coliseu')
    expect(timed).toContain('DESCRIPTION:Site visit\\n')
    const day = { id: 'a2', kind: 'warehouse', title: 'Prep', all_day: true, start_date: '2027-01-11', end_date: '2027-01-12' }
    expect(appointmentEvent(day, 'pt', APP, NOW).join('\n')).toContain('DTEND;VALUE=DATE:20270113')
    expect(appointmentEvent({ ...day, start_date: null }, 'en', APP, NOW)).toEqual([])
    expect(buildCalendar([], 'en', APP, NOW, [], undefined, [day])).toContain('UID:appointment-a2@avx')
  })
})
