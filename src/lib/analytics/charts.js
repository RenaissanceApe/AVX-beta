// Chart maths for the plain-SVG report charts (src/components/reports/Charts.jsx): nice axis
// steps, positions, and the series colours (theme variables, never a raw colour).

// A "nice" axis for values from 0 (or the smallest negative) up to max: steps of 1, 2, 2.5 or 5 × 10^n.
export function niceScale(values, ticks = 4) {
  const nums = values.map(Number).filter(Number.isFinite)
  const hi = Math.max(0, ...nums)
  const lo = Math.min(0, ...nums)
  const span = hi - lo
  if (span === 0) return { min: 0, max: 1, step: 0.25, ticks: [0, 0.25, 0.5, 0.75, 1] }
  const raw = span / ticks
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map(m => m * pow).find(s => s >= raw)
  const tidy = v => Math.round(v * 1e9) / 1e9
  const min = tidy(Math.floor(tidy(lo / step)) * step)
  const max = tidy(Math.ceil(tidy(hi / step)) * step)
  const out = []
  for (let v = min; v <= max + step / 2; v += step) out.push(tidy(v))
  return { min, max, step, ticks: out }
}

// Where a value sits between 0 (top) and height (bottom) on a scale
export const yOf = (value, scale, height) =>
  height - ((Number(value) - scale.min) / (scale.max - scale.min || 1)) * height

// Series colours, in order. Each series also has a label and a shape in the legend, and every
// chart has a table, so colour is never the only way to tell them apart.
export const SERIES_COLOURS = ['var(--accent)', 'var(--info)', 'var(--purple)', 'var(--orange)', 'var(--pink)', 'var(--sky)']
export const seriesColour = i => SERIES_COLOURS[i % SERIES_COLOURS.length]

// Short number for axis labels: 1 200 → "1.2k", 3 400 000 → "3.4M"
export function shortNumber(v, lang = 'en') {
  const n = Number(v) || 0
  const abs = Math.abs(n)
  const f = (x, s) => `${new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(x)}${s}`
  if (abs >= 1e6) return f(n / 1e6, 'M')
  if (abs >= 1e3) return f(n / 1e3, 'k')
  return new Intl.NumberFormat(lang, { maximumFractionDigits: 2 }).format(n)
}

// Polyline points for a line or sparkline
export function linePoints(values, width, height, scale = niceScale(values)) {
  const n = values.length
  if (!n) return ''
  return values.map((v, i) => `${n === 1 ? width / 2 : (i / (n - 1)) * width},${yOf(v, scale, height).toFixed(1)}`).join(' ')
}
