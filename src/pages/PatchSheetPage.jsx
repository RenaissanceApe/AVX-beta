import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Printer, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { saveSnapshot, loadSnapshot, isNetworkError } from '../lib/offline'
import { boxesOf, patchView } from '../lib/patch'
import { overlaps, universeUse, dmxRange } from '../lib/dmx'
import { useI18n } from '../i18n'

// Printable patch sheets (docs/FIELD_TOOLS.md, F2), black on white, also offline:
//   /gig/:id/patch  the stage boxes, socket by socket
//   /gig/:id/dmx    the DMX patch, universe by universe
export default function PatchSheetPage({ kind }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t, fmt } = useI18n()
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)
  const key = `${kind}sheet.${id}`

  useEffect(() => {
    Promise.all([
      supabase.from('gigs').select('name, venue, start_date, end_date, organisations(name)').eq('id', id).maybeSingle(),
      kind === 'dmx'
        ? supabase.from('gig_fixtures').select('id, name, fixture_type, mode, footprint, universe, address, position, sort').eq('gig_id', id)
        : supabase.from('gig_inputs').select('id, channel, source, stage_box, phantom').eq('gig_id', id).order('channel'),
      kind === 'dmx' ? Promise.resolve({ data: null }) : supabase.from('gig_show').select('audio').eq('gig_id', id).maybeSingle(),
    ]).then(([gigRes, rowsRes, showRes]) => {
      if (gigRes.error && isNetworkError(gigRes.error)) {
        const snap = loadSnapshot(key)
        return snap ? setData(snap.data) : setError(true)
      }
      if (gigRes.error || !gigRes.data) {
        if (gigRes.error) logger.error(kind, gigRes.error, { step: 'print' })
        return setError(true)
      }
      const sheet = { gig: gigRes.data, rows: rowsRes.data || [], audio: showRes.data?.audio || {} }
      setData(sheet)
      saveSnapshot(key, sheet)
    })
  }, [id, kind, key])

  if (error) return <div style={{ padding: '40px', textAlign: 'center' }}>{t('callsheet.notAvailable')} <button onClick={() => navigate('/dashboard')} style={toolbarBtn}>{t('common.back')}</button></div>
  if (!data) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Loader2 size={26} color="#1EC878" style={{ animation: 'spin 1s linear infinite' }} /></div>

  const { gig, rows, audio } = data
  const dates = gig.start_date ? fmt(gig.start_date, 'd MMM yyyy') + (gig.end_date && gig.end_date !== gig.start_date ? ` – ${fmt(gig.end_date, 'd MMM yyyy')}` : '') : t('callsheet.datesTbc')
  const tool = kind === 'dmx' ? 'dmx_patch' : 'patch'

  return (
    <div className="sheet-page">
      <style>{`
        .sheet-page { min-height: 100vh; background: #e9edf1; padding: 16px; }
        .sheet { max-width: 900px; margin: 0 auto; background: #fff; color: #111; border-radius: 8px; padding: 28px; font-size: 13px; }
        .sheet h1 { font-size: 22px; margin-bottom: 2px; }
        .sheet h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em; margin: 20px 0 6px; border-bottom: 2px solid #111; padding-bottom: 4px; }
        .sheet table { width: 100%; border-collapse: collapse; }
        .sheet th { text-align: left; font-size: 11px; text-transform: uppercase; color: #555; padding: 4px 6px; border-bottom: 1px solid #999; }
        .sheet td { padding: 5px 6px; border-bottom: 1px solid #ddd; vertical-align: top; }
        .sheet .num { font-family: monospace; font-weight: 800; white-space: nowrap; }
        .sheet .muted { color: #555; }
        .sheet .warn { font-weight: 800; }
        .toolbar { max-width: 900px; margin: 0 auto 12px; display: flex; justify-content: space-between; gap: 8px; }
        @media print {
          @page { margin: 10mm; }
          body, .sheet-page { background: #fff !important; padding: 0; }
          .toolbar { display: none; }
          .sheet { border-radius: 0; padding: 0; max-width: none; }
          tr { break-inside: avoid; }
        }
      `}</style>
      <div className="toolbar">
        <button onClick={() => navigate(`/gig/${id}?tab=tools&tool=${tool}`)} style={toolbarBtn}><ArrowLeft size={14} /> {t('callsheet.backToGig')}</button>
        <button onClick={() => window.print()} style={{ ...toolbarBtn, background: '#0B7A41', color: '#fff', border: 'none' }}><Printer size={14} /> {t('callsheet.print')}</button>
      </div>
      <article className="sheet">
        <div className="muted" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.1em' }}>{t(`tools.name.${tool}`)}</div>
        <h1>{gig.name}</h1>
        <div>{[gig.venue || t('callsheet.venueTbc'), dates, gig.organisations?.name].filter(Boolean).join(' · ')}</div>
        {kind === 'dmx' ? <DmxSheet rows={rows} t={t} /> : <PatchSheet audio={audio} rows={rows} t={t} />}
        <p className="muted" style={{ marginTop: '14px', fontSize: '11px' }}>{t('callsheet.printed', { date: fmt(new Date(), 'd MMM yyyy, HH:mm') })}</p>
      </article>
    </div>
  )
}

function PatchSheet({ audio, rows, t }) {
  const view = patchView(boxesOf(audio), rows)
  return (
    <>
      {view.boxes.map(b => (
        <section key={b.name}>
          <h2>{b.name} · {t('patch.boxInputsCount', { count: b.inputs })}{b.split ? ` · ${t('patch.splitBadge')}` : ''}</h2>
          <table>
            <thead><tr><th>{t('patch.socket')}</th><th>{t('inputs.chShort')}</th><th>{t('inputs.source')}</th><th>48V</th></tr></thead>
            <tbody>
              {b.sockets.map(s => (
                <tr key={s.socket}>
                  <td className="num">{String(s.socket).padStart(2, '0')}</td>
                  <td className="num">{s.lines.map(l => l.channel).join(' + ')}</td>
                  <td className={s.lines.length > 1 ? 'warn' : ''}>{s.lines.map(l => l.source).join(' + ') || <span className="muted">—</span>}</td>
                  <td className="warn">{s.lines.some(l => l.phantom) ? '48V' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      {view.loose.length > 0 && (
        <section>
          <h2>{t('patch.loose', { count: view.loose.length })}</h2>
          <p>{view.loose.map(l => `${l.channel} ${l.source}`).join(' · ')}</p>
        </section>
      )}
    </>
  )
}

function DmxSheet({ rows, t }) {
  const bad = overlaps(rows)
  return universeUse(rows).map(u => (
    <section key={u.universe}>
      <h2>{t('dmx.universe', { n: u.universe })} · {t('dmx.used', { used: u.channels, total: 512 })}</h2>
      <table>
        <thead><tr><th>{t('dmx.address')}</th><th>{t('dmx.name')}</th><th>{t('dmx.type')}</th><th>{t('dmx.mode')}</th><th>{t('dmx.position')}</th></tr></thead>
        <tbody>
          {rows.filter(f => f.universe === u.universe).sort((a, b) => (a.address ?? 9999) - (b.address ?? 9999) || a.name.localeCompare(b.name)).map(f => (
            <tr key={f.id}>
              <td className="num">{dmxRange(f, '—')}{bad.has(f.id) ? ' !' : ''}</td>
              <td><strong>{f.name}</strong></td>
              <td>{f.fixture_type} <span className="muted">({t('dmx.channelsShort', { count: f.footprint })})</span></td>
              <td>{f.mode || ''}</td>
              <td>{f.position || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  ))
}

const toolbarBtn = {
  display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px',
  border: '1px solid #c5ccd4', background: '#fff', color: '#111', fontWeight: 600, fontSize: '13px', cursor: 'pointer',
}
