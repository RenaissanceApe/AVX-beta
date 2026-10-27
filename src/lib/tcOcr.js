// Reading a timecode display through the phone's camera (docs/TOOLS_PLAN.md §2, R2). Everything
// happens on the phone; no image leaves it. The person holds the display's digits inside a guide
// box; this finds the eight digits (HH MM SS FF) and reads each one by sampling where the seven
// segments of a digit would be. That suits LED and LCD timecode readers and the plain, wide digits
// consoles and monitors use. A reading is only offered after two frames agree with the time that
// passed between them, and the person always confirms it.

const SEGMENTS = {
  // segment: [u0, u1, v0, v1] as fractions of the digit's box
  a: [0.25, 0.75, 0, 0.16],
  b: [0.68, 1, 0.14, 0.44],
  c: [0.68, 1, 0.56, 0.86],
  d: [0.25, 0.75, 0.84, 1],
  e: [0, 0.32, 0.56, 0.86],
  f: [0, 0.32, 0.14, 0.44],
  g: [0.25, 0.75, 0.42, 0.58],
}
const PATTERNS = {
  0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
}
const NAMES = 'abcdefg'.split('')

// RGBA pixels → a mask of the "ink": the minority side of an Otsu threshold (lit segments on a
// dark display, or dark digits on a light screen)
export function inkMask({ data, width, height }) {
  const gray = new Uint8Array(width * height)
  const hist = new Array(256).fill(0)
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    const v = (data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000 | 0
    gray[i] = v
    hist[v]++
  }
  const total = gray.length
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]
  let sumB = 0, wB = 0, best = 0, th = 127
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (!wB) continue
    const wF = total - wB
    if (!wF) break
    sumB += t * hist[t]
    const mB = sumB / wB, mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) * (mB - mF)
    if (between > best) { best = between; th = t }
  }
  let bright = 0
  for (let i = 0; i < total; i++) if (gray[i] > th) bright++
  const inkIsBright = bright <= total / 2
  const mask = new Uint8Array(total)
  for (let i = 0; i < total; i++) mask[i] = (gray[i] > th) === inkIsBright ? 1 : 0
  return mask
}

// The tallest band of rows with ink (the line of digits)
function textBand(mask, width, height) {
  const rows = new Array(height).fill(0)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) rows[y] += mask[y * width + x]
  const min = Math.max(1, width * 0.01)
  let best = null, start = -1, gap = 0
  const maxGap = Math.max(1, Math.round(height * 0.04))
  for (let y = 0; y <= height; y++) {
    const on = y < height && rows[y] >= min
    if (on) { if (start < 0) start = y; gap = 0 } else if (start >= 0) {
      gap++
      if (gap > maxGap || y === height) {
        const end = y - gap
        if (!best || end - start > best[1] - best[0]) best = [start, end]
        start = -1; gap = 0
      }
    }
  }
  return best
}

// Splits the band into blobs by ink columns; each blob: { x0, x1, y0, y1 }
function blobs(mask, width, y0, y1) {
  const cols = new Array(width).fill(0)
  for (let y = y0; y <= y1; y++) for (let x = 0; x < width; x++) cols[x] += mask[y * width + x]
  const runs = []
  let start = -1
  for (let x = 0; x <= width; x++) {
    const on = x < width && cols[x] > 0
    if (on && start < 0) start = x
    if (!on && start >= 0) { runs.push([start, x - 1]); start = -1 }
  }
  return runs.map(([x0, x1]) => {
    let top = y1, bottom = y0, ink = 0
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (mask[y * width + x]) { ink++; if (y < top) top = y; if (y > bottom) bottom = y }
    return { x0, x1, y0: top, y1: bottom, ink }
  }).filter(b => b.ink >= 2)
}

// The digit in a box, by how much ink sits where each segment would be
export function readDigit(mask, width, box) {
  const w = box.x1 - box.x0 + 1, h = box.y1 - box.y0 + 1
  if (w < h * 0.38) return { digit: 1, score: 1 }
  const dens = {}
  for (const n of NAMES) {
    const [u0, u1, v0, v1] = SEGMENTS[n]
    const xa = box.x0 + Math.floor(u0 * w), xb = box.x0 + Math.max(Math.floor(u0 * w), Math.ceil(u1 * w) - 1)
    const ya = box.y0 + Math.floor(v0 * h), yb = box.y0 + Math.max(Math.floor(v0 * h), Math.ceil(v1 * h) - 1)
    let ink = 0, all = 0
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) { all++; ink += mask[y * width + x] }
    dens[n] = all ? ink / all : 0
  }
  const top = Math.max(...Object.values(dens)) || 1
  const on = Object.fromEntries(NAMES.map(n => [n, Math.min(1, dens[n] / top / 0.6)]))
  let best = null, second = -Infinity
  for (const [digit, segs] of Object.entries(PATTERNS)) {
    let score = 0
    for (const n of NAMES) score += segs.includes(n) ? on[n] : 1 - on[n]
    if (!best || score > best.score) { if (best) second = Math.max(second, best.score); best = { digit: Number(digit), score } } else second = Math.max(second, score)
  }
  return { digit: best.digit, score: (best.score - second) / 7 }
}

// RGBA pixels → { h, m, s, f, text, confidence } or null
export function readTimecode(image, fps = 25) {
  const { width, height } = image
  const mask = inkMask(image)
  const band = textBand(mask, width, height)
  if (!band || band[1] - band[0] < 8) return null
  let parts = blobs(mask, width, band[0], band[1])
  if (!parts.length) return null
  const tallest = Math.max(...parts.map(b => b.y1 - b.y0 + 1))
  // Pieces of one seven-segment digit sit very close together: join them first
  parts = parts.reduce((out, b) => {
    const last = out[out.length - 1]
    if (last && b.x0 - last.x1 - 1 <= tallest * 0.1 && b.x1 - last.x0 + 1 <= tallest * 0.85) {
      out[out.length - 1] = { x0: last.x0, x1: b.x1, y0: Math.min(last.y0, b.y0), y1: Math.max(last.y1, b.y1), ink: last.ink + b.ink }
    } else out.push(b)
    return out
  }, [])
  // Colons and dots are short; digits are nearly as tall as the tallest
  const digits = parts.filter(b => b.y1 - b.y0 + 1 >= tallest * 0.6)
  // Still more than eight: join the closest neighbours while the result stays digit-shaped
  while (digits.length > 8) {
    let at = -1, gap = Infinity
    for (let i = 0; i < digits.length - 1; i++) {
      const g = digits[i + 1].x0 - digits[i].x1
      const merged = digits[i + 1].x1 - digits[i].x0 + 1
      if (g < gap && merged <= tallest * 0.85) { gap = g; at = i }
    }
    if (at < 0) return null
    const a = digits[at], b = digits[at + 1]
    digits.splice(at, 2, { x0: a.x0, x1: b.x1, y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1), ink: a.ink + b.ink })
  }
  if (digits.length !== 8) return null
  // Digits share one height: use the line's top and bottom, so a "1" isn't stretched
  const y0 = Math.min(...digits.map(d => d.y0)), y1 = Math.max(...digits.map(d => d.y1))
  const read = digits.map(d => readDigit(mask, width, { ...d, y0, y1 }))
  const n = read.map(r => r.digit)
  const h = n[0] * 10 + n[1], m = n[2] * 10 + n[3], s = n[4] * 10 + n[5], f = n[6] * 10 + n[7]
  if (h > 23 || m > 59 || s > 59 || f >= Math.round(Number(fps))) return null
  const p = v => String(v).padStart(2, '0')
  return { h, m, s, f, text: `${p(h)}:${p(m)}:${p(s)}:${p(f)}`, confidence: Math.min(...read.map(r => r.score)) }
}

// Two readings agree when the second moved on by the time that passed (±2.5 frames), and some
// time did pass (so a paused display isn't mistaken for a running one)
export function readingsAgree(first, second, fps = 25) {
  if (!first || !second || first.ms === undefined) return false
  const elapsed = second.at - first.at
  if (elapsed < 150 || elapsed > 4000) return false
  const moved = second.ms - first.ms
  return Math.abs(moved - elapsed) <= (2.5 * 1000) / Number(fps)
}
