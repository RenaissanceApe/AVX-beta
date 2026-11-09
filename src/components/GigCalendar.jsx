import { useState } from 'react'
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import { monthMatrix, gigsOnDay, toDateStr } from '../lib/calendar'
import { colors, iconBtn, btn } from './ui'
import { useI18n, fmt } from '../i18n'
import { gigStatusLabel } from '../lib/gigLabels'
import { labelVar } from '../lib/labelColours'
// Monday-first weekday labels in the current language (2026-06-01 is a Monday)
const weekdays = () => Array.from({ length: 7 }, (_, i) => fmt(`2026-06-0${i + 1}`, 'EEE'))

const AMBER = 'var(--warn)'

// Month view of gigs. Multi-day gigs appear on every day they run. Gigs in clashIds
// (double bookings in My work) get an amber outline and a warning sign.
export default function GigCalendar({ gigs, onOpen, clashIds = null }) {
  const clashes = g => !!clashIds?.has(g.id)
  const { t } = useI18n()
  // An event is a panel block with a square in the gig's label colour; a draft (a hold) has a dashed edge
  const square = g => labelVar(gigStatusLabel(g, t).colour)
  const hold = g => (g.status || 'draft') === 'draft'
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
          .cal-dots { display: flex; gap: 4px; flex-wrap: wrap; }
          .cal-cell { min-height: 52px !important; }
        }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <button onClick={() => shift(-1)} aria-label={t('calendar.prev')} style={iconBtn}><ChevronLeft size={18} /></button>
        <h3 style={{ fontSize: '16px', fontWeight: 700, minWidth: '170px', textAlign: 'center' }}>
          {fmt(new Date(cursor.year, cursor.month, 1), 'MMMM yyyy')}
        </h3>
        <button onClick={() => shift(1)} aria-label={t('calendar.next')} style={iconBtn}><ChevronRight size={18} /></button>
        <button onClick={() => { const d = new Date(); setCursor({ year: d.getFullYear(), month: d.getMonth() }) }}
          style={{ ...btn, padding: '6px 10px', marginLeft: 'auto' }}>{t('common.today')}</button>
      </div>

      <div role="grid" aria-label={t('dash.viewCalendar')} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '4px' }}>
        {weekdays().map(d => (
          <div key={d} role="columnheader" style={{ fontSize: '11px', fontWeight: 700, color: colors.muted, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.12em', padding: '0 4px 4px' }}>{d}</div>
        ))}
        {weeks.flat().map(day => {
          const dayGigs = gigsOnDay(gigs, day)
          const inMonth = day.startsWith(monthPrefix)
          return (
            <div key={day} role="gridcell" className="cal-cell" aria-selected={selected === day}
              onClick={() => setSelected(s => (s === day ? null : day))} style={{
              minHeight: '76px', padding: '4px', overflow: 'hidden', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '4px',
              background: inMonth ? 'var(--fill)' : 'transparent',
              border: day === selected ? '1px solid var(--text)' : day === today ? `1px solid ${colors.accent}` : inMonth ? '1px solid var(--line)' : '1px solid transparent',
              color: inMonth ? 'var(--text-2)' : 'var(--soft)',
            }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: day === today ? 700 : 400, color: day === today ? colors.accentText : undefined }}>
                {Number(day.slice(8))}
              </div>
              <div className="cal-dots" aria-hidden>
                {dayGigs.slice(0, 4).map(g => (
                  <span key={g.id} style={{ width: '7px', height: '7px', background: hold(g) ? 'transparent' : square(g), border: `1px ${hold(g) ? 'dashed' : 'solid'} ${square(g)}`, outline: clashes(g) ? `2px solid ${AMBER}` : 'none', outlineOffset: '1px' }} />
                ))}
              </div>
              <div className="cal-chips" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {dayGigs.slice(0, 3).map(g => (
                  <button key={g.id} onClick={e => { e.stopPropagation(); onOpen(g) }} title={clashes(g) ? `${g.name} · ${t('clash.doubleBooking')}` : g.name}
                    className={`avx-ev${hold(g) ? ' is-hold' : ''}`} style={{ '--c': square(g), width: '100%', textAlign: 'left', cursor: 'pointer', borderColor: clashes(g) ? AMBER : undefined }}>
                    {clashes(g) ? <AlertTriangle size={9} color={AMBER} aria-hidden="true" style={{ flexShrink: 0 }} /> : <i aria-hidden="true" />}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.name}</span>
                  </button>
                ))}
                {dayGigs.length > 3 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: colors.muted }}>{t('calendar.more', { count: dayGigs.length - 3 })}</span>}
              </div>
            </div>
          )
        })}
      </div>
      {selected && (
        <div style={{ marginTop: '12px' }}>
          <h4 style={{ fontSize: '13px', fontWeight: 700, color: colors.muted, marginBottom: '6px' }}>
            {fmt(selected, 'EEEE, d MMMM')}
          </h4>
          {selectedGigs.length === 0 ? (
            <p style={{ fontSize: '13px', color: colors.muted }}>{t('calendar.noGigsDay')}</p>
          ) : selectedGigs.map(g => (
            <button key={g.id} onClick={() => onOpen(g)} style={{
              display: 'flex', alignItems: 'center', gap: '8px', width: '100%', textAlign: 'left', cursor: 'pointer',
              padding: '10px 12px', marginBottom: '6px', color: 'var(--text)', fontSize: '14px', fontWeight: 600, minHeight: '44px',
              background: 'var(--panel)', border: `1px ${hold(g) ? 'dashed' : 'solid'} ${colors.border}`,
            }}>
              <span aria-hidden="true" style={{ width: '8px', height: '8px', background: square(g), flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>{g.name}</span>
              {clashes(g) && <span style={{ color: AMBER, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}><AlertTriangle size={12} /> {t('clash.doubleBooking')}</span>}
            </button>
          ))}
        </div>
      )}
      {undated > 0 && (
        <p style={{ fontSize: '13px', color: colors.muted, marginTop: '10px' }}>
          {t('calendar.undated', { count: undated })}
        </p>
      )}
    </div>
  )
}
