import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Printer, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { saveSnapshot, loadSnapshot, isNetworkError } from '../lib/offline'
import { DEPARTMENTS, byDepartment, msToTc } from '../lib/rehearsal'
import { useI18n } from '../i18n'

// Printable rehearsal notes (docs/TOOLS_PLAN.md §2, R1): one section per department, notes in
// timecode order, open ones first to read. ?dept=lighting prints one department.
//   /gig/:id/rehearsal/:session
export default function RehearsalReportPage() {
  const { id, session: sessionId } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { t, fmt } = useI18n()
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)
  const dept = params.get('dept') || 'all'

  useEffect(() => {
    Promise.all([
      supabase.from('gigs').select('name, venue, start_date, end_date, organisations(name)').eq('id', id).maybeSingle(),
      supabase.from('rehearsal_sessions').select('id, name, fps, frame_count, created_at, ended_at').eq('id', sessionId).eq('gig_id', id).maybeSingle(),
      supabase.from('rehearsal_notes').select('id, tc_ms, department, priority, cue, body, author_id, assignee_id, status, done_by, created_at')
        .eq('session_id', sessionId).is('removed_at', null).order('tc_ms'),
    ]).then(async ([gigRes, sessionRes, notesRes]) => {
      if (gigRes.error && isNetworkError(gigRes.error)) {
        const snap = loadSnapshot(`rehearsalReport.${sessionId}`)
        return snap ? setData(snap.data) : setError(true)
      }
      if (gigRes.error || !gigRes.data || !sessionRes.data) {
        if (gigRes.error || sessionRes.error) logger.error('rehearsal', gigRes.error || sessionRes.error, { step: 'report' })
        return setError(true)
      }
      const notes = notesRes.data || []
      const uids = [...new Set(notes.flatMap(n => [n.author_id, n.assignee_id, n.done_by]).filter(Boolean))]
      const { data: people } = uids.length ? await supabase.from('profiles').select('id, full_name').in('id', uids) : { data: [] }
      const sheet = { gig: gigRes.data, session: sessionRes.data, notes, names: Object.fromEntries((people || []).map(p => [p.id, p.full_name])) }
      setData(sheet)
      saveSnapshot(`rehearsalReport.${sessionId}`, sheet)
    })
  }, [id, sessionId])

  if (error) return <div style={{ padding: '40px', textAlign: 'center' }}>{t('callsheet.notAvailable')} <button onClick={() => navigate('/dashboard')} style={toolbarBtn}>{t('common.back')}</button></div>
  if (!data) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Loader2 size={26} color="#1EC878" style={{ animation: 'spin 1s linear infinite' }} /></div>

  const { gig, session, notes, names } = data
  const df = session.frame_count === 'df'
  const nameOf = uid => names[uid] || t('common.unknown')
  const groups = byDepartment(notes).filter(g => dept === 'all' || g.department === dept)
  const open = notes.filter(n => n.status === 'open').length

  return (
    <div className="rh-page">
      <style>{`
        .rh-page { min-height: 100vh; background: #e9edf1; padding: 16px; }
        .sheet { max-width: 1000px; margin: 0 auto; background: #fff; color: #111; border-radius: 8px; padding: 28px; font-size: 13px; }
        .sheet h1 { font-size: 22px; margin-bottom: 2px; }
        .sheet h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #555; margin: 18px 0 6px; border-bottom: 2px solid #111; padding-bottom: 4px; break-after: avoid; }
        .sheet table { width: 100%; border-collapse: collapse; }
        .sheet th, .sheet td { text-align: left; padding: 4px 6px; border-bottom: 1px solid #ddd; vertical-align: top; }
        .sheet th { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #555; }
        .sheet tr { break-inside: avoid; }
        .sheet .muted { color: #555; }
        .sheet .tc { font-family: var(--font-mono); white-space: nowrap; font-weight: 700; }
        .sheet .notecol { min-width: 200px; }
        .sheet .done td { color: #555; }
        .sheet .done .body { text-decoration: line-through; }
        .sheet .urgent { color: #B42318; font-weight: 700; }
        .sheet .fix { color: #8A5A00; font-weight: 700; }
        .wrap { overflow-x: auto; }
        .toolbar { max-width: 1000px; margin: 0 auto 12px; display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
        .toolbar select { padding: 8px 10px; border-radius: 8px; border: 1px solid #c8ced6; background: #fff; color: #111; font-size: 13px; }
        @media (max-width: 600px) { .sheet { padding: 18px 14px; } }
        @media print {
          @page { margin: 12mm; }
          body, .rh-page { background: #fff !important; padding: 0; }
          .toolbar { display: none; }
          .sheet { border-radius: 0; padding: 0; max-width: none; }
        }
      `}</style>
      <div className="toolbar">
        <button onClick={() => navigate(`/gig/${id}?tab=tools&tool=rehearsal&session=${sessionId}`)} style={toolbarBtn}><ArrowLeft size={14} /> {t('callsheet.backToGig')}</button>
        <span style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <label htmlFor="rh-report-dept" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{t('rehearsal.department')}</label>
          <select id="rh-report-dept" value={dept} onChange={e => setParams(e.target.value === 'all' ? {} : { dept: e.target.value })}>
            <option value="all">{t('rehearsal.allDepartments')}</option>
            {DEPARTMENTS.map(d => <option key={d} value={d}>{t(`rehearsal.dept.${d}`)}</option>)}
          </select>
          <button onClick={() => window.print()} style={{ ...toolbarBtn, background: '#0B7A41', color: '#fff', border: 'none' }}><Printer size={14} /> {t('callsheet.print')}</button>
        </span>
      </div>
      <article className="sheet">
        <div className="muted" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.1em' }}>{t('rehearsal.reportTitle')}</div>
        <h1>{gig.name} · {session.name}</h1>
        <div>{[gig.venue, fmt(session.created_at, 'd MMM yyyy, HH:mm'), gig.organisations?.name, `${Number(session.fps)} fps${df ? ' DF' : ''}`].filter(Boolean).join(' · ')}</div>
        <p className="muted" style={{ marginTop: '6px' }}>{t('rehearsal.reportSummary', { count: notes.length, open })}</p>
        {groups.length === 0 && <p style={{ marginTop: '18px' }}>{t('rehearsal.noNotes')}</p>}
        {groups.map(g => (
          <section key={g.department}>
            <h2>{t(`rehearsal.dept.${g.department}`)} · {g.notes.length}</h2>
            <div className="wrap" tabIndex={0} role="region" aria-label={t(`rehearsal.dept.${g.department}`)}>
              <table>
                <thead><tr><th>{t('rehearsal.timecode')}</th><th>{t('rehearsal.cue')}</th><th>{t('rehearsal.note')}</th><th>{t('rehearsal.who')}</th><th>{t('rehearsal.statusLabel')}</th></tr></thead>
                <tbody>
                  {g.notes.map(n => (
                    <tr key={n.id} className={n.status === 'done' ? 'done' : ''}>
                      <td className="tc">{msToTc(n.tc_ms, session.fps, df)}</td>
                      <td>{n.cue || ''}</td>
                      <td className="notecol">
                        {n.priority !== 'note' && <span className={n.priority}>{t(`rehearsal.priority.${n.priority}`)} · </span>}
                        <span className="body" style={{ whiteSpace: 'pre-wrap' }}>{n.body}</span>
                      </td>
                      <td>{nameOf(n.author_id)}{n.assignee_id ? ` → ${nameOf(n.assignee_id)}` : ''}</td>
                      <td>{n.status === 'done' ? `✓ ${t('rehearsal.status.done')}` : t('rehearsal.status.open')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </article>
    </div>
  )
}

const toolbarBtn = { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', border: '1px solid #c8ced6', background: '#fff', color: '#111', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }
