import { describe, it, expect } from 'vitest'
import { buildCalendar, gigEvent, escapeText, fold } from '../../supabase/functions/_shared/ics.ts'

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
})
