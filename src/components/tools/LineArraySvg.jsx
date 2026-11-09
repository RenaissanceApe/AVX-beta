import { sideView } from '../../lib/lineArray'
import { t } from '../../i18n'
import { colors } from '../ui'

// The array from the side (RG3): schematic boxes, hinged at the front, turned by the splay
// angles as typed and the bumper's tilt. Audience on the left. Sizes are not to scale.
export default function LineArraySvg({ arr, analysis }) {
  const v = sideView(arr)
  const pad = 0.9
  const w = v.box.maxX - v.box.minX + pad * 2
  const h = v.box.maxY - v.box.minY + pad * 2
  const vb = `${v.box.minX - pad} ${v.box.minY - pad} ${w} ${h}`
  const picks = analysis.picks
  const front = { x: v.bumper.x1, y: v.bumper.y1 }
  const rear = { x: v.bumper.x2, y: v.bumper.y2 }
  const mid = { x: (front.x + rear.x) / 2, y: (front.y + rear.y) / 2 }
  const anchors = arr.picks === 1 ? { front: mid } : { front, rear }
  const last = v.elements[v.elements.length - 1]
  const desc = t('la.svgDesc', { count: arr.count, tilt: arr.tilt_deg ?? 0, aim: v.bottomAngle ?? 0 })
  const sw = 0.04
  return (
    <svg viewBox={vb} role="img" aria-label={desc} style={{ width: '100%', maxWidth: '260px', maxHeight: '360px', display: 'block', background: colors.bg }}>
      <title>{desc}</title>
      {v.elements.map((e, i) => (
        <g key={i}>
          <polygon points={e.corners.map(c => `${c.x},${c.y}`).join(' ')} fill={colors.panel} stroke={colors.text} strokeWidth={sw} />
          <line x1={e.corners[0].x} y1={e.corners[0].y} x2={e.corners[1].x} y2={e.corners[1].y} stroke={colors.accentText} strokeWidth={sw * 2.5} />
        </g>
      ))}
      <line x1={v.bumper.x1} y1={v.bumper.y1} x2={v.bumper.x2} y2={v.bumper.y2} stroke={colors.text} strokeWidth={sw * 4} strokeLinecap="square" />
      {picks.filter(p => p.name !== 'pull').map(p => {
        const a = anchors[p.name]
        if (!a) return null
        const bad = p.status === 'over' || p.status === 'uplift'
        return (
          <g key={p.name}>
            <line x1={a.x} y1={a.y} x2={a.x} y2={a.y - 0.7} stroke={bad ? colors.danger : colors.text} strokeWidth={sw * 2} strokeDasharray={bad ? '0.1 0.06' : undefined} />
            <circle cx={a.x} cy={a.y} r={0.07} fill={bad ? colors.danger : colors.text} />
          </g>
        )
      })}
      {picks.some(p => p.name === 'pull') && last && (
        <line x1={last.corners[2].x} y1={last.corners[2].y} x2={last.corners[2].x + 0.8} y2={last.corners[2].y + 0.3} stroke={colors.text} strokeWidth={sw * 2} strokeDasharray="0.12 0.08" />
      )}
    </svg>
  )
}
