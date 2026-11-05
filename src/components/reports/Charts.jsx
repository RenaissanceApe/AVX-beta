import { useId } from 'react'
import { ArrowUp, ArrowDown, Minus } from 'lucide-react'
import { niceScale, yOf, linePoints, seriesColour } from '../../lib/analytics/charts'
import { useI18n } from '../../i18n'
import { card, colors } from '../ui'

// Report charts in plain SVG (docs/ANALYTICS.md, principle 8). Each one has an accessible name
// and a table to read instead, and never tells things apart by colour alone: series have
// labels in a legend and in the table, and the change on a tile has an arrow and a sign.

const W = 600
const H = 200
const PAD = { l: 48, r: 8, t: 8, b: 28 }
const innerW = W - PAD.l - PAD.r
const innerH = H - PAD.t - PAD.b
const fig = { ...card, margin: 0, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }
const cap = { fontSize: '13px', fontWeight: 700 }
const tbl = { width: '100%', borderCollapse: 'collapse', fontSize: '12px', fontVariantNumeric: 'tabular-nums' }
const td = { padding: '4px 6px', borderTop: `1px solid ${colors.border}`, textAlign: 'right' }

// A number with its change against the comparison period: arrow, sign and words, not just colour
export function NumberTile({ label, value, change = null, compareLabel = '', sub = null, spark = null, estimate = false }) {
  const { t } = useI18n()
  const pct = change == null ? null : Math.round(change * 100)
  const Icon = pct == null || pct === 0 ? Minus : pct > 0 ? ArrowUp : ArrowDown
  return (
    <div style={{ ...card, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
      <div style={{ fontSize: '12px', color: colors.muted }}>{label}</div>
      <div style={{ fontSize: '20px', fontWeight: 700, overflowWrap: 'anywhere' }}>
        {value}{estimate && <span style={{ fontSize: '11px', fontWeight: 600, color: colors.muted }}> · {t('reports.estimate')}</span>}
      </div>
      {pct != null && (
        <div style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '3px', color: colors.muted }}>
          <Icon size={12} aria-hidden="true" />
          <span>{t(pct === 0 ? 'reports.changeSame' : 'reports.change', { change: `${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`, period: compareLabel })}</span>
        </div>
      )}
      {sub && <div style={{ fontSize: '11px', color: colors.muted }}>{sub}</div>}
      {spark}
    </div>
  )
}

// A tiny line for a tile; its label says what it shows
export function Sparkline({ values, label, width = 120, height = 28 }) {
  if (!values?.length) return null
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" style={{ maxWidth: `${width}px`, marginTop: '4px' }}>
      <polyline points={linePoints(values, width, height - 2)} fill="none" stroke={colors.accent} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function Axis({ scale, format }) {
  return scale.ticks.map(v => {
    const y = PAD.t + yOf(v, scale, innerH)
    return (
      <g key={v}>
        <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} stroke={colors.border} />
        <text x={PAD.l - 6} y={y + 4} textAnchor="end" fontSize="11" fill={colors.muted}>{format(v, true)}</text>
      </g>
    )
  })
}

function XLabels({ labels }) {
  const n = labels.length
  const every = Math.max(1, Math.ceil(n / 8))
  return labels.map((l, i) => (i % every === 0 || i === n - 1) && (
    <text key={i} x={PAD.l + (innerW / n) * (i + 0.5)} y={H - 8} textAnchor="middle" fontSize="11" fill={colors.muted}>{l}</text>
  ))
}

function AsTable({ head, rows }) {
  const { t } = useI18n()
  return (
    <details>
      <summary style={{ fontSize: '12px', color: colors.accentText, cursor: 'pointer' }}>{t('reports.asTable')}</summary>
      <div style={{ overflowX: 'auto' }}>
        <table style={tbl}>
          <thead><tr>{head.map((h, i) => <th key={i} scope="col" style={{ ...td, borderTop: 'none', textAlign: i ? 'right' : 'left', color: colors.muted }}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => j === 0 ? <th key={j} scope="row" style={{ ...td, textAlign: 'left', fontWeight: 500 }}>{c}</th> : <td key={j} style={td}>{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </details>
  )
}

function Legend({ series }) {
  if (series.length < 2) return null
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: '12px' }}>
      {series.map((s, i) => (
        <li key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <svg width="12" height="12" aria-hidden="true"><Mark i={i} x={0} y={0} size={12} /></svg>{s.label}
        </li>
      ))}
    </ul>
  )
}

// Each series has its own shape as well as its colour
function Mark({ i, x, y, size }) {
  const fill = seriesColour(i)
  const k = i % 3
  if (k === 1) return <circle cx={x + size / 2} cy={y + size / 2} r={size / 2} fill={fill} />
  if (k === 2) return <polygon points={`${x + size / 2},${y} ${x + size},${y + size} ${x},${y + size}`} fill={fill} />
  return <rect x={x} y={y} width={size} height={size} rx="2" fill={fill} />
}

// Bars, one series: data [{ label, value }]
export function BarChart({ title, data, format = v => String(v), valueLabel }) {
  const { t } = useI18n()
  const id = useId()
  const scale = niceScale(data.map(d => d.value))
  const bw = innerW / Math.max(1, data.length)
  return (
    <figure style={fig} aria-labelledby={id}>
      <figcaption id={id} style={cap}>{title}</figcaption>
      <svg role="img" aria-label={t('reports.chartLabel', { title, summary: data.map(d => `${d.label}: ${format(d.value)}`).join('; ') })}
        viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
        <Axis scale={scale} format={format} />
        {data.map((d, i) => {
          const y0 = PAD.t + yOf(Math.max(0, d.value), scale, innerH)
          const y1 = PAD.t + yOf(Math.min(0, d.value), scale, innerH)
          return <rect key={i} x={PAD.l + bw * i + bw * 0.15} y={y0} width={bw * 0.7} height={Math.max(0, y1 - y0)} rx="3" fill={colors.accent}><title>{`${d.label}: ${format(d.value)}`}</title></rect>
        })}
        <XLabels labels={data.map(d => d.label)} />
      </svg>
      <AsTable head={['', valueLabel || title]} rows={data.map(d => [d.label, format(d.value)])} />
    </figure>
  )
}

// Stacked bars: data [{ label, values: { [seriesKey]: n } }], series [{ key, label }]
export function StackedBarChart({ title, data, series, format = v => String(v) }) {
  const { t } = useI18n()
  const id = useId()
  const totals = data.map(d => series.reduce((s, x) => s + Math.max(0, d.values[x.key] || 0), 0))
  const scale = niceScale(totals)
  const bw = innerW / Math.max(1, data.length)
  return (
    <figure style={fig} aria-labelledby={id}>
      <figcaption id={id} style={cap}>{title}</figcaption>
      <Legend series={series} />
      <svg role="img" aria-label={t('reports.chartLabel', { title, summary: data.map((d, i) => `${d.label}: ${format(totals[i])}`).join('; ') })}
        viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
        <Axis scale={scale} format={format} />
        {data.map((d, i) => {
          let acc = 0
          return series.map((s, k) => {
            const v = Math.max(0, d.values[s.key] || 0)
            if (!v) return null
            const y0 = PAD.t + yOf(acc + v, scale, innerH)
            const y1 = PAD.t + yOf(acc, scale, innerH)
            acc += v
            return <rect key={`${i}-${s.key}`} x={PAD.l + bw * i + bw * 0.15} y={y0} width={bw * 0.7} height={Math.max(0, y1 - y0)} fill={seriesColour(k)} stroke={colors.bg} strokeWidth="1"><title>{`${d.label} · ${s.label}: ${format(v)}`}</title></rect>
          })
        })}
        <XLabels labels={data.map(d => d.label)} />
      </svg>
      <AsTable head={['', ...series.map(s => s.label), t('reports.total')]} rows={data.map((d, i) => [d.label, ...series.map(s => format(d.values[s.key] || 0)), format(totals[i])])} />
    </figure>
  )
}

// Lines: data [{ label, values: { [seriesKey]: n } }], series [{ key, label }]; one series is fine
export function LineChart({ title, data, series, format = v => String(v) }) {
  const { t } = useI18n()
  const id = useId()
  const scale = niceScale(data.flatMap(d => series.map(s => d.values[s.key] || 0)))
  const n = data.length
  const x = i => PAD.l + (innerW / Math.max(1, n)) * (i + 0.5)
  return (
    <figure style={fig} aria-labelledby={id}>
      <figcaption id={id} style={cap}>{title}</figcaption>
      <Legend series={series} />
      <svg role="img" aria-label={t('reports.chartLabel', { title, summary: data.map(d => `${d.label}: ${series.map(s => format(d.values[s.key] || 0)).join(' / ')}`).join('; ') })}
        viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
        <Axis scale={scale} format={format} />
        {series.map((s, k) => (
          <g key={s.key}>
            <polyline points={data.map((d, i) => `${x(i)},${PAD.t + yOf(d.values[s.key] || 0, scale, innerH)}`).join(' ')} fill="none" stroke={seriesColour(k)} strokeWidth="2.5" strokeDasharray={k % 2 ? '6 4' : undefined} />
            {data.map((d, i) => <g key={i}><Mark i={k} x={x(i) - 4} y={PAD.t + yOf(d.values[s.key] || 0, scale, innerH) - 4} size={8} /></g>)}
          </g>
        ))}
        <XLabels labels={data.map(d => d.label)} />
      </svg>
      <AsTable head={['', ...series.map(s => s.label)]} rows={data.map(d => [d.label, ...series.map(s => format(d.values[s.key] || 0))])} />
    </figure>
  )
}
