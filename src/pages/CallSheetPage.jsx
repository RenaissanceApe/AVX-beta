import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Printer, Loader2, Megaphone, Type } from 'lucide-react'
import { useI18n } from '../i18n'
import { saveSnapshot, loadSnapshot, isNetworkError } from '../lib/offline'
import OfflineBanner from '../components/OfflineBanner'
import { supabase } from '../lib/supabase'
import { logger, userMessage } from '../lib/logger'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { track } from '../lib/usage'
import { groupByDay, shortTime, sortCrewForCallSheet, callSheetSpeech } from '../lib/schedule'
import { readAppearance } from '../lib/appearance'
import ReadAloud from '../components/ReadAloud'

// Large print (docs/HELP.md, H5): remembered on this device; starts on for people who use a
// larger text size in Appearance
const LARGE_KEY = 'avx.callsheet.large'
function readLarge() {
  try {
    const saved = localStorage.getItem(LARGE_KEY)
    return saved === null ? readAppearance().size !== 'normal' : saved === '1'
  } catch { return false }
}

// Printable call sheet: gig details, schedule by day, crew with call times and phones.
// Use the browser's Print → "Save as PDF" to share it as a file.
export default function CallSheetPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)
  const [orgRole, setOrgRole] = useState(null)
  const [publishing, setPublishing] = useState(false)
  const [large, setLarge] = useState(readLarge)
  const toggleLarge = () => setLarge(on => { try { localStorage.setItem(LARGE_KEY, on ? '0' : '1') } catch { /* private mode */ } return !on })
  const { t, fmt } = useI18n()
  const { user } = useAuth()
  const { notify } = useToast()

  useEffect(() => {
    async function load() {
      const [gigRes, scheduleRes, membersRes] = await Promise.all([
        supabase.from('gigs').select('*, organisations(name)').eq('id', id).maybeSingle(),
        supabase.from('gig_schedule').select('*').eq('gig_id', id),
        supabase.from('gig_members').select('*').eq('gig_id', id),
      ])
      // No connection: use the call sheet as it was last loaded on this device
      if (gigRes.error && isNetworkError(gigRes.error)) {
        const snap = loadSnapshot(`callsheet.${id}`)
        if (snap) return setData({ ...snap.data, savedAt: snap.savedAt })
        return setError(true)
      }
      if (gigRes.error || !gigRes.data) {
        if (gigRes.error) logger.error('callsheet', gigRes.error, { gigId: id })
        return setError(true)
      }
      const uids = (membersRes.data || []).map(m => m.user_id)
      const { data: profiles } = uids.length
        ? await supabase.from('profiles').select('id, full_name, phone').in('id', uids)
        : { data: [] }
      const sheet = {
        gig: gigRes.data,
        schedule: scheduleRes.data || [],
        members: membersRes.data || [],
        profiles: Object.fromEntries((profiles || []).map(p => [p.id, p])),
      }
      setData(sheet)
      saveSnapshot(`callsheet.${id}`, sheet)
      if (gigRes.data.org_id) {
        const { data: om } = await supabase.from('org_members').select('role').eq('org_id', gigRes.data.org_id).eq('user_id', user.id).maybeSingle()
        setOrgRole(om?.role || null)
      }
    }
    load()
  }, [id, user.id])

  // Post it in the gig's chat, asking everyone to confirm they've read it (docs/MESSAGING.md, M4)
  async function publish() {
    if (!window.confirm(t('callsheet.publishConfirm'))) return
    setPublishing(true)
    const { error: err } = await supabase.rpc('publish_call_sheet', { p_gig: id, p_body: t('callsheet.publishBody', { gig: data.gig.name }) })
    setPublishing(false)
    if (err) { logger.error('callsheet', err, { step: 'publish' }); return notify(userMessage(err), 'error') }
    track('callsheet:publish')
    notify(t('callsheet.published'), 'success')
  }

  if (error) return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#fff' }}>
      {t('callsheet.notAvailable')} <button onClick={() => navigate('/dashboard')} style={toolbarBtn}>{t('common.back')}</button>
    </div>
  )
  if (!data) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Loader2 size={26} color="#1EC878" style={{ animation: 'spin 1s linear infinite' }} />
    </div>
  )

  const { gig, schedule, members, profiles } = data
  const nameOf = uid => profiles[uid]?.full_name || t('common.unknown')
  const crew = sortCrewForCallSheet(members, nameOf)
  // Mirrors private.can_manage_gig
  const isPM = !data.savedAt && (gig.created_by === user.id || orgRole === 'admin' || members.some(m => m.user_id === user.id && m.role === 'pm'))
  const dates = gig.start_date
    ? fmt(gig.start_date, 'd MMM yyyy') + (gig.end_date && gig.end_date !== gig.start_date ? ` – ${fmt(gig.end_date, 'd MMM yyyy')}` : '')
    : t('callsheet.datesTbc')

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
        .sheet tr.me td { background: #fff4c2; font-weight: 700; }
        .sheet.large { font-size: 18px; line-height: 1.5; }
        .sheet.large h1 { font-size: 34px; }
        .sheet.large h2 { font-size: 16px; color: #222; }
        .sheet.large th { font-size: 14px; color: #333; }
        .sheet.large td { padding: 10px 8px; }
        .sheet.large .time { width: 160px; }
        .sheet.large .muted { color: #333; }
        .sheet a.tel { color: inherit; text-decoration: none; }
        @media screen and (max-width: 600px) {
          .sheet { padding: 20px 16px; }
          .sheet.large .time { width: 6.5em; }
          .sheet.large .crew thead { display: none; }
          .sheet.large .crew tr { display: grid; grid-template-columns: 4.5em 1fr; border-bottom: 1px solid #ccc; padding: 6px 0; }
          .sheet.large .crew td { border: none; padding: 2px 6px; white-space: normal !important; }
          .sheet.large .crew td.time { grid-row: span 3; width: auto; }
          .sheet.large a.tel { text-decoration: underline; }
        }
        .toolbar { max-width: 800px; margin: 0 auto 12px; display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
        @media print {
          @page { margin: 12mm; }
          body, .callsheet-page { background: #fff !important; padding: 0; }
          .toolbar, .toolbar-offline { display: none; }
          .sheet { border-radius: 0; padding: 0; max-width: none; }
          tr { break-inside: avoid; }
        }
      `}</style>
      <div className="toolbar-offline"><OfflineBanner savedAt={data.savedAt} /></div>
      <div className="toolbar">
        <button onClick={() => navigate(`/gig/${id}`)} style={toolbarBtn}><ArrowLeft size={14} /> {t('callsheet.backToGig')}</button>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {isPM && (
            <button onClick={publish} disabled={publishing} title={t('callsheet.publishHint')} style={toolbarBtn}>
              {publishing ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Megaphone size={14} />} {t('callsheet.publish')}
            </button>
          )}
          <ReadAloud style={toolbarBtn} text={() => callSheetSpeech({ gig, schedule, crew, nameOf, me: user.id }, { t, fmt })} />
          <button onClick={toggleLarge} aria-pressed={large} style={{ ...toolbarBtn, ...(large ? { background: '#111', color: '#fff', borderColor: '#111' } : {}) }}>
            <Type size={14} /> {t('callsheet.large')}
          </button>
          <button onClick={() => window.print()} style={{ ...toolbarBtn, background: '#0B7A41', color: '#fff', border: 'none' }}>
            <Printer size={14} /> {t('callsheet.print')}
          </button>
        </div>
      </div>

      <article className={large ? 'sheet large' : 'sheet'}>
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <div className="muted" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.1em' }}>{t('schedule.callSheet')}</div>
            <h1>{gig.name}</h1>
            <div>{gig.venue || t('callsheet.venueTbc')} · {dates}</div>
          </div>
          <div className="muted" style={{ textAlign: 'right', fontSize: '12px' }}>
            {gig.organisations?.name && <div><strong style={{ color: '#111' }}>{gig.organisations.name}</strong></div>}
            <div>{t('callsheet.printed', { date: fmt(new Date(), 'd MMM yyyy, HH:mm') })}</div>
          </div>
        </header>

        {gig.description && <p style={{ marginTop: '12px', whiteSpace: 'pre-wrap' }}>{gig.description}</p>}

        <h2>{t('gig.tab.schedule')}</h2>
        {schedule.length === 0 ? <p className="muted">{t('schedule.empty')}</p> : groupByDay(schedule).map(g => (
          <div key={g.day} style={{ marginBottom: '10px' }}>
            <div style={{ fontWeight: 700, margin: '6px 0' }}>{fmt(g.day, 'EEEE, d MMMM')}</div>
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

        <h2>{t('gig.tab.crew')}</h2>
        {crew.length === 0 ? <p className="muted">{t('overview.noCrew')}</p> : (
          <table className="crew">
            <thead><tr><th>{t('callsheet.call')}</th><th>{t('callsheet.name')}</th><th>{t('callsheet.role')}</th><th>{t('callsheet.phone')}</th></tr></thead>
            <tbody>
              {crew.map(m => (
                <tr key={m.user_id} className={m.user_id === user.id ? 'me' : undefined}>
                  <td className="time">{shortTime(m.call_time) || '—'}</td>
                  <td>{nameOf(m.user_id)}</td>
                  <td>{m.function_title || t(`gigRoleLong.${m.role}`)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{profiles[m.user_id]?.phone ? <a className="tel" href={`tel:${profiles[m.user_id].phone.replace(/[^\d+]/g, '')}`}>{profiles[m.user_id].phone}</a> : <span className="muted">—</span>}</td>
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
