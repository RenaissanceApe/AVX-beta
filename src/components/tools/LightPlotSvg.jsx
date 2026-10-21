import { forwardRef } from 'react'
import { stageSize } from '../../lib/stagePlot'
import { viewArea, barEnds, symbolOf } from '../../lib/lightPlot'
import { t } from '../../i18n'

const CM = 100 // drawing units per metre
const R = 24 // a fixture's radius

// The light plot drawing (docs/FIELD_TOOLS.md, F3): the stage from above (audience at the
// bottom) with a margin all round, the bars as thick lines and each fixture as a symbol with its
// DMX address. paper: black on white for printing. Bars and fixtures are focusable buttons when
// onSelect is set; their drawn names are hidden from screen readers (the button names say it).
const LightPlotSvg = forwardRef(function LightPlotSvg({ stage, bars, fixtures, layout, selected, onSelect, onPointerDown, onKeyDown, paper = false, title }, ref) {
  const { width_m: W, depth_m: D } = stageSize(stage)
  const area = viewArea(stage, bars, layout)
  const sx = x => (x - area.x0) * CM
  const sy = y => (area.y1 - y) * CM
  const ink = paper ? '#111' : 'var(--text)'
  const soft = paper ? '#555' : 'var(--muted)'
  const faint = paper ? '#ddd' : 'color-mix(in srgb, var(--fg) min(100%, calc(8% * var(--line-k))), transparent)'
  const floor = paper ? '#fff' : 'var(--panel)'
  const fill = paper ? '#f2f2f2' : 'color-mix(in srgb, var(--accent) 14%, var(--panel))'
  const pick = paper ? '#111' : 'var(--accent)'
  const editable = !!onSelect
  const lines = []
  for (let x = Math.ceil(area.x0); x <= area.x1; x++) lines.push(<line key={`x${x}`} x1={sx(x)} y1={0} x2={sx(x)} y2={sy(area.y0)} stroke={faint} strokeWidth={2} />)
  for (let y = Math.ceil(area.y0); y <= area.y1; y++) lines.push(<line key={`y${y}`} x1={0} y1={sy(y)} x2={sx(area.x1)} y2={sy(y)} stroke={faint} strokeWidth={2} />)
  const width = (area.x1 - area.x0) * CM, height = (area.y1 - area.y0) * CM
  const button = (kind, id, label) => editable ? {
    role: 'button', tabIndex: 0, 'aria-label': label, 'aria-pressed': selected?.kind === kind && selected.id === id,
    onClick: () => onSelect({ kind, id }),
    onPointerDown: onPointerDown ? e => onPointerDown(e, { kind, id }) : undefined,
    onKeyDown: onKeyDown ? e => onKeyDown(e, { kind, id }) : undefined,
    style: { cursor: onPointerDown ? 'grab' : 'pointer', outline: 'none' },
  } : {}

  return (
    <svg ref={ref} viewBox={`-20 -20 ${width + 40} ${height + 40}`} role={editable ? 'group' : 'img'} aria-label={title}
      style={{ width: '100%', height: 'auto', display: 'block', touchAction: onPointerDown ? 'none' : 'auto', userSelect: 'none' }}>
      <title>{title}</title>
      <rect x={0} y={0} width={width} height={height} fill={floor} />
      {lines}
      {/* The stage: its outline, upstage at the top, the audience below */}
      <rect x={sx(0)} y={sy(D)} width={W * CM} height={D * CM} fill="none" stroke={ink} strokeWidth={4} />
      <text x={sx(W / 2)} y={sy(D) - 14} textAnchor="middle" fontSize={26} fill={soft} aria-hidden="true">{t('plot.upstage')}</text>
      <text x={sx(W / 2)} y={sy(0) + 40} textAnchor="middle" fontSize={28} fontWeight={700} fill={soft} aria-hidden="true">{t('plot.audience')}</text>

      {(bars || []).map(bar => {
        const e = barEnds(bar)
        const on = selected?.kind === 'bar' && selected.id === bar.id
        const thick = bar.kind === 'truss' ? 26 : bar.kind === 'floor' ? 10 : 14
        const label = t('light.barLabel', { name: bar.name, kind: t(`light.kind.${bar.kind}`), length: bar.length })
        return (
          <g key={bar.id}>
            <g {...button('bar', bar.id, label)}>
              <line x1={sx(e.x1)} y1={sy(e.y1)} x2={sx(e.x2)} y2={sy(e.y2)} stroke={on ? pick : ink} strokeWidth={thick + (on ? 6 : 0)}
                strokeDasharray={bar.kind === 'floor' ? '18 10' : bar.kind === 'ladder' ? '6 6' : undefined} strokeLinecap="butt" opacity={bar.kind === 'truss' ? 0.85 : 1} />
              {bar.kind === 'truss' && <line x1={sx(e.x1)} y1={sy(e.y1)} x2={sx(e.x2)} y2={sy(e.y2)} stroke={floor} strokeWidth={10} strokeDasharray="14 14" />}
              {/* A wider invisible line makes the bar easy to grab */}
              <line x1={sx(e.x1)} y1={sy(e.y1)} x2={sx(e.x2)} y2={sy(e.y2)} stroke="transparent" strokeWidth={50} />
            </g>
            <text aria-hidden="true" style={{ pointerEvents: 'none' }} fontSize={28} fontWeight={800} fill={ink}
              x={bar.rotation === 90 ? sx(e.x1) : sx(e.x1) - 10} y={bar.rotation === 90 ? sy(e.y2) - 24 : sy(e.y1) - 30} textAnchor={bar.rotation === 90 ? 'middle' : 'start'}>
              {bar.name}{bar.height !== null && bar.height !== undefined && bar.kind !== 'floor' ? ` · ${bar.height} m` : ''}
            </text>
          </g>
        )
      })}

      {(fixtures || []).map(f => {
        const at = layout[f.id]
        if (!at) return null
        const on = selected?.kind === 'fixture' && selected.id === f.id
        const cx = sx(at.x), cy = sy(at.y)
        const label = t('light.fixtureLabel', { name: f.name, type: f.fixture_type, address: f.address ? `${f.universe}/${f.address}` : t('dmx.noAddress') })
        return (
          <g key={f.id}>
            <g {...button('fixture', f.id, label)}>
              <g transform={`translate(${cx} ${cy})`}>
                <FixtureShape symbol={symbolOf(f)} ink={on ? pick : ink} fill={fill} width={on ? 6 : 3} />
              </g>
              {on && <circle cx={cx} cy={cy} r={R + 14} fill="none" stroke={pick} strokeWidth={4} strokeDasharray="10 6" />}
            </g>
            <text aria-hidden="true" style={{ pointerEvents: 'none' }} x={cx} y={cy + R + 26} textAnchor="middle" fontSize={24} fontWeight={700} fill={ink}>
              {f.address ? `${f.universe}/${f.address}` : '—'}
            </text>
          </g>
        )
      })}
    </svg>
  )
})
export default LightPlotSvg

// One small shape per kind of fixture (the legend on the print says which is which)
export function FixtureShape({ symbol, ink, fill, width = 3, r = R }) {
  const p = { fill, stroke: ink, strokeWidth: width }
  switch (symbol) {
    case 'spot': return <g><circle r={r} {...p} /><circle r={r * 0.35} fill={ink} /></g>
    case 'wash': return <circle r={r} {...p} />
    case 'beam': return <polygon points={`0,${-r} ${r},${r * 0.8} ${-r},${r * 0.8}`} {...p} />
    case 'profile': return <g><rect x={-r * 0.6} y={-r * 1.2} width={r * 1.2} height={r * 2.4} rx={3} {...p} /><line x1={-r * 0.6} y1={r * 0.4} x2={r * 0.6} y2={r * 0.4} stroke={ink} strokeWidth={width} /></g>
    case 'par': return <g><circle r={r} {...p} /><line x1={-r * 0.7} y1={0} x2={r * 0.7} y2={0} stroke={ink} strokeWidth={width} /><line x1={0} y1={-r * 0.7} x2={0} y2={r * 0.7} stroke={ink} strokeWidth={width} /></g>
    case 'blinder': return <g><rect x={-r * 1.2} y={-r * 0.7} width={r * 2.4} height={r * 1.4} rx={3} {...p} /><circle cx={-r * 0.55} r={r * 0.35} fill="none" stroke={ink} strokeWidth={width} /><circle cx={r * 0.55} r={r * 0.35} fill="none" stroke={ink} strokeWidth={width} /></g>
    case 'strobe': return <g><rect x={-r * 1.2} y={-r * 0.6} width={r * 2.4} height={r * 1.2} rx={3} {...p} /><polyline points={`${-r * 0.8},0 ${-r * 0.3},${-r * 0.35} ${r * 0.2},${r * 0.35} ${r * 0.8},0`} fill="none" stroke={ink} strokeWidth={width} /></g>
    case 'batten': return <rect x={-r * 1.8} y={-r * 0.4} width={r * 3.6} height={r * 0.8} rx={3} {...p} />
    case 'haze': return <g><rect x={-r} y={-r * 0.8} width={r * 2} height={r * 1.6} rx={r * 0.6} {...p} />{[-0.5, 0, 0.5].map(k => <circle key={k} cx={r * k} r={r * 0.18} fill={ink} />)}</g>
    default: return <polygon points={`0,${-r} ${r},0 0,${r} ${-r},0`} {...p} />
  }
}
