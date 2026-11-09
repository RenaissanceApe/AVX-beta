import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Printer, Tag } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { saveSnapshot, loadSnapshot, isNetworkError } from '../lib/offline'
import { placeLabel, ampsLine, figureLabel, supplyLine, generatorLine, cableRows, cableListRows, inrushRows } from '../lib/powerPdf'
import { useI18n } from '../i18n'
import usePowerPlan from '../components/power/usePowerPlan'
import { AvxLoader } from '../components/ui'

// Printable power plan (P1, docs/TOOLS_PLAN.md §4): the supply and its totals, the generator
// suggestion, warnings, each distro with its outputs, and every load with where it's plugged in,
// labelled as an estimate for a qualified electrician. Read-only; it's also On-site mode's power
// view. Readable by everyone on the gig, also offline.
//   /gig/:id/power
export default function PowerPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t, fmt } = useI18n()
  const [gig, setGig] = useState(null)
  const [error, setError] = useState(false)
  const p = usePowerPlan({ id })

  useEffect(() => {
    supabase.from('gigs').select('name, venue, start_date, end_date, organisations(name)').eq('id', id).maybeSingle().then(({ data, error: err }) => {
      if (err && isNetworkError(err)) {
        const snap = loadSnapshot(`powergig.${id}`)
        return snap ? setGig(snap.data) : setError(true)
      }
      if (err || !data) {
        if (err) logger.error('power', err, { step: 'print' })
        return setError(true)
      }
      setGig(data)
      saveSnapshot(`powergig.${id}`, data)
    })
  }, [id])

  if (error) return <div style={{ padding: '40px', textAlign: 'center' }}>{t('callsheet.notAvailable')} <button onClick={() => navigate('/dashboard')} style={toolbarBtn}>{t('common.back')}</button></div>
  if (!gig || !p.plan) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><AvxLoader size={26} color="#1EC878" /></div>

  const { supply, distros, loads, assign, plan, warnings, cables, checks, inrush } = p
  const runs = cableRows({ cables, checks, distros, tr: t })
  const list = cableListRows(cables, t)
  const surges = inrushRows({ inrush, distros, supply, tr: t })
  const dates = gig.start_date ? fmt(gig.start_date, 'd MMM yyyy') + (gig.end_date && gig.end_date !== gig.start_date ? ` – ${fmt(gig.end_date, 'd MMM yyyy')}` : '') : t('callsheet.datesTbc')

  return (
    <div className="power-page">
      <style>{`
        .power-page { min-height: 100vh; background: #e9edf1; padding: 16px; }
        .sheet { max-width: 1000px; margin: 0 auto; background: #fff; color: #111; padding: 28px; font-size: 13px; }
        .sheet h1 { font-size: 22px; margin-bottom: 4px; }
        .sheet h2 { font-size: 13px; font-family: var(--font-mono); text-transform: uppercase; letter-spacing: .08em; color: #555; margin: 16px 0 8px; border-bottom: 2px solid #111; padding-bottom: 4px; }
        .sheet table { width: 100%; border-collapse: collapse; }
        .sheet th, .sheet td { text-align: left; padding: 3px 6px; border-bottom: 1px solid #ddd; vertical-align: top; }
        .sheet th { font-size: 11px; font-family: var(--font-mono); text-transform: uppercase; letter-spacing: .05em; color: #555; }
        .sheet .muted { color: #555; }
        .sheet .note { border: 1px solid #111; padding: 8px 10px; margin-top: 10px; }
        .sheet ul { padding-left: 18px; }
        .wrap { overflow-x: auto; }
        .toolbar { max-width: 1000px; margin: 0 auto 12px; display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
        @media (max-width: 600px) { .sheet { padding: 18px 14px; } }
        @media print {
          @page { size: landscape; margin: 10mm; }
          body, .power-page { background: #fff !important; padding: 0; }
          .toolbar { display: none; }
          .sheet { padding: 0; max-width: none; }
        }
      `}</style>
      <div className="toolbar">
        <button onClick={() => navigate(`/gig/${id}?tab=tools&tool=power`)} style={toolbarBtn}><ArrowLeft size={14} /> {t('callsheet.backToGig')}</button>
        <span style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {(cables.length > 0 || distros.length > 0) && <button onClick={() => navigate(`/gig/${id}/power/labels`)} style={toolbarBtn}><Tag size={14} /> {t('cables.labels')}</button>}
          <button onClick={() => window.print()} style={{ ...toolbarBtn, background: '#0B7A41', color: '#fff', border: 'none' }}><Printer size={14} /> {t('callsheet.print')}</button>
        </span>
      </div>
      <article className="sheet">
        <div className="muted" style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '.1em' }}>{t('tools.name.power')}</div>
        <h1>{gig.name}</h1>
        <div>{[gig.venue || t('callsheet.venueTbc'), dates, gig.organisations?.name].filter(Boolean).join(' · ')}</div>
        {p.savedAt && <p className="muted" role="status">{t('power.offline')}</p>}
        <p className="note"><strong>{t('power.estimate')}</strong></p>

        <h2>{t('power.supply')}</h2>
        <p>{supplyLine(supply, t)}</p>
        <p>{ampsLine(plan.supply.amps, supply.phases)} · {t('power.neutral', { a: plan.supply.neutral })}{supply.phases === 3 && ` · ${t('power.balance', { pct: plan.supply.balance })}`}</p>
        <p><strong>{t('power.generator')}</strong> {generatorLine(plan.generator, t)}</p>
        <p>{t('power.total', { watts: t('power.w', { w: plan.total.watts }), count: plan.total.count })}</p>

        {warnings.length > 0 && (
          <>
            <h2>{t('power.warnings')}</h2>
            <ul>{warnings.map((w, i) => <li key={i}><strong>{t(`power.level.${w.level}`)}:</strong> {t(w.key, w.vars)}</li>)}</ul>
          </>
        )}

        {distros.map(d => {
          const r = plan.distros[d.id]
          return (
            <section key={d.id}>
              <h2>{d.name} · {t(`power.status.${r.status}`)}</h2>
              <p>{t('power.feed')}: {!d.feed ? t('power.notPlugged') : d.feed === 'supply' ? t('power.fromSupply') : placeLabel(d.feed, distros, supply, t)} · {ampsLine(r.amps, supply.phases)}{r.rating ? ` · ${t('power.rating', { a: r.rating })}` : ''}</p>
              <div className="wrap" tabIndex={0} role="region" aria-label={t('power.outputsOf', { name: d.name })}>
                <table>
                  <thead><tr><th>{t('power.outputLabel')}</th><th>{t('power.connector')}</th><th>{t('power.phase')}</th><th>{t('power.breaker')}</th><th>{t('power.rcd')}</th><th>{t('power.current')}</th><th>{t('power.headroom')}</th><th>{t('power.loads')}</th></tr></thead>
                  <tbody>
                    {d.outputs.map((o, i) => {
                      const x = r.outputs[o.id]
                      return (
                        <tr key={o.id}>
                          <td><strong>{o.label || t('power.outputN', { n: i + 1 })}</strong></td>
                          <td>{t(`power.conn.${o.connector}`)}</td><td>{o.phase}</td>
                          <td>{x.rating ? `${x.rating} A` : ''}</td><td>{o.rcd_ma ? `${o.rcd_ma} mA` : ''}</td>
                          <td>{ampsLine(x.amps, supply.phases)}</td>
                          <td>{Math.round((x.ratio || 0) * 100)}% · <strong>{t(`power.state.${x.state}`)}</strong></td>
                          <td>{x.loads.map(k => loads.find(l => l.key === k)?.name).filter(Boolean).join(', ')}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )
        })}

        {loads.length > 0 && (
          <>
            <h2>{t('power.loads')}</h2>
            <div className="wrap" tabIndex={0} role="region" aria-label={t('power.loads')}>
              <table>
                <thead><tr><th>{t('power.loadName')}</th><th>{t('power.kindLabel')}</th><th>{t('power.qty')}</th><th>{t('power.draw')}</th><th>{t('power.pluggedHead')}</th><th>{t('power.statusHead')}</th></tr></thead>
                <tbody>
                  {loads.map(l => (
                    <tr key={l.key}>
                      <td><strong>{l.name}</strong>{l.detail ? <div className="muted">{l.detail}</div> : null}</td>
                      <td>{t(`power.kind.${l.kind}`)}</td><td>{l.qty}</td><td>{figureLabel(l, t)}</td>
                      <td>{placeLabel(assign[l.key], distros, supply, t)}</td>
                      <td><strong>{t(`power.status.${plan.loads[l.key].status}`)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {surges.length > 0 && (
          <>
            <h2>{t('inrush.title')}</h2>
            <div className="wrap" tabIndex={0} role="region" aria-label={t('inrush.title')}>
              <table>
                <thead><tr><th>{t('inrush.where')}</th><th>{t('inrush.head')}</th><th>{t('power.breaker')}</th><th>{t('power.statusHead')}</th></tr></thead>
                <tbody>{surges.map(r => <tr key={r.key}><td><strong>{r.where}</strong></td><td>{r.sum}</td><td>{r.breaker}</td><td><strong>{r.state}</strong></td></tr>)}</tbody>
              </table>
            </div>
          </>
        )}

        {runs.length > 0 && (
          <>
            <h2>{t('cables.title')}</h2>
            <div className="wrap" tabIndex={0} role="region" aria-label={t('cables.title')}>
              <table>
                <thead><tr><th>{t('cables.run')}</th><th>{t('cables.type')}</th><th>{t('cables.length')}</th><th>{t('cables.laying')}</th><th>{t('power.current')}</th><th>{t('cables.capacityHead')}</th><th>{t('cables.dropHead')}</th><th>{t('power.statusHead')}</th></tr></thead>
                <tbody>{runs.map(r => <tr key={r.key}><td><strong>{r.name}</strong></td><td>{r.type}</td><td>{r.length}</td><td>{r.laying}</td><td>{r.amps}</td><td>{r.cap}</td><td>{r.drop}</td><td><strong>{r.state}</strong></td></tr>)}</tbody>
              </table>
            </div>
          </>
        )}

        {list.length > 0 && (
          <>
            <h2>{t('cables.list')}</h2>
            <div className="wrap" tabIndex={0} role="region" aria-label={t('cables.list')}>
              <table>
                <thead><tr><th>{t('power.qty')}</th><th>{t('cables.type')}</th><th>{t('cables.kindLabel')}</th></tr></thead>
                <tbody>{list.map(r => <tr key={r.key}><td>{r.qty}</td><td><strong>{r.name}</strong></td><td>{r.kind}</td></tr>)}</tbody>
              </table>
            </div>
          </>
        )}

        <h2>{t('power.assumptions')}</h2>
        <ul>{['sum', 'pf', 'harmonics', 'amps', 'unplugged'].map(k => <li key={k}>{t(`power.assume.${k}`)}</li>)}</ul>
        {(runs.length > 0 || surges.length > 0) && <ul>{CABLE_ASSUMPTIONS.map(k => <li key={k}>{t(`cables.assume.${k}`)}</li>)}</ul>}
        <p className="muted" style={{ marginTop: '12px', fontSize: '11px' }}>{t('callsheet.printed', { date: fmt(new Date(), 'd MMM yyyy, HH:mm') })}</p>
      </article>
    </div>
  )
}

export const CABLE_ASSUMPTIONS = ['drop', 'capacity', 'inrush', 'sources']

const toolbarBtn = {
  display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 14px',
  border: '1px solid #c5ccd4', background: '#fff', color: '#111', fontWeight: 600, fontSize: '13px', cursor: 'pointer',
}
