import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Printer, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { saveSnapshot, loadSnapshot, isNetworkError } from '../lib/offline'
import { inputCounts } from '../lib/tools'
import { useI18n } from '../i18n'

// Printable input list (docs/FIELD_TOOLS.md, F1): channel, source, mic or DI, stand, 48V, stage
// box and notes, for the desk and the stage. Readable by everyone on the gig, also offline.
//   /gig/:id/inputs
export default function InputListPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t, fmt } = useI18n()
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('gigs').select('name, venue, start_date, end_date, organisations(name)').eq('id', id).maybeSingle(),
      supabase.from('gig_inputs').select('channel, source, mic, stand, phantom, stage_box, notes').eq('gig_id', id).order('channel'),
    ]).then(([gigRes, inRes]) => {
      if (gigRes.error && isNetworkError(gigRes.error)) {
        const snap = loadSnapshot(`inputsheet.${id}`)
        return snap ? setData(snap.data) : setError(true)
      }
      if (gigRes.error || !gigRes.data) {
        if (gigRes.error) logger.error('inputs', gigRes.error, { step: 'print' })
        return setError(true)
      }
      const sheet = { gig: gigRes.data, inputs: inRes.data || [] }
      setData(sheet)
      saveSnapshot(`inputsheet.${id}`, sheet)
    })
  }, [id])

  if (error) return <div style={{ padding: '40px', textAlign: 'center' }}>{t('callsheet.notAvailable')} <button onClick={() => navigate('/dashboard')} style={toolbarBtn}>{t('common.back')}</button></div>
  if (!data) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Loader2 size={26} color="#1EC878" style={{ animation: 'spin 1s linear infinite' }} /></div>

  const { gig, inputs } = data
  const counts = inputCounts(inputs)
  const dates = gig.start_date ? fmt(gig.start_date, 'd MMM yyyy') + (gig.end_date && gig.end_date !== gig.start_date ? ` – ${fmt(gig.end_date, 'd MMM yyyy')}` : '') : t('callsheet.datesTbc')

  return (
    <div className="inputs-page">
      <style>{`
        .inputs-page { min-height: 100vh; background: #e9edf1; padding: 16px; }
        .sheet { max-width: 900px; margin: 0 auto; background: #fff; color: #111; border-radius: 8px; padding: 28px; font-size: 13px; }
        .sheet h1 { font-size: 22px; margin-bottom: 2px; }
        .sheet table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        .sheet th { text-align: left; font-size: 11px; text-transform: uppercase; color: #555; padding: 5px 6px; border-bottom: 2px solid #111; }
        .sheet td { padding: 6px; border-bottom: 1px solid #ddd; vertical-align: top; }
        .sheet .ch { font-family: monospace; font-weight: 800; font-size: 15px; width: 40px; text-align: right; }
        .sheet .p48 { font-weight: 800; }
        .sheet .box { white-space: nowrap; }
        .sheet .muted { color: #555; }
        .wrap { overflow-x: auto; }
        .toolbar { max-width: 900px; margin: 0 auto 12px; display: flex; justify-content: space-between; gap: 8px; }
        @media print {
          @page { margin: 10mm; }
          body, .inputs-page { background: #fff !important; padding: 0; }
          .toolbar { display: none; }
          .sheet { border-radius: 0; padding: 0; max-width: none; }
          tr { break-inside: avoid; }
        }
      `}</style>
      <div className="toolbar">
        <button onClick={() => navigate(`/gig/${id}?tab=tools&tool=input_list`)} style={toolbarBtn}><ArrowLeft size={14} /> {t('callsheet.backToGig')}</button>
        <button onClick={() => window.print()} style={{ ...toolbarBtn, background: '#0B7A41', color: '#fff', border: 'none' }}><Printer size={14} /> {t('callsheet.print')}</button>
      </div>
      <article className="sheet">
        <div className="muted" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.1em' }}>{t('tools.name.input_list')}</div>
        <h1>{gig.name}</h1>
        <div>{[gig.venue || t('callsheet.venueTbc'), dates, gig.organisations?.name].filter(Boolean).join(' · ')}</div>
        <div className="muted" style={{ marginTop: '4px' }}>
          {t('inputs.count', { count: counts.total })}{counts.phantom > 0 && ` · ${t('inputs.phantomCount', { count: counts.phantom })}`}
          {' · '}{t('callsheet.printed', { date: fmt(new Date(), 'd MMM yyyy, HH:mm') })}
        </div>
        <div className="wrap" tabIndex={0} role="region" aria-label={t('tools.name.input_list')}>
          <table>
            <thead><tr>
              <th className="ch">{t('inputs.chShort')}</th><th>{t('inputs.source')}</th><th>{t('inputs.mic')}</th><th>{t('inputs.stand')}</th>
              <th>48V</th><th>{t('inputs.box')}</th><th>{t('inputs.notes')}</th>
            </tr></thead>
            <tbody>
              {inputs.map(i => (
                <tr key={i.channel}>
                  <td className="ch">{i.channel}</td>
                  <td><strong>{i.source}</strong></td>
                  <td>{i.mic || ''}</td>
                  <td>{i.stand || ''}</td>
                  <td className="p48">{i.phantom ? '48V' : ''}</td>
                  <td className="box">{i.stage_box || ''}</td>
                  <td className="muted">{i.notes || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  )
}

const toolbarBtn = {
  display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px',
  border: '1px solid #c5ccd4', background: '#fff', color: '#111', fontWeight: 600, fontSize: '13px', cursor: 'pointer',
}
