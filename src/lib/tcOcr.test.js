import { describe, it, expect } from 'vitest'
import { readTimecode, readingsAgree } from './tcOcr'

// Draws a seven-segment timecode like an LTC reader's display, segments 1 px apart
const SEGS = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' }
function display(text, { ink = 235, bg = 18, noise = 0, W = 20, H = 36, t = 4, seed = 1 } = {}) {
  const width = 300, height = 70
  const px = new Array(width * height).fill(bg)
  const rect = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px[y * width + x] = ink }
  let x = 12
  const y = 16
  for (const ch of text) {
    if (ch === ':') { rect(x, y + 9, x + 3, y + 12); rect(x, y + 24, x + 3, y + 27); x += 10; continue }
    const on = SEGS[ch]
    const h2 = H / 2
    if (on.includes('a')) rect(x + t + 1, y, x + W - t - 2, y + t - 1)
    if (on.includes('b')) rect(x + W - t, y + t, x + W - 1, y + h2 - 2)
    if (on.includes('c')) rect(x + W - t, y + h2 + 1, x + W - 1, y + H - t - 1)
    if (on.includes('d')) rect(x + t + 1, y + H - t, x + W - t - 2, y + H - 1)
    if (on.includes('e')) rect(x, y + h2 + 1, x + t - 1, y + H - t - 1)
    if (on.includes('f')) rect(x, y + t, x + t - 1, y + h2 - 2)
    if (on.includes('g')) rect(x + t + 1, y + h2 - 2, x + W - t - 2, y + h2 + 1)
    x += W + 7
  }
  let r = seed
  const rand = () => { r = (r * 16807) % 2147483647; return r / 2147483647 }
  const data = new Uint8ClampedArray(width * height * 4)
  px.forEach((v, i) => { const n = v + (rand() - 0.5) * 2 * noise; data.set([n, n, n, 255], i * 4) })
  return { data, width, height }
}

describe('reading a timecode display', () => {
  for (const tc of ['01:23:45:16', '19:58:07:24', '23:09:36:00', '10:47:52:18']) {
    it(`reads ${tc}`, () => {
      expect(readTimecode(display(tc), 25)?.text).toBe(tc)
    })
  }
  it('reads dark digits on a light screen', () => {
    expect(readTimecode(display('12:34:56:07', { ink: 20, bg: 230 }), 25)?.text).toBe('12:34:56:07')
  })
  it('copes with some noise', () => {
    expect(readTimecode(display('08:15:29:13', { noise: 40, seed: 7 }), 25)?.text).toBe('08:15:29:13')
  })
  it('refuses what is not timecode', () => {
    expect(readTimecode(display('12:34:56:27'), 25)).toBeNull() // frame 27 at 25 fps
    expect(readTimecode(display('12:34'), 25)).toBeNull()
    const blank = { data: new Uint8ClampedArray(300 * 70 * 4).fill(30), width: 300, height: 70 }
    expect(readTimecode(blank, 25)).toBeNull()
  })
  it('only trusts two readings that moved with the clock', () => {
    expect(readingsAgree({ ms: 1000, at: 0 }, { ms: 1520, at: 500 }, 25)).toBe(true)
    expect(readingsAgree({ ms: 1000, at: 0 }, { ms: 1000, at: 500 }, 25)).toBe(false) // paused
    expect(readingsAgree({ ms: 1000, at: 0 }, { ms: 3000, at: 500 }, 25)).toBe(false) // misread
    expect(readingsAgree({ ms: 1000, at: 0 }, { ms: 1040, at: 40 }, 25)).toBe(false) // too soon
  })
})
