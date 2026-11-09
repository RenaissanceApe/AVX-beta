import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { countOffScale } from './offScale'

// Room to breathe (DESIGN.md, docs/DESIGN_REFRESH.md): text sizes and gaps off the scales may only
// go down. The start is the count on 2026-11-09 (DR1), per file, in offScale.baseline.json.
//   A count went up:   use a size or gap from the scale (DESIGN.md "Typography" / "Layout").
//   A count went down: good. Lower the file's number in the baseline (or rewrite the whole file with
//                      UPDATE_OFFSCALE=1 npx vitest run src/theme/offScale.test.js) so it can't creep back.
// Per file, so sessions working on different screens don't edit the same line.

const SRC = path.resolve(__dirname, '..')
const BASELINE = path.join(__dirname, 'offScale.baseline.json')

function scanAll() {
  const out = {}
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name.endsWith('.jsx') && !e.name.includes('.test.')) {
      const c = countOffScale(fs.readFileSync(p, 'utf8'))
      if (c.sizes || c.gaps) out[path.relative(SRC, p).split(path.sep).join('/')] = c
    }
  })
  walk(SRC)
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)))
}

describe('off-scale text sizes and gaps (ratchet)', () => {
  it('counts sizes and gaps off the scale', () => {
    expect(countOffScale(`fontSize: '12px', fontSize: 13, gap: '6px 8px', font-size: 15px; gap: 10px; rowGap: 4`)).toEqual({ sizes: 2, gaps: 2 })
    expect(countOffScale(`fontSize: '14px', gap: '8px', gap: 0, column-gap: 16px`)).toEqual({ sizes: 0, gaps: 0 })
  })

  it('never goes up in any file', () => {
    const now = scanAll()
    if (process.env.UPDATE_OFFSCALE) fs.writeFileSync(BASELINE, `${JSON.stringify(now, null, 2)}\n`)
    const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
    const up = []
    const down = []
    for (const [file, c] of Object.entries(now)) {
      const b = base[file] || { sizes: 0, gaps: 0 }
      for (const k of ['sizes', 'gaps']) {
        if (c[k] > b[k]) up.push(`${file}: ${k} ${b[k]} → ${c[k]}`)
        else if (c[k] < b[k]) down.push(`${file}: ${k} ${b[k]} → ${c[k]}`)
      }
    }
    for (const file of Object.keys(base)) if (!now[file]) down.push(`${file}: now 0`)
    expect(up, 'Off-scale sizes or gaps went up; use the scales in DESIGN.md').toEqual([])
    expect(down, 'Counts went down: lower them in src/theme/offScale.baseline.json').toEqual([])
  })
})
