import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Printer, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { saveSnapshot, loadSnapshot, isNetworkError } from '../lib/offline'
import { SYMBOLS } from '../lib/stagePlot'
import { useI18n } from '../i18n'
import StagePlotSvg from '../components/tools/StagePlotSvg'

// Printable stage plot (docs/FIELD_TOOLS.md, F1b): the drawing in black on white, with the list
// of what's on stage underneath. Readable by everyone on the gig, also offline.
//   /gig/:id/plot
export default function StagePlotPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t, fmt } = useI18n()
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('gigs').select('name, venue, start_date, end_date, organisations(name)').eq('id', id).maybeSingle(),
      supabase.from('gig_plot_items').select('id, kind, label, x, y, rotation, notes').eq('gig_id', id).order('created_at'),
      supabase.from('gig_show').select('stage').eq('gig_id', id).maybeSingle(),
    ]).then(([gigRes, plotRes, showRes]) => {
      if (gigRes.error && isNetworkError(gigRes.error)) {
        const snap = loadSnapshot(`plotsheet.${id}`)
        return snap ? setData(snap.data) : setError(true)
      }
      if (gigRes.error || !gigRes.data) {
        if (gigRes.error) logger.error('plot', gigRes.error, { step: 'print' })
        return setError(true)
      }
      const sheet = { gig: gigRes.data, items: plotRes.data || [], stage: showRes.data?.stage || {} }
      setData(sheet)
      saveSnapshot(`plotsheet.${id}`, sheet)
    })
  }, [id])

  if (error) return <div style={{ padding: '40px', textAlign: 'center' }}>{t('callsheet.notAvailable')} <button onClick={() => navigate('/dashboard')} style={toolbarBtn}>{t('common.back')}</button></div>
  if (!data) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Loader2 size={26} color="#1EC878" style={{ animation: 'spin 1s linear infinite' }} /></div>

  const { gig, items, stage } = data
  const dates = gig.start_date ? fmt(gig.start_date, 'd MMM yyyy') + (gig.end_date && gig.end_date !== gig.start_date ? ` – ${fmt(gig.end_date, 'd MMM yyyy')}` : '') : t('callsheet.datesTbc')
  const list = [...items].sort((a, b) => Number(b.y) - Number(a.y) || Number(a.x) - Number(b.x))

  return (
    <div className="plot-page">
      <style>{`
        .plot-page { min-height: 100vh; background: #e9edf1; padding: 16px; }
        .sheet { max-width: 1000px; margin: 0 auto; background: #fff; color: #111; border-radius: 8px; padding: 28px; font-size: 13px; }
        .sheet h1 { font-size: 22px; margin-bottom: 2px; }
        .sheet h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #555; margin: 18px 0 6px; border-bottom: 2px solid #111; padding-bottom: 4px; }
        .sheet ul { list-style: none; padding: 0; columns: 2; column-gap: 24px; }
        .sheet li { padding: 3px 0; break-inside: avoid; }
        .sheet .muted { color: #555; }
        .toolbar { max-width: 1000px; margin: 0 auto 12px; display: flex; justify-content: space-between; gap: 8px; }
        @media (max-width: 600px) { .sheet ul { columns: 1; } .sheet { padding: 18px 14px; } }
        @media print {
          @page { size: landscape; margin: 10mm; }
          body, .plot-page { background: #fff !important; padding: 0; }
          .toolbar { display: none; }
          .sheet { border-radius: 0; padding: 0; max-width: none; }
        }
      `}</style>
      <div className="toolbar">
        <button onClick={() => navigate(`/gig/${id}?tab=tools&tool=stage_plot`)} style={toolbarBtn}><ArrowLeft size={14} /> {t('callsheet.backToGig')}</button>
        <button onClick={() => window.print()} style={{ ...toolbarBtn, background: '#0B7A41', color: '#fff', border: 'none' }}><Printer size={14} /> {t('callsheet.print')}</button>
      </div>
      <article className="sheet">
        <div className="muted" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.1em' }}>{t('tools.name.stage_plot')}</div>
        <h1>{gig.name}</h1>
        <div>{[gig.venue || t('callsheet.venueTbc'), dates, gig.organisations?.name].filter(Boolean).join(' · ')}</div>
        <div style={{ marginTop: '14px' }}>
          <StagePlotSvg stage={stage} items={items} paper title={t('plot.drawingTitle', { name: gig.name })} />
        </div>
        <h2>{t('plot.onStage')}</h2>
        <ul>
          {list.map(item => (
            <li key={item.id}>
              <strong>{t(`plot.kind.${item.kind}`)}</strong>{item.label ? ` · ${item.label}` : ''}
              <span className="muted"> · {t('plot.where', { x: Number(item.x), y: Number(item.y) })}{SYMBOLS[item.kind]?.inputs.length ? ` · ${t('plot.channels', { count: SYMBOLS[item.kind].inputs.length })}` : ''}</span>
              {item.notes && <div className="muted">{item.notes}</div>}
            </li>
          ))}
        </ul>
        <p className="muted" style={{ marginTop: '10px', fontSize: '11px' }}>{t('callsheet.printed', { date: fmt(new Date(), 'd MMM yyyy, HH:mm') })}</p>
      </article>
    </div>
  )
}

const toolbarBtn = {
  display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px',
  border: '1px solid #c5ccd4', background: '#fff', color: '#111', fontWeight: 600, fontSize: '13px', cursor: 'pointer',
}
