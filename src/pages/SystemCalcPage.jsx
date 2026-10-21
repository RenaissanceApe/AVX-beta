import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Printer, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { saveSnapshot, loadSnapshot, isNetworkError } from '../lib/offline'
import { settingsOf, sourcesOf, listenersOf, speedOfSound, delays, listenerReport, coverage } from '../lib/systemCalc'
import { useI18n } from '../i18n'
import SystemPlotSvg from '../components/tools/SystemPlotSvg'

// Printable sound system sheet (docs/FIELD_TOOLS.md, F4): the plan, each source with its delay
// and coverage, and each listening position with its level and arrival checks, all marked as
// estimates. Readable by everyone on the gig, also offline.
//   /gig/:id/system
export default function SystemCalcPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t, fmt } = useI18n()
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('gigs').select('name, venue, start_date, end_date, organisations(name)').eq('id', id).maybeSingle(),
      supabase.from('gig_show').select('stage, system').eq('gig_id', id).maybeSingle(),
    ]).then(([gigRes, showRes]) => {
      if (gigRes.error && isNetworkError(gigRes.error)) {
        const snap = loadSnapshot(`systemsheet.${id}`)
        return snap ? setData(snap.data) : setError(true)
      }
      if (gigRes.error || !gigRes.data) {
        if (gigRes.error) logger.error('system', gigRes.error, { step: 'print' })
        return setError(true)
      }
      const sheet = { gig: gigRes.data, stage: showRes.data?.stage || {}, system: showRes.data?.system || {} }
      setData(sheet)
      saveSnapshot(`systemsheet.${id}`, sheet)
    })
  }, [id])

  if (error) return <div style={{ padding: '40px', textAlign: 'center' }}>{t('callsheet.notAvailable')} <button onClick={() => navigate('/dashboard')} style={toolbarBtn}>{t('common.back')}</button></div>
  if (!data) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Loader2 size={26} color="#1EC878" style={{ animation: 'spin 1s linear infinite' }} /></div>

  const { gig, stage, system } = data
  const settings = settingsOf(system), sources = sourcesOf(system), listeners = listenersOf(system)
  const set = delays(sources, listeners, settings)
  const reach = coverage(sources, listeners, settings)
  const nameOf = sid => sources.find(s => s.id === sid)?.name || '—'
  const dates = gig.start_date ? fmt(gig.start_date, 'd MMM yyyy') + (gig.end_date && gig.end_date !== gig.start_date ? ` – ${fmt(gig.end_date, 'd MMM yyyy')}` : '') : t('callsheet.datesTbc')

  return (
    <div className="system-page">
      <style>{`
        .system-page { min-height: 100vh; background: #e9edf1; padding: 16px; }
        .sheet { max-width: 1000px; margin: 0 auto; background: #fff; color: #111; border-radius: 8px; padding: 28px; font-size: 13px; }
        .sheet h1 { font-size: 22px; margin-bottom: 2px; }
        .sheet h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #555; margin: 18px 0 6px; border-bottom: 2px solid #111; padding-bottom: 4px; }
        .sheet table { width: 100%; border-collapse: collapse; }
        .sheet th, .sheet td { text-align: left; padding: 3px 6px; border-bottom: 1px solid #ddd; vertical-align: top; }
        .sheet th { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #555; }
        .sheet .muted { color: #555; }
        .sheet .note { border: 1px solid #111; padding: 8px 10px; margin-top: 10px; }
        .wrap { overflow-x: auto; }
        .toolbar { max-width: 1000px; margin: 0 auto 12px; display: flex; justify-content: space-between; gap: 8px; }
        @media (max-width: 600px) { .sheet { padding: 18px 14px; } }
        @media print {
          @page { size: landscape; margin: 10mm; }
          body, .system-page { background: #fff !important; padding: 0; }
          .toolbar { display: none; }
          .sheet { border-radius: 0; padding: 0; max-width: none; }
        }
      `}</style>
      <div className="toolbar">
        <button onClick={() => navigate(`/gig/${id}?tab=tools&tool=system_calc`)} style={toolbarBtn}><ArrowLeft size={14} /> {t('callsheet.backToGig')}</button>
        <button onClick={() => window.print()} style={{ ...toolbarBtn, background: '#0B7A41', color: '#fff', border: 'none' }}><Printer size={14} /> {t('callsheet.print')}</button>
      </div>
      <article className="sheet">
        <div className="muted" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.1em' }}>{t('tools.name.system_calc')}</div>
        <h1>{gig.name}</h1>
        <div>{[gig.venue || t('callsheet.venueTbc'), dates, gig.organisations?.name].filter(Boolean).join(' · ')}</div>
        <p className="note">{t('sys.estimate')}</p>
        <p style={{ marginTop: '8px' }}>
          {t('sys.temp')}: {settings.temp_c} °C · {t('sys.speed', { c: Math.round(speedOfSound(settings.temp_c) * 10) / 10 })} · {t('sys.haas')}: {settings.haas_ms} · {t('sys.ear')}: {settings.ear_m}
        </p>
        {(sources.length > 0 || listeners.length > 0) && (
          <div style={{ marginTop: '14px', maxWidth: '640px' }}>
            <SystemPlotSvg stage={stage} sources={sources} listeners={listeners} paper title={t('sys.drawingTitle', { name: gig.name })} />
          </div>
        )}

        <h2>{t('sys.sources')}</h2>
        <div className="wrap" tabIndex={0} role="region" aria-label={t('sys.sources')}>
          <table>
            <thead>
              <tr><th>{t('sys.name')}</th><th>{t('sys.kindLabel')}</th><th>{t('sys.whereShort')}</th><th>{t('sys.spl')}</th><th>{t('sys.angle')}</th><th>{t('sys.delay')}</th><th>{t('sys.coverage')}</th></tr>
            </thead>
            <tbody>
              {sources.map(s => (
                <tr key={s.id}>
                  <td><strong>{s.name}</strong>{s.count > 1 ? ` × ${s.count}` : ''}</td>
                  <td>{t(`sys.kind.${s.kind}`)}</td>
                  <td>{s.x} / {s.y} / {s.height} m</td>
                  <td>{s.spl} dB</td>
                  <td>{s.angle}°</td>
                  <td><strong style={{ fontFamily: 'var(--font-mono)' }}>{t('sys.delayMs', { ms: set[s.id].ms })}</strong>
                    <div className="muted">{t(`sys.reason.${set[s.id].reason}`, { main: nameOf(set[s.id].from), ms: Math.round((set[s.id].mainWait || 0) * 10) / 10, haas: settings.haas_ms })}</div></td>
                  <td>{reach[s.id] ? t('sys.covers', { width: reach[s.id].width, d: reach[s.id].d }) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {listeners.length > 0 && (
          <>
            <h2>{t('sys.listeners')}</h2>
            <div className="wrap" tabIndex={0} role="region" aria-label={t('sys.listeners')}>
              <table>
                <thead><tr><th>{t('sys.name')}</th><th>{t('sys.whereShort')}</th><th>{t('sys.levelHead')}</th><th>{t('sys.arrivals')}</th></tr></thead>
                <tbody>
                  {listeners.map(l => {
                    const r = listenerReport(l, sources, settings, set)
                    return (
                      <tr key={l.id}>
                        <td><strong>{l.name}</strong></td>
                        <td>{l.x} / {l.y} m</td>
                        <td>{r.total !== null ? t('sys.level', { db: r.total }) : '—'}{r.mains !== null && <div className="muted">{t('sys.fromMains', { db: r.mains })}</div>}</td>
                        <td>{r.checks.length ? r.checks.map(c => <div key={c.id}>{t(`sys.check.${c.state}`, { name: nameOf(c.id), main: nameOf(c.main), ms: Math.abs(c.gap) })}</div>) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
        <p className="muted" style={{ marginTop: '10px', fontSize: '11px' }}>{t('sys.axes')} {t('callsheet.printed', { date: fmt(new Date(), 'd MMM yyyy, HH:mm') })}</p>
      </article>
    </div>
  )
}

const toolbarBtn = {
  display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px',
  border: '1px solid #c5ccd4', background: '#fff', color: '#111', fontWeight: 600, fontSize: '13px', cursor: 'pointer',
}
