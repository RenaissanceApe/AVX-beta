import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Printer, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { useI18n } from '../i18n'

// Printable packing list: what goes to the gig, by category, with packing notes and
// what's already been scanned out and back. Readable by everyone on the gig.
//   /gig/:id/packing
export default function PackingListPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t, fmt } = useI18n()
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('gigs').select('*, organisations(name)').eq('id', id).maybeSingle(),
      supabase.rpc('gig_dispatch_summary', { p_gig: id }),
      supabase.rpc('gig_units_out', { p_gig: id }),
    ]).then(([gigRes, sumRes, unitsRes]) => {
      if (gigRes.error || !gigRes.data) {
        if (gigRes.error) logger.error('packing', gigRes.error, { gigId: id })
        return setError(true)
      }
      if (sumRes.error) logger.error('packing', sumRes.error, { step: 'summary' })
      setData({ gig: gigRes.data, rows: sumRes.data || [], units: unitsRes.data || [] })
    })
  }, [id])

  if (error) return <div style={{ padding: '40px', textAlign: 'center', color: '#fff' }}>{t('callsheet.notAvailable')} <button onClick={() => navigate('/dashboard')} style={toolbarBtn}>{t('common.back')}</button></div>
  if (!data) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Loader2 size={26} color="#1EC878" style={{ animation: 'spin 1s linear infinite' }} /></div>

  const { gig, rows, units } = data
  const groups = rows.reduce((map, r) => { const k = r.category || ''; (map[k] ||= []).push(r); return map }, {})
  const dates = gig.start_date
    ? fmt(gig.start_date, 'd MMM yyyy') + (gig.end_date && gig.end_date !== gig.start_date ? ` – ${fmt(gig.end_date, 'd MMM yyyy')}` : '')
    : t('callsheet.datesTbc')
  const unitsByItem = units.reduce((map, u) => { (map[u.item_id] ||= []).push(u); return map }, {})

  return (
    <div className="packing-page">
      <style>{`
        .packing-page { min-height: 100vh; background: #e9edf1; padding: 16px; }
        .sheet { max-width: 800px; margin: 0 auto; background: #fff; color: #111; border-radius: 8px; padding: 32px; font-size: 13px; }
        .sheet h1 { font-size: 24px; margin-bottom: 2px; }
        .sheet h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #555; margin: 20px 0 6px; border-bottom: 2px solid #111; padding-bottom: 4px; }
        .sheet table { width: 100%; border-collapse: collapse; }
        .sheet th { text-align: left; font-size: 11px; text-transform: uppercase; color: #666; padding: 4px 6px; border-bottom: 1px solid #ccc; }
        .sheet td { padding: 6px; border-bottom: 1px solid #eee; vertical-align: top; }
        .sheet .box { width: 14px; height: 14px; border: 1.5px solid #111; border-radius: 2px; display: inline-block; }
        .sheet .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .sheet .muted { color: #666; }
        .toolbar { max-width: 800px; margin: 0 auto 12px; display: flex; justify-content: space-between; }
        @media print {
          @page { margin: 12mm; }
          body, .packing-page { background: #fff !important; padding: 0; }
          .toolbar { display: none; }
          .sheet { border-radius: 0; padding: 0; max-width: none; }
          tr { break-inside: avoid; }
        }
      `}</style>
      <div className="toolbar">
        <button onClick={() => navigate(`/gig/${id}?tab=equipment`)} style={toolbarBtn}><ArrowLeft size={14} /> {t('callsheet.backToGig')}</button>
        <button onClick={() => window.print()} style={{ ...toolbarBtn, background: '#0FA85A', color: '#fff', border: 'none' }}><Printer size={14} /> {t('callsheet.print')}</button>
      </div>
      <article className="sheet">
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <div className="muted" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.1em' }}>{t('packing.title')}</div>
            <h1>{gig.name}</h1>
            <div>{gig.venue || t('callsheet.venueTbc')} · {dates}</div>
          </div>
          <div className="muted" style={{ textAlign: 'right', fontSize: '12px' }}>
            {gig.organisations?.name && <div><strong style={{ color: '#111' }}>{gig.organisations.name}</strong></div>}
            <div>{t('callsheet.printed', { date: fmt(new Date(), 'd MMM yyyy, HH:mm') })}</div>
          </div>
        </header>
        {rows.length === 0 ? <p className="muted" style={{ marginTop: '20px' }}>{t('equip.empty')}</p> : Object.entries(groups)
          .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b))).map(([category, list]) => (
            <section key={category || '—'}>
              <h2>{category || t('prices.noCategory')}</h2>
              <table>
                <thead><tr><th style={{ width: '28px' }} /><th className="num" style={{ width: '50px' }}>{t('packing.qty')}</th><th>{t('packing.item')}</th><th className="num">{t('packing.out')}</th><th className="num">{t('packing.back')}</th></tr></thead>
                <tbody>
                  {list.map(r => (
                    <tr key={r.item_id}>
                      <td><span className="box" /></td>
                      <td className="num"><strong>{r.planned || '—'}</strong></td>
                      <td>
                        <strong>{r.item_name}</strong>
                        {r.packing_note && <div className="muted">{r.packing_note}</div>}
                        {unitsByItem[r.item_id] && <div className="muted" style={{ fontFamily: 'monospace', fontSize: '11px' }}>{unitsByItem[r.item_id].map(u => u.code).join('  ')}</div>}
                        {!r.planned && <div className="muted">{t('dispatch.notPlannedShort')}</div>}
                      </td>
                      <td className="num">{r.out_qty || ''}</td>
                      <td className="num">{r.back_qty || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        <p className="muted" style={{ marginTop: '18px', fontSize: '11px' }}>{t('packing.footer')}</p>
      </article>
    </div>
  )
}

const toolbarBtn = {
  display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px',
  border: '1px solid #c5ccd4', background: '#fff', color: '#111', fontWeight: 600, fontSize: '13px', cursor: 'pointer',
}
