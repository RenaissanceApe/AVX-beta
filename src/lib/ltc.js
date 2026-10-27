// LTC (SMPTE linear timecode) from an audio signal, decoded on the phone (docs/TOOLS_PLAN.md §2,
// R2). LTC sends one 80-bit word per frame in biphase mark code: the level flips at the start of
// every bit, and once more in the middle of a 1. The word ends with the sync word
// 0011 1111 1111 1101; hours, minutes, seconds and frames are BCD fields, least significant bit
// first.

export const SYNC = [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1]

const field = (bits, from, count) => {
  let v = 0
  for (let i = 0; i < count; i++) v |= bits[from + i] << i
  return v
}

// The 80 bits of one frame → { h, m, s, f, df }, or null when the digits aren't valid timecode
export function decodeWord(bits) {
  const f = field(bits, 0, 4) + 10 * field(bits, 8, 2)
  const s = field(bits, 16, 4) + 10 * field(bits, 24, 3)
  const m = field(bits, 32, 4) + 10 * field(bits, 40, 3)
  const h = field(bits, 48, 4) + 10 * field(bits, 56, 2)
  if (f > 29 || s > 59 || m > 59 || h > 23 || field(bits, 0, 4) > 9 || field(bits, 16, 4) > 9 || field(bits, 32, 4) > 9 || field(bits, 48, 4) > 9) return null
  return { h, m, s, f, df: bits[10] === 1 }
}

// The 80 bits for a timecode (used by the tests to make a signal)
export function encodeWord({ h, m, s, f, df = false }) {
  const bits = new Array(80).fill(0)
  const put = (from, count, v) => { for (let i = 0; i < count; i++) bits[from + i] = (v >> i) & 1 }
  put(0, 4, f % 10); put(8, 2, Math.floor(f / 10)); bits[10] = df ? 1 : 0
  put(16, 4, s % 10); put(24, 3, Math.floor(s / 10))
  put(32, 4, m % 10); put(40, 3, Math.floor(m / 10))
  put(48, 4, h % 10); put(56, 2, Math.floor(h / 10))
  SYNC.forEach((b, i) => { bits[64 + i] = b })
  return bits
}

// Feed it audio samples as they arrive; it returns the frames it completed, each with the sample
// index where its word ended (the start of the next frame).
export class LtcDecoder {
  constructor(sampleRate) {
    this.rate = sampleRate
    this.period = sampleRate / 2000 // samples per bit, 25 fps to start; adapts to the signal
    this.peak = 0
    this.high = null
    this.lastEdge = null
    this.half = false
    this.bits = []
    this.level = 0
  }

  // fps measured from the bit length (23.976 and 29.97 can't be told from 24 and 30 this way)
  get fps() { return this.rate / (80 * this.period) }

  push(samples, startIndex) {
    const frames = []
    for (let i = 0; i < samples.length; i++) {
      const v = samples[i]
      const a = Math.abs(v)
      this.peak = Math.max(a, this.peak * 0.9995)
      this.level = Math.max(a, this.level * 0.999)
      const thr = this.peak * 0.2
      if (thr < 0.002) continue
      let edge = false
      if (this.high !== true && v > thr) { edge = this.high !== null; this.high = true } else if (this.high !== false && v < -thr) { edge = this.high !== null; this.high = false }
      if (!edge) continue
      const at = startIndex + i
      if (this.lastEdge !== null) {
        const d = at - this.lastEdge
        // Far too long: no signal in between; start again
        if (d > this.period * 3) { this.half = false; this.bits = [] } else if (d > this.period * 0.75) {
          this.period = this.period * 0.9 + d * 0.1
          this.half = false
          if (this.bit(0)) { const w = decodeWord(this.bits.slice(-80)); if (w) frames.push({ ...w, endSample: at }) }
        } else {
          this.period = this.period * 0.9 + d * 2 * 0.1
          if (this.half) {
            this.half = false
            if (this.bit(1)) { const w = decodeWord(this.bits.slice(-80)); if (w) frames.push({ ...w, endSample: at }) }
          } else {
            this.half = true
          }
        }
      }
      this.lastEdge = at
    }
    return frames
  }

  // Adds a bit; true when the last 80 bits end with the sync word
  bit(b) {
    this.bits.push(b)
    if (this.bits.length > 160) this.bits.splice(0, this.bits.length - 80)
    if (this.bits.length < 80) return false
    const n = this.bits.length
    for (let i = 0; i < 16; i++) if (this.bits[n - 16 + i] !== SYNC[i]) return false
    return true
  }
}
