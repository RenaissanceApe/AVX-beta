import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Printer, Loader2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { groupByDay, shortTime, sortCrewForCallSheet } from '../lib/schedule'

// Printable call sheet: gig details, schedule by day, crew with call times and phones.
// Use the browser's Print → "Save as PDF" to share it as a file.
export default function CallSheetPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    async function load() {
      const [gigRes, scheduleRes, membersRes] = await Promise.all([
        supabase.from('gigs').select('*, organisations(name)').eq('id', id).maybeSingle(),
        supabase.from('gig_schedule').select('*').eq('gig_id', id),
        supabase.from('gig_members').select('*').eq('gig_id', id),
      ])
      if (gigRes.error || !gigRes.data) {
        if (gigRes.error) logger.error('callsheet', gigRes.error, { gigId: id })
        return setError(true)
      }
      const uids = (membersRes.data || []).map(m => m.user_id)
      const { data: profiles } = uids.length
        ? await supabase.from('profiles').select('id, full_name, phone').in('id', uids)
        : { data: [] }
      setData({
        gig: gigRes.data,
        schedule: scheduleRes.data || [],
        members: membersRes.data || [],
        profiles: Object.fromEntries((profiles || []).map(p => [p.id, p])),
      })
    }
    load()
  }, [id])

  if (error) return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#fff' }}>
      Call sheet not available. <button onClick={() => navigate('/dashboard')} style={toolbarBtn}>Back</button>
    </div>
  )
  if (!data) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Loader2 size={26} color="#1EC878" style={{ animation: 'spin 1s linear infinite' }} />
    </div>
  )

  const { gig, schedule, members, profiles } = data
  const nameOf = uid => profiles[uid]?.full_name || 'Unknown'
  const crew = sortCrewForCallSheet(members, nameOf)
  const dates = gig.start_date
    ? format(parseISO(gig.start_date), 'd MMM yyyy') + (gig.end_date && gig.end_date !== gig.start_date ? ` – ${format(parseISO(gig.end_date), 'd MMM yyyy')}` : '')
    : 'Dates TBC'

  return (
    <div className="callsheet-page">
      <style>{`
        .callsheet-page { min-height: 100vh; background: #e9edf1; padding: 16px; }
        .sheet { max-width: 800px; margin: 0 auto; background: #fff; color: #111; border-radius: 8px; padding: 32px; font-size: 13px; }
        .sheet h1 { font-size: 24px; margin-bottom: 2px; }
        .sheet h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #555; margin: 22px 0 8px; border-bottom: 2px solid #111; padding-bottom: 4px; }
        .sheet table { width: 100%; border-collapse: collapse; }
        .sheet th { text-align: left; font-size: 11px; text-transform: uppercase; color: #666; padding: 4px 6px; border-bottom: 1px solid #ccc; }
        .sheet td { padding: 6px; border-bottom: 1px solid #eee; vertical-align: top; }
        .sheet .time { white-space: nowrap; font-variant-numeric: tabular-nums; font-weight: 700; width: 110px; }
        .sheet .muted { color: #666; }
        .toolbar { max-width: 800px; margin: 0 auto 12px; display: flex; justify-content: space-between; }
        @media print {
          @page { margin: 12mm; }
          body, .callsheet-page { background: #fff !important; padding: 0; }
          .toolbar { display: none; }
          .sheet { border-radius: 0; padding: 0; max-width: none; }
          tr { break-inside: avoid; }
        }
      `}</style>
      <div className="toolbar">
        <button onClick={() => navigate(`/gig/${id}`)} style={toolbarBtn}><ArrowLeft size={14} /> Back to gig</button>
        <button onClick={() => window.print()} style={{ ...toolbarBtn, background: '#0FA85A', color: '#fff', border: 'none' }}>
          <Printer size={14} /> Print / Save as PDF
        </button>
      </div>

      <article className="sheet">
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <div className="muted" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.1em' }}>Call sheet</div>
            <h1>{gig.name}</h1>
            <div>{gig.venue || 'Venue TBC'} · {dates}</div>
          </div>
          <div className="muted" style={{ textAlign: 'right', fontSize: '12px' }}>
            {gig.organisations?.name && <div><strong style={{ color: '#111' }}>{gig.organisations.name}</strong></div>}
            <div>Printed {format(new Date(), 'd MMM yyyy, HH:mm')}</div>
          </div>
        </header>

        {gig.description && <p style={{ marginTop: '12px', whiteSpace: 'pre-wrap' }}>{gig.description}</p>}

        <h2>Schedule</h2>
        {schedule.length === 0 ? <p className="muted">No schedule yet.</p> : groupByDay(schedule).map(g => (
          <div key={g.day} style={{ marginBottom: '10px' }}>
            <div style={{ fontWeight: 700, margin: '6px 0' }}>{format(parseISO(g.day), 'EEEE, d MMMM')}</div>
            <table>
              <tbody>
                {g.items.map(item => (
                  <tr key={item.id}>
                    <td className="time">{shortTime(item.start_time)}{item.end_time ? `–${shortTime(item.end_time)}` : ''}</td>
                    <td>
                      <strong>{item.title}</strong>
                      {item.location && <span className="muted"> · {item.location}</span>}
                      {item.notes && <div className="muted" style={{ whiteSpace: 'pre-wrap' }}>{item.notes}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        <h2>Crew</h2>
        {crew.length === 0 ? <p className="muted">No crew assigned.</p> : (
          <table>
            <thead><tr><th>Call</th><th>Name</th><th>Role</th><th>Phone</th></tr></thead>
            <tbody>
              {crew.map(m => (
                <tr key={m.user_id}>
                  <td className="time">{shortTime(m.call_time) || '—'}</td>
                  <td>{nameOf(m.user_id)}</td>
                  <td>{m.function_title || (m.role === 'pm' ? 'Production Manager' : '—')}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{profiles[m.user_id]?.phone || <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>
    </div>
  )
}

const toolbarBtn = {
  display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px',
  border: '1px solid #c5ccd4', background: '#fff', color: '#111', fontWeight: 600, fontSize: '13px', cursor: 'pointer',
}
