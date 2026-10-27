import { describe, it, expect } from 'vitest'
import { LtcDecoder, encodeWord, decodeWord } from './ltc'
import { framesToTc, tcToFrames } from './rehearsal'

// Makes an LTC signal: biphase mark, flipping at every bit and mid-bit for a 1
function signal(startTc, count, { fps = 25, rate = 48000, df = false, amp = 0.4, noise = 0 } = {}) {
  const [h, m, s, f] = startTc.split(/[:;]/).map(Number)
  const start = tcToFrames(h, m, s, f, fps, df)
  const out = []
  let level = 1, pos = 0
  const perBit = rate / (80 * fps)
  let seed = 3
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5 }
  const emit = until => { while (pos < until) { out.push(level * amp + rand() * noise); pos++ } }
  let t = 0
  for (let k = 0; k < count; k++) {
    const [hh, mm, ss, ff] = framesToTc(start + k, fps, df).split(/[:;]/)
    for (const bit of encodeWord({ h: +hh, m: +mm, s: +ss, f: +ff, df })) {
      level = -level
      if (bit) { emit(Math.round(t + perBit / 2)); level = -level }
      t += perBit
      emit(Math.round(t))
    }
  }
  return Float32Array.from(out)
}

const decodeAll = (samples, rate = 48000, chunk = 2048) => {
  const d = new LtcDecoder(rate)
  const frames = []
  for (let i = 0; i < samples.length; i += chunk) frames.push(...d.push(samples.subarray(i, i + chunk), i))
  return { frames, d }
}
const label = w => `${String(w.h).padStart(2, '0')}:${String(w.m).padStart(2, '0')}:${String(w.s).padStart(2, '0')}:${String(w.f).padStart(2, '0')}`

describe('LTC', () => {
  it('round-trips a word', () => {
    expect(decodeWord(encodeWord({ h: 13, m: 47, s: 9, f: 21 }))).toEqual({ h: 13, m: 47, s: 9, f: 21, df: false })
  })
  it('decodes 25 fps at 48 kHz', () => {
    const { frames, d } = decodeAll(signal('01:00:00:00', 30))
    // The first word or two go by while the decoder locks on
    const got = frames.map(label)
    expect(got.length).toBeGreaterThanOrEqual(27)
    // The last word completes with the next edge, so it isn't seen
    expect(got.at(-1)).toBe('01:00:01:03')
    expect(got).toContain('01:00:00:24')
    expect(got).toContain('01:00:01:00')
    expect(Math.round(d.fps)).toBe(25)
  })
  it('decodes 30 fps at 44.1 kHz with noise', () => {
    const { frames, d } = decodeAll(signal('10:59:59:20', 20, { fps: 30, rate: 44100, noise: 0.05 }), 44100)
    expect(frames.map(label).at(-1)).toBe('11:00:00:08')
    expect(Math.round(d.fps)).toBe(30)
  })
  it('decodes drop-frame 29.97 and reports the flag', () => {
    const { frames } = decodeAll(signal('00:00:59;27', 8, { fps: 29.97, df: true }))
    expect(frames.map(label)).toContain('00:01:00:02')
    expect(frames.at(-1).df).toBe(true)
  })
  it('marks where each word ends', () => {
    const { frames } = decodeAll(signal('00:00:00:00', 6))
    const gaps = frames.slice(1).map((f, i) => f.endSample - frames[i].endSample)
    for (const g of gaps) expect(Math.abs(g - 1920)).toBeLessThanOrEqual(2) // 48000 / 25
  })
  it('finds nothing in silence', () => {
    expect(decodeAll(new Float32Array(48000)).frames).toEqual([])
  })
})
