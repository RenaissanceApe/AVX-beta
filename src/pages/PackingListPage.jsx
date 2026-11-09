import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Printer, PenLine } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { activeSteps, lineStep, stepCounts } from '../lib/inventory'
import { useI18n } from '../i18n'
import { AvxLoader } from '../components/ui'
import { useAuth } from '../lib/AuthContext'
import { DeliveryNoteModal, DeliveryNoteList } from '../components/signatures/DeliveryNotes'
import PrintFooter from '../components/PrintFooter'

// Printable packing list: what goes to the gig, by category, with packing notes, what's
// already been scanned out and back, and how far each line has got through the organisation's
// steps (docs/HELP.md, H5b). Readable by everyone on the gig. Whoever may scan gear out can have
// the client sign a delivery note on the phone (step 16); signed notes are listed below.
//   /gig/:id/packing
export default function PackingListPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t, fmt } = useI18n()
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)
  const { user } = useAuth()
  const [signing, setSigning] = useState(false)
  const [signedKey, setSignedKey] = useState(0)

  useEffect(() => {
    Promise.all([
      supabase.from('gigs').select('*, organisations(name, equipment_steps)').eq('id', id).maybeSingle(),
      supabase.rpc('gig_dispatch_summary', { p_gig: id }),
      supabase.rpc('gig_units_out', { p_gig: id }),
      supabase.rpc('gig_step_summary', { p_gig: id }),
      supabase.from('gig_members').select('role').eq('gig_id', id).eq('user_id', user.id).maybeSingle(),
    ]).then(async ([gigRes, sumRes, unitsRes, stepRes, memberRes]) => {
      if (gigRes.error || !gigRes.data) {
        if (gigRes.error) logger.error('packing', gigRes.error, { gigId: id })
        return setError(true)
      }
      if (sumRes.error) logger.error('packing', sumRes.error, { step: 'summary' })
      if (stepRes.error) logger.error('packing', stepRes.error, { step: 'steps' })
      // Who may collect a delivery note: the same people who may scan out (can_dispatch)
      const { data: orgRow } = gigRes.data.org_id
        ? await supabase.from('org_members').select('role').eq('org_id', gigRes.data.org_id).eq('user_id', user.id).maybeSingle()
        : { data: null }
      const canSign = !!gigRes.data.org_id && (gigRes.data.created_by === user.id || memberRes.data?.role === 'pm' || ['admin', 'member'].includes(orgRow?.role))
      setData({ gig: gigRes.data, rows: sumRes.data || [], units: unitsRes.data || [], counts: stepCounts(stepRes.data), canSign })
    })
  }, [id, user.id])

  if (error) return <div style={{ padding: '40px', textAlign: 'center', color: '#fff' }}>{t('callsheet.notAvailable')} <button onClick={() => navigate('/dashboard')} style={toolbarBtn}>{t('common.back')}</button></div>
  if (!data) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><AvxLoader size={26} color="#1EC878" /></div>

  const { gig, rows, units, counts } = data
  const steps = activeSteps(gig.organisations?.equipment_steps || null)
  const groups = rows.reduce((map, r) => { const k = r.category || ''; (map[k] ||= []).push(r); return map }, {})
  const dates = gig.start_date
    ? fmt(gig.start_date, 'd MMM yyyy') + (gig.end_date && gig.end_date !== gig.start_date ? ` – ${fmt(gig.end_date, 'd MMM yyyy')}` : '')
    : t('callsheet.datesTbc')
  const unitsByItem = units.reduce((map, u) => { (map[u.item_id] ||= []).push(u); return map }, {})

  return (
    <div className="packing-page">
      <style>{`
        .packing-page { min-height: 100vh; background: #e9edf1; padding: 16px; }
        .sheet { max-width: 800px; margin: 0 auto; background: #fff; color: #111; padding: 32px; font-size: 13px; }
        .sheet h1 { font-size: 24px; margin-bottom: 2px; }
        .sheet h2 { font-size: 13px; font-family: var(--font-mono); text-transform: uppercase; letter-spacing: .08em; color: #555; margin: 20px 0 6px; border-bottom: 2px solid #111; padding-bottom: 4px; }
        .sheet table { width: 100%; border-collapse: collapse; }
        .sheet th { text-align: left; font-size: 11px; font-family: var(--font-mono); text-transform: uppercase; color: #666; padding: 4px 6px; border-bottom: 1px solid #ccc; }
        .sheet td { padding: 6px; border-bottom: 1px solid #eee; vertical-align: top; }
        .sheet .box { width: 14px; height: 14px; border: 1.5px solid #111; display: inline-block; }
        .sheet .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .sheet .muted { color: #666; }
        .sheet .step { white-space: nowrap; font-size: 13px; }
        .signed-notes { margin-top: 24px; }
        .toolbar { max-width: 800px; margin: 0 auto 12px; display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
        @media print {
          @page { margin: 12mm; }
          body, .packing-page { background: #fff !important; padding: 0; }
          .toolbar, .signed-notes { display: none; }
          .sheet { padding: 0; max-width: none; }
          tr { break-inside: avoid; }
        }
      `}</style>
      <div className="toolbar">
        <button onClick={() => navigate(`/gig/${id}?tab=equipment`)} style={toolbarBtn}><ArrowLeft size={14} /> {t('callsheet.backToGig')}</button>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {data.canSign && <button onClick={() => setSigning(true)} style={toolbarBtn}><PenLine size={14} aria-hidden="true" /> {t('delivery.sign')}</button>}
          <button onClick={() => window.print()} style={{ ...toolbarBtn, background: '#0B7A41', color: '#fff', border: 'none' }}><Printer size={14} /> {t('callsheet.print')}</button>
        </div>
      </div>
      {signing && <DeliveryNoteModal data={data} onClose={() => setSigning(false)} onSigned={() => { setSigning(false); setSignedKey(k => k + 1) }} />}
      <article className="sheet">
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <div className="muted" style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '.1em' }}>{t('packing.title')}</div>
            <h1>{gig.name}</h1>
            <div>{gig.venue || t('callsheet.venueTbc')} · {dates}</div>
          </div>
          <div className="muted" style={{ textAlign: 'right', fontSize: '13px' }}>
            {gig.organisations?.name && <div><strong style={{ color: '#111' }}>{gig.organisations.name}</strong></div>}
          </div>
        </header>
        {rows.length === 0 ? <p className="muted" style={{ marginTop: '20px' }}>{t('equip.empty')}</p> : Object.entries(groups)
          .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b))).map(([category, list]) => (
            <section key={category || '—'}>
              <h2>{category || t('prices.noCategory')}</h2>
              <table>
                <thead><tr><th style={{ width: '28px' }} /><th className="num" style={{ width: '50px' }}>{t('packing.qty')}</th><th>{t('packing.item')}</th><th className="num">{t('packing.out')}</th><th className="num">{t('packing.back')}</th><th>{t('packing.step')}</th></tr></thead>
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
                      <td className="step">{(() => { const at = lineStep(r, counts[r.item_id], steps); return at ? t(`steps.name.${at}`) : '' })()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        <p className="muted" style={{ marginTop: '18px', fontSize: '11px' }}>{t('packing.footer')}</p>
        <DeliveryNoteList gigId={id} canSign={data.canSign} refreshKey={signedKey} />
        <PrintFooter />
      </article>
    </div>
  )
}

const toolbarBtn = {
  display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 14px', 
  border: '1px solid #c5ccd4', background: '#fff', color: '#111', fontWeight: 600, fontSize: '13px', cursor: 'pointer',
}
