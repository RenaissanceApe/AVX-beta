import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { powerLabels } from '../lib/cables'
import { track } from '../lib/usage'
import { useI18n } from '../i18n'
import usePowerPlan from '../components/power/usePowerPlan'
import { AvxLoader } from '../components/ui'

// D31 sizes (docs/TOOLS_PLAN.md "Decided (2026-11-03)"): small 50 × 25 mm for cables, medium
// 100 × 50 mm for distros. Each prints on pre-cut A4 sheets (52.5 × 29.7 mm, 40 a sheet; 105 × 57 mm,
// 10 a sheet) or one label per page on a roll; the label is drawn inside the smaller of the two.
const SIZES = {
  small: { w: 50, h: 25, cellW: 52.5, cellH: 29.7, cols: 4 },
  medium: { w: 100, h: 50, cellW: 105, cellH: 57, cols: 2 },
}
const LAYOUT_KEY = 'avx.powerLabelLayout'

// Labels for the gig's distros and cables (P2, connecting U5): name, where it's fed from or goes,
// and its outputs or length. /gig/:id/power/labels
export default function PowerLabelsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useI18n()
  const p = usePowerPlan({ id })
  const [what, setWhat] = useState('cables')
  const [layout, setLayout] = useState(() => { try { return localStorage.getItem(LAYOUT_KEY) || 'sheet' } catch { return 'sheet' } })
  const pick = v => { setLayout(v); try { localStorage.setItem(LAYOUT_KEY, v) } catch { /* private mode */ } }

  if (!p.plan) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><AvxLoader size={26} color="#1EC878" /></div>
  const all = powerLabels({ distros: p.distros, cables: p.cables, supply: p.supply, tr: t })
  const labels = all.filter(l => (what === 'cables' ? l.size === 'small' : l.size === 'medium'))
  const s = SIZES[what === 'cables' ? 'small' : 'medium']
  const roll = layout === 'roll'

  return (
    <div style={{ minHeight: '100vh', background: '#e9ebef', color: '#111' }}>
      <div className="no-print" style={{ position: 'sticky', top: 'var(--safe-top)', zIndex: 5, background: '#0F1520', color: '#fff', padding: '10px 16px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => navigate(`/gig/${id}?tab=tools&tool=power`)} style={toolbarBtn}><ArrowLeft size={14} /> {t('callsheet.backToGig')}</button>
        <strong style={{ flex: 1, minWidth: '120px' }}>{t('cables.labelsTitle', { count: labels.length })}</strong>
        <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {t('cables.labelsWhat')}
          <select value={what} onChange={e => setWhat(e.target.value)} style={selectStyle}>
            <option value="cables">{t('cables.labelsCables')}</option>
            <option value="distros">{t('cables.labelsDistros')}</option>
          </select>
        </label>
        <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {t('cables.labelsLayout')}
          <select value={layout} onChange={e => pick(e.target.value)} style={selectStyle}>
            <option value="sheet">{t('cables.layout.sheet')}</option>
            <option value="roll">{t('cables.layout.roll')}</option>
          </select>
        </label>
        <button onClick={() => { track(`power:labels-${what}`); window.print() }} disabled={!labels.length} style={toolbarBtn}><Printer size={14} /> {t('inv.print')}</button>
      </div>
      {labels.length === 0 ? (
        <p className="no-print" style={{ textAlign: 'center', padding: '60px 16px', color: '#555', fontSize: '14px' }}>{t(what === 'cables' ? 'cables.noCableLabels' : 'cables.noDistroLabels')}</p>
      ) : (
        <div className="pl-scroll" tabIndex={0} role="region" aria-label={t('cables.labelsTitle', { count: labels.length })}><div className={`pl-sheet ${roll ? 'pl-roll' : ''}`} style={roll ? undefined : { gridTemplateColumns: `repeat(${s.cols}, ${s.cellW}mm)` }}>
          {labels.map(l => (
            <div key={l.key} className="pl-cell" style={roll ? { width: `${s.w}mm`, height: `${s.h}mm` } : { width: `${s.cellW}mm`, height: `${s.cellH}mm` }}>
              <div className="pl-label" style={{ width: `${s.w - 2}mm`, height: `${s.h - 2}mm` }}>
                <div className={what === 'cables' ? 'pl-title pl-small' : 'pl-title'}>{l.title}</div>
                {l.lines.map((x, i) => <div key={i} className={what === 'cables' ? 'pl-line pl-small' : 'pl-line'}>{x}</div>)}
              </div>
            </div>
          ))}
        </div></div>
      )}
      <style>{`
        .pl-scroll { overflow-x: auto; }
        .pl-sheet { display: grid; width: max-content; margin: 0 auto; padding: 16px 0 40px; }
        .pl-roll { display: flex; flex-direction: column; align-items: center; gap: 8px; }
        .pl-cell { box-sizing: border-box; background: #fff; border: 1px dashed #c8ccd4; display: flex; align-items: center; justify-content: center; overflow: hidden; }
        .pl-label { box-sizing: border-box; padding: 1.5mm 2mm; font-family: Helvetica, Arial, sans-serif; overflow: hidden; }
        .pl-title { font-weight: 700; font-size: 12pt; line-height: 1.15; overflow-wrap: anywhere; }
        .pl-line { font-size: 9pt; margin-top: 1mm; line-height: 1.2; overflow-wrap: anywhere; }
        .pl-title.pl-small { font-size: 8.5pt; }
        .pl-line.pl-small { font-size: 7pt; margin-top: .5mm; }
        @media print {
          @page { size: ${roll ? `${s.w}mm ${s.h}mm` : 'A4'}; margin: ${roll ? '0' : '0'}; }
          body, html { background: #fff !important; }
          .no-print { display: none !important; }
          .pl-scroll { overflow: visible; }
          .pl-sheet { padding: 0; margin: 0; gap: 0; }
          .pl-cell { border-color: transparent; break-inside: avoid; }
          .pl-roll .pl-cell { break-after: page; }
        }
        @media screen and (max-width: 700px) { .pl-sheet { margin: 0; padding: 16px; } }
      `}</style>
    </div>
  )
}

const toolbarBtn = {
  display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 14px',
  border: '1px solid rgba(255,255,255,0.25)', background: 'transparent', color: '#fff', fontWeight: 600, fontSize: '13px', cursor: 'pointer',
}
const selectStyle = { padding: '6px 8px', background: '#1a2230', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }
