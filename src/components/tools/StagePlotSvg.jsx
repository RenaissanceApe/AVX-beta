import { forwardRef } from 'react'
import { SYMBOLS, stageSize } from '../../lib/stagePlot'
import { t } from '../../i18n'

const CM = 100 // drawing units per metre

// The stage plot drawing (docs/FIELD_TOOLS.md, F1b): the stage seen from above with the
// audience at the bottom, a 1 m grid, and each thing at its place. paper: black on white for
// printing; otherwise the app's theme colours. Things are focusable buttons when onSelect is set.
const StagePlotSvg = forwardRef(function StagePlotSvg({ stage, items, selected, onSelect, onPointerDownItem, onKeyDownItem, paper = false, title }, ref) {
  const { width_m: W, depth_m: D } = stageSize(stage)
  const ink = paper ? '#111' : 'var(--text)'
  const faint = paper ? '#ccc' : 'color-mix(in srgb, var(--fg) min(100%, calc(10% * var(--line-k))), transparent)'
  const floor = paper ? '#fff' : 'var(--panel)'
  const fill = paper ? '#f2f2f2' : 'color-mix(in srgb, var(--accent) 14%, var(--panel))'
  const pick = paper ? '#111' : 'var(--accent)'
  const lines = []
  for (let x = 1; x < W; x++) lines.push(<line key={`x${x}`} x1={x * CM} y1={0} x2={x * CM} y2={D * CM} stroke={faint} strokeWidth={2} />)
  for (let y = 1; y < D; y++) lines.push(<line key={`y${y}`} x1={0} y1={y * CM} x2={W * CM} y2={y * CM} stroke={faint} strokeWidth={2} />)

  return (
    <svg ref={ref} viewBox={`-40 -60 ${W * CM + 80} ${D * CM + 160}`} role={onSelect ? 'group' : 'img'} aria-label={title}
      style={{ width: '100%', height: 'auto', display: 'block', touchAction: onPointerDownItem ? 'none' : 'auto', userSelect: 'none' }}>
      <title>{title}</title>
      <text x={(W * CM) / 2} y={-22} textAnchor="middle" fontSize={26} fill={paper ? '#555' : 'var(--muted)'}>{t('plot.upstage')}</text>
      <rect x={0} y={0} width={W * CM} height={D * CM} fill={floor} stroke={ink} strokeWidth={4} />
      {lines}
      <text x={(W * CM) / 2} y={D * CM + 46} textAnchor="middle" fontSize={30} fontWeight={700} fill={ink}>{t('plot.audience')}</text>
      <text x={(W * CM) / 2} y={D * CM + 84} textAnchor="middle" fontSize={22} fill={paper ? '#555' : 'var(--muted)'}>{t('plot.size', { w: W, d: D })}</text>
      {(items || []).map(item => {
        const sym = SYMBOLS[item.kind] || SYMBOLS.note
        const on = selected === item.id
        const cx = Number(item.x) * CM, cy = (D - Number(item.y)) * CM
        const name = t(`plot.kind.${item.kind}`)
        return (
          <g key={item.id}>
            <g role={onSelect ? 'button' : undefined} tabIndex={onSelect ? 0 : undefined}
              aria-label={onSelect ? t('plot.itemLabel', { name: item.label ? `${name}, ${item.label}` : name, x: Number(item.x), y: Number(item.y) }) : undefined}
              aria-pressed={onSelect ? on : undefined}
              onClick={onSelect ? () => onSelect(item.id) : undefined}
              onPointerDown={onPointerDownItem ? e => onPointerDownItem(e, item) : undefined}
              onKeyDown={onKeyDownItem ? e => onKeyDownItem(e, item) : undefined}
              style={{ cursor: onPointerDownItem ? 'grab' : 'default', outline: 'none' }}>
              <g transform={`translate(${cx} ${cy}) rotate(${item.rotation || 0})`}>
                <Shape sym={sym} ink={on ? pick : ink} fill={fill} width={on ? 7 : 4} />
                {sym.shape === 'note' && <rect x={(-sym.w * CM) / 2} y={(-sym.h * CM) / 2} width={sym.w * CM} height={sym.h * CM} fill="transparent" />}
              </g>
              {on && <circle cx={cx} cy={cy} r={(Math.max(sym.w, sym.h) * CM) / 2 + 18} fill="none" stroke={pick} strokeWidth={4} strokeDasharray="12 8" />}
            </g>
            {/* Names drawn on the plot sit outside the button (its name says it all) and stay upright
                whichever way the thing is turned; clicks go through them */}
            <g aria-hidden="true" style={{ pointerEvents: 'none' }}>
              {t(`plot.short.${item.kind}`) && <text x={cx} y={cy + 8} textAnchor="middle" fontSize={22} fontWeight={800} fill={ink}>{t(`plot.short.${item.kind}`)}</text>}
              {(item.label || sym.shape === 'note') && (
                <text x={cx} y={sym.shape === 'note' ? cy + 8 : cy + (Math.max(sym.w, sym.h) * CM) / 2 + 30} textAnchor="middle" fontSize={24} fontWeight={sym.shape === 'note' ? 700 : 400} fill={ink}>
                  {item.label || name}
                </text>
              )}
            </g>
          </g>
        )
      })}
    </svg>
  )
})
export default StagePlotSvg

function Shape({ sym, ink, fill, width }) {
  const w = sym.w * CM, h = sym.h * CM
  switch (sym.shape) {
    case 'circle': return <circle r={Math.min(w, h) / 2} fill={fill} stroke={ink} strokeWidth={width} />
    case 'wedge': return <polygon points={`${-w / 2},${-h / 2} ${w / 2},${-h / 2} ${w * 0.3},${h / 2} ${-w * 0.3},${h / 2}`} fill={fill} stroke={ink} strokeWidth={width} />
    case 'riser': return <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="none" stroke={ink} strokeWidth={width} strokeDasharray="20 12" />
    case 'kit': return (
      <g>
        <circle r={w / 2} fill="none" stroke={ink} strokeWidth={width} strokeDasharray="10 8" />
        <circle cx={0} cy={w * 0.18} r={w * 0.2} fill={fill} stroke={ink} strokeWidth={width} />
        <circle cx={-w * 0.28} cy={-w * 0.05} r={w * 0.11} fill={fill} stroke={ink} strokeWidth={width} />
        <circle cx={w * 0.28} cy={-w * 0.05} r={w * 0.13} fill={fill} stroke={ink} strokeWidth={width} />
        <circle cx={0} cy={-w * 0.3} r={w * 0.1} fill={fill} stroke={ink} strokeWidth={width} />
      </g>
    )
    case 'note': return null
    default: return <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={6} fill={fill} stroke={ink} strokeWidth={width} />
  }
}
