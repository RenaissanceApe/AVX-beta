import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Printer, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { saveSnapshot, loadSnapshot, isNetworkError } from '../lib/offline'
import { barsOf, supplyOf, layoutFixtures, powerSummary, symbolOf, FIXTURE_SYMBOLS } from '../lib/lightPlot'
import { useI18n } from '../i18n'
import LightPlotSvg, { FixtureShape } from '../components/tools/LightPlotSvg'

// Printable light plot (docs/FIELD_TOOLS.md, F3): the drawing in black on white, a legend of the
// symbols used, each bar with its fixtures, and the power estimate. Readable by everyone on the
// gig, also offline.
//   /gig/:id/lights
export default function LightPlotPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t, fmt } = useI18n()
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('gigs').select('name, venue, start_date, end_date, organisations(name)').eq('id', id).maybeSingle(),
      supabase.from('gig_fixtures').select('id, name, fixture_type, mode, footprint, universe, address, position, plot_x, plot_y, symbol, power_w, weight_kg').eq('gig_id', id),
      supabase.from('gig_show').select('stage, lighting').eq('gig_id', id).maybeSingle(),
    ]).then(([gigRes, fixRes, showRes]) => {
      if (gigRes.error && isNetworkError(gigRes.error)) {
        const snap = loadSnapshot(`lightsheet.${id}`)
        return snap ? setData(snap.data) : setError(true)
      }
      if (gigRes.error || !gigRes.data) {
        if (gigRes.error) logger.error('lights', gigRes.error, { step: 'print' })
        return setError(true)
      }
      const sheet = { gig: gigRes.data, fixtures: fixRes.data || [], stage: showRes.data?.stage || {}, lighting: showRes.data?.lighting || {} }
      setData(sheet)
      saveSnapshot(`lightsheet.${id}`, sheet)
    })
  }, [id])

  if (error) return <div style={{ padding: '40px', textAlign: 'center' }}>{t('callsheet.notAvailable')} <button onClick={() => navigate('/dashboard')} style={toolbarBtn}>{t('common.back')}</button></div>
  if (!data) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Loader2 size={26} color="#1EC878" style={{ animation: 'spin 1s linear infinite' }} /></div>

  const { gig, fixtures, stage, lighting } = data
  const bars = barsOf(lighting)
  const supply = supplyOf(lighting)
  const layout = layoutFixtures(bars, fixtures)
  const power = powerSummary(fixtures, bars, supply)
  const used = FIXTURE_SYMBOLS.filter(s => fixtures.some(f => layout[f.id] && symbolOf(f) === s))
  const dates = gig.start_date ? fmt(gig.start_date, 'd MMM yyyy') + (gig.end_date && gig.end_date !== gig.start_date ? ` – ${fmt(gig.end_date, 'd MMM yyyy')}` : '') : t('callsheet.datesTbc')
  const watts = w => (w >= 1000 ? `${Math.round(w / 100) / 10} kW` : `${w} W`)
  const order = (a, b) => a.universe - b.universe || (a.address ?? 9999) - (b.address ?? 9999)
  const onBar = b => fixtures.filter(f => (f.position || '').toLowerCase() === b.name.toLowerCase()).sort(order)
  const elsewhere = fixtures.filter(f => !bars.some(b => b.name.toLowerCase() === (f.position || '').toLowerCase())).sort(order)

  return (
    <div className="lights-page">
      <style>{`
        .lights-page { min-height: 100vh; background: #e9edf1; padding: 16px; }
        .sheet { max-width: 1000px; margin: 0 auto; background: #fff; color: #111; border-radius: 8px; padding: 28px; font-size: 13px; }
        .sheet h1 { font-size: 22px; margin-bottom: 2px; }
        .sheet h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #555; margin: 18px 0 6px; border-bottom: 2px solid #111; padding-bottom: 4px; }
        .sheet h3 { font-size: 14px; margin: 10px 0 2px; }
        .sheet table { width: 100%; border-collapse: collapse; }
        .sheet th, .sheet td { text-align: left; padding: 3px 6px; border-bottom: 1px solid #ddd; vertical-align: top; }
        .sheet th { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #555; }
        .sheet .muted { color: #555; }
        .legend { display: flex; flex-wrap: wrap; gap: 6px 18px; margin-top: 8px; }
        .legend span { display: inline-flex; align-items: center; gap: 6px; }
        .toolbar { max-width: 1000px; margin: 0 auto 12px; display: flex; justify-content: space-between; gap: 8px; }
        .wrap { overflow-x: auto; }
        @media (max-width: 600px) { .sheet { padding: 18px 14px; } }
        @media print {
          @page { size: landscape; margin: 10mm; }
          body, .lights-page { background: #fff !important; padding: 0; }
          .toolbar { display: none; }
          .sheet { border-radius: 0; padding: 0; max-width: none; }
          .bar { break-inside: avoid; }
        }
      `}</style>
      <div className="toolbar">
        <button onClick={() => navigate(`/gig/${id}?tab=tools&tool=light_plot`)} style={toolbarBtn}><ArrowLeft size={14} /> {t('callsheet.backToGig')}</button>
        <button onClick={() => window.print()} style={{ ...toolbarBtn, background: '#0B7A41', color: '#fff', border: 'none' }}><Printer size={14} /> {t('callsheet.print')}</button>
      </div>
      <article className="sheet">
        <div className="muted" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.1em' }}>{t('tools.name.light_plot')}</div>
        <h1>{gig.name}</h1>
        <div>{[gig.venue || t('callsheet.venueTbc'), dates, gig.organisations?.name].filter(Boolean).join(' · ')}</div>
        <div style={{ marginTop: '14px' }}>
          <LightPlotSvg stage={stage} bars={bars} fixtures={fixtures} layout={layout} paper title={t('light.drawingTitle', { name: gig.name })} />
        </div>
        {used.length > 0 && (
          <div className="legend">
            {used.map(s => (
              <span key={s}>
                <svg viewBox="-40 -40 80 80" width="22" height="22" aria-hidden="true"><FixtureShape symbol={s} ink="#111" fill="#f2f2f2" width={4} /></svg>
                {t(`light.symbol.${s}`)}
              </span>
            ))}
            <span className="muted">{t('light.addressKey')}</span>
          </div>
        )}

        <h2>{t('light.barsTitle')}</h2>
        {bars.map(b => {
          const row = power.bars.find(r => r.id === b.id)
          const list = onBar(b)
          return (
            <div key={b.id} className="bar">
              <h3>{b.name} <span className="muted" style={{ fontWeight: 400, fontSize: '12px' }}>
                · {[t(`light.kind.${b.kind}`), `${b.length} m`, b.height !== null && b.kind !== 'floor' ? t('light.trimAt', { m: b.height }) : null, b.phase ? `L${b.phase}` : null,
                  row.watts > 0 ? `${watts(row.watts)} · ${row.amps} A` : null, row.kg > 0 ? `${row.kg} kg` : null].filter(Boolean).join(' · ')}
              </span></h3>
              {list.length > 0 && <FixtureTable list={list} t={t} />}
            </div>
          )
        })}
        {elsewhere.length > 0 && (
          <div className="bar">
            <h3>{t('light.otherPositions')}</h3>
            <FixtureTable list={elsewhere} t={t} showPosition />
          </div>
        )}

        <h2>{t('light.powerTitle')}</h2>
        <p className="muted" style={{ marginBottom: '6px' }}>{t('light.powerNote', { volts: supply.volts })}</p>
        <table style={{ maxWidth: '420px' }}>
          <tbody>
            {power.phases.map(p => (
              <tr key={p.phase}>
                <td><strong>{supply.phases === 1 ? t('light.single') : `L${p.phase}`}</strong></td>
                <td>{watts(p.watts)}</td>
                <td style={{ fontWeight: p.load > 0.8 ? 800 : 400 }}>{t('light.ampsOf', { a: p.amps, max: supply.amps })}{p.load > 1 ? ' ⚠' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ marginTop: '6px' }}>{t('light.total', { watts: watts(power.total.watts), amps: power.total.amps, kg: power.total.kg })}</p>
        {power.total.unknown > 0 && <p className="muted">{t('light.unknownPower', { count: power.total.unknown })}</p>}
        {(power.over || power.near) && <p style={{ fontWeight: 800 }}>{power.over ? t('light.over') : t('light.near')}</p>}
        <p className="muted" style={{ marginTop: '10px', fontSize: '11px' }}>{t('callsheet.printed', { date: fmt(new Date(), 'd MMM yyyy, HH:mm') })}</p>
      </article>
    </div>
  )
}

function FixtureTable({ list, t, showPosition = false }) {
  return (
    <div className="wrap" tabIndex={0} role="region" aria-label={t('tools.name.dmx_patch')}>
      <table>
        <thead>
          <tr>
            <th>{t('dmx.name')}</th><th>{t('dmx.type')}</th><th>{t('dmx.address')}</th><th>{t('light.power')}</th>
            {showPosition && <th>{t('dmx.position')}</th>}
          </tr>
        </thead>
        <tbody>
          {list.map(f => (
            <tr key={f.id}>
              <td>{f.name}</td>
              <td>{[f.fixture_type, f.mode].filter(Boolean).join(' · ')}</td>
              <td style={{ fontFamily: 'var(--font-mono)' }}>{f.address ? `${f.universe}/${f.address}` : '—'}</td>
              <td>{f.power_w !== null && f.power_w !== undefined ? `${f.power_w} W` : '—'}</td>
              {showPosition && <td>{f.position || '—'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const toolbarBtn = {
  display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px',
  border: '1px solid #c5ccd4', background: '#fff', color: '#111', fontWeight: 600, fontSize: '13px', cursor: 'pointer',
}
