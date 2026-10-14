import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import { monthMatrix, gigsOnDay, toDateStr } from '../lib/calendar'
import { colors, iconBtn, btn } from './ui'

const STATUS_COLOR = {
  draft: '#4A6070', confirmed: '#3B82F6', active: '#1EC878', completed: '#8B5CF6', archived: '#374151',
}
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Month view of gigs. Multi-day gigs appear on every day they run.
export default function GigCalendar({ gigs, onOpen }) {
  const today = toDateStr(new Date())
  const [selected, setSelected] = useState(null)
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const weeks = monthMatrix(cursor.year, cursor.month)
  const monthPrefix = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}`
  const shift = n => { setSelected(null); setCursor(c => {
    const d = new Date(c.year, c.month + n, 1)
    return { year: d.getFullYear(), month: d.getMonth() }
  }) }
  const undated = gigs.filter(g => !g.start_date).length

  const selectedGigs = selected ? gigsOnDay(gigs, selected) : []

  return (
    <div>
      {/* Narrow screens: dots in the grid, tap a day to list its gigs below */}
      <style>{`
        .cal-dots { display: none; }
        @media (max-width: 640px) {
          .cal-chips { display: none !important; }
          .cal-dots { display: flex; gap: 3px; flex-wrap: wrap; }
          .cal-cell { min-height: 52px !important; }
        }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <button onClick={() => shift(-1)} aria-label="Previous month" style={iconBtn}><ChevronLeft size={18} /></button>
        <h3 style={{ fontSize: '16px', fontWeight: 700, minWidth: '150px', textAlign: 'center' }}>
          {format(new Date(cursor.year, cursor.month, 1), 'MMMM yyyy')}
        </h3>
        <button onClick={() => shift(1)} aria-label="Next month" style={iconBtn}><ChevronRight size={18} /></button>
        <button onClick={() => { const d = new Date(); setCursor({ year: d.getFullYear(), month: d.getMonth() }) }}
          style={{ ...btn, padding: '6px 10px', marginLeft: 'auto' }}>Today</button>
      </div>

      <div role="grid" aria-label="Gig calendar" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '4px' }}>
        {WEEKDAYS.map(d => (
          <div key={d} role="columnheader" style={{ fontSize: '11px', fontWeight: 700, color: colors.muted, textTransform: 'uppercase', textAlign: 'center', padding: '4px 0' }}>{d}</div>
        ))}
        {weeks.flat().map(day => {
          const dayGigs = gigsOnDay(gigs, day)
          const inMonth = day.startsWith(monthPrefix)
          return (
            <div key={day} role="gridcell" className="cal-cell" aria-selected={selected === day}
              onClick={() => setSelected(s => (s === day ? null : day))} style={{
              minHeight: '76px', padding: '4px', borderRadius: '8px', overflow: 'hidden', cursor: 'pointer',
              background: inMonth ? 'rgba(255,255,255,0.03)' : 'transparent',
              border: day === selected ? '1px solid #fff' : day === today ? `1px solid ${colors.accent}` : `1px solid ${colors.border}`,
              opacity: inMonth ? 1 : 0.45,
            }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: day === today ? colors.accent : colors.muted, marginBottom: '3px' }}>
                {Number(day.slice(8))}
              </div>
              <div className="cal-dots" aria-hidden>
                {dayGigs.slice(0, 4).map(g => (
                  <span key={g.id} style={{ width: '7px', height: '7px', borderRadius: '50%', background: STATUS_COLOR[g.status] || colors.muted }} />
                ))}
              </div>
              <div className="cal-chips" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {dayGigs.slice(0, 3).map(g => (
                  <button key={g.id} onClick={e => { e.stopPropagation(); onOpen(g) }} title={g.name} style={{
                    display: 'block', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                    fontSize: '11px', fontWeight: 600, color: '#fff', padding: '2px 4px', borderRadius: '4px',
                    background: `${STATUS_COLOR[g.status] || colors.muted}55`, borderLeft: `3px solid ${STATUS_COLOR[g.status] || colors.muted}`,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{g.name}</button>
                ))}
                {dayGigs.length > 3 && <span style={{ fontSize: '10px', color: colors.muted }}>+{dayGigs.length - 3} more</span>}
              </div>
            </div>
          )
        })}
      </div>
      {selected && (
        <div style={{ marginTop: '12px' }}>
          <h4 style={{ fontSize: '13px', fontWeight: 700, color: colors.muted, marginBottom: '6px' }}>
            {format(new Date(`${selected}T00:00:00`), 'EEEE, d MMMM')}
          </h4>
          {selectedGigs.length === 0 ? (
            <p style={{ fontSize: '13px', color: colors.muted }}>No gigs this day.</p>
          ) : selectedGigs.map(g => (
            <button key={g.id} onClick={() => onOpen(g)} style={{
              display: 'flex', alignItems: 'center', gap: '8px', width: '100%', textAlign: 'left', cursor: 'pointer',
              padding: '10px 12px', marginBottom: '6px', borderRadius: '10px', color: '#fff', fontSize: '14px', fontWeight: 600,
              background: 'rgba(255,255,255,0.03)', border: `1px solid ${colors.border}`,
            }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: STATUS_COLOR[g.status] || colors.muted, flexShrink: 0 }} />
              {g.name}
            </button>
          ))}
        </div>
      )}
      {undated > 0 && (
        <p style={{ fontSize: '12px', color: colors.muted, marginTop: '10px' }}>
          {undated} gig{undated === 1 ? '' : 's'} without dates {undated === 1 ? "isn't" : "aren't"} shown — see the list view.
        </p>
      )}
    </div>
  )
}
