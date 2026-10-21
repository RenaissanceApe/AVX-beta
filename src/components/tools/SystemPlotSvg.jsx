import { stageSize } from '../../lib/stagePlot'
import { t } from '../../i18n'

const CM = 100 // drawing units per metre

// The sound system plan (docs/FIELD_TOOLS.md, F4), read only: the stage from above with the
// audience below, each source with its horizontal angle drawn towards the audience, and the
// listening positions. paper: black on white for printing. The tables next to it say the same
// in words, so the drawing is one image for screen readers.
export default function SystemPlotSvg({ stage, sources, listeners, paper = false, title }) {
  const { width_m: W, depth_m: D } = stageSize(stage)
  const xs = [0, W, ...sources.map(s => s.x), ...listeners.map(l => l.x)]
  const ys = [0, D, ...sources.map(s => s.y), ...listeners.map(l => l.y)]
  const pad = 4
  const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad
  const sx = x => (x - x0) * CM, sy = y => (y1 - y) * CM
  const span = Math.max(x1 - x0, y1 - y0)
  const fs = (span * CM) / 55 // text keeps its size whatever the venue's size
  const ink = paper ? '#111' : 'var(--text)'
  const soft = paper ? '#555' : 'var(--muted)'
  const faint = paper ? '#ddd' : 'color-mix(in srgb, var(--fg) min(100%, calc(8% * var(--line-k))), transparent)'
  const wedge = paper ? '#bbb' : 'color-mix(in srgb, var(--accent) 35%, transparent)'
  const fill = paper ? '#f2f2f2' : 'color-mix(in srgb, var(--accent) 14%, var(--panel))'
  const step = span > 60 ? 10 : span > 25 ? 5 : 1
  const grid = []
  for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) grid.push(<line key={`x${x}`} x1={sx(x)} y1={0} x2={sx(x)} y2={sy(y0)} stroke={faint} strokeWidth={fs / 12} />)
  for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) grid.push(<line key={`y${y}`} x1={0} y1={sy(y)} x2={sx(x1)} y2={sy(y)} stroke={faint} strokeWidth={fs / 12} />)
  const reach = Math.max(4, Math.abs(y0) * 0.9)

  return (
    <svg viewBox={`0 0 ${(x1 - x0) * CM} ${(y1 - y0) * CM}`} role="img" aria-label={title} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <title>{title}</title>
      <rect x={0} y={0} width={(x1 - x0) * CM} height={(y1 - y0) * CM} fill={paper ? '#fff' : 'var(--panel)'} />
      {grid}
      {/* Each source's angle, drawn towards the audience */}
      {sources.filter(s => s.kind !== 'sub').map(s => {
        const half = (Math.min(170, s.angle) / 2) * (Math.PI / 180)
        const len = s.kind === 'main' ? reach : reach / 2
        return <path key={`w${s.id}`} d={`M ${sx(s.x)} ${sy(s.y)} L ${sx(s.x - Math.sin(half) * len)} ${sy(s.y - Math.cos(half) * len)} L ${sx(s.x + Math.sin(half) * len)} ${sy(s.y - Math.cos(half) * len)} Z`}
          fill={wedge} opacity={0.35} stroke="none" />
      })}
      <rect x={sx(0)} y={sy(D)} width={W * CM} height={D * CM} fill="none" stroke={ink} strokeWidth={fs / 5} />
      <text x={sx(W / 2)} y={sy(D / 2)} textAnchor="middle" fontSize={fs} fill={soft}>{t('sys.stage')}</text>
      {sources.map(s => {
        const w = s.kind === 'sub' ? 1.6 : 0.9, h = s.kind === 'sub' ? 0.8 : 0.6
        return (
          <g key={s.id}>
            <rect x={sx(s.x) - (w * CM) / 2} y={sy(s.y) - (h * CM) / 2} width={w * CM} height={h * CM} rx={fs / 6}
              fill={s.kind === 'sub' ? ink : fill} stroke={ink} strokeWidth={fs / 8} />
            <text x={sx(s.x)} y={sy(s.y) - (h * CM) / 2 - fs * 0.4} textAnchor="middle" fontSize={fs} fontWeight={800} fill={ink}>{s.name}</text>
          </g>
        )
      })}
      {listeners.map(l => (
        <g key={l.id}>
          <circle cx={sx(l.x)} cy={sy(l.y)} r={fs * 0.45} fill="none" stroke={ink} strokeWidth={fs / 8} />
          <circle cx={sx(l.x)} cy={sy(l.y)} r={fs * 0.15} fill={ink} />
          <text x={sx(l.x)} y={sy(l.y) + fs * 1.5} textAnchor="middle" fontSize={fs} fill={ink}>{l.name}</text>
        </g>
      ))}
      <text x={fs * 0.5} y={sy(y0) - fs * 0.5} fontSize={fs * 0.8} fill={soft}>{t('sys.gridNote', { m: step })}</text>
    </svg>
  )
}
