import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { countOffScale } from './offScale'

// Room to breathe (DESIGN.md, docs/DESIGN_REFRESH.md): every text size and gap in a screen file is on
// the scales. Since DR6 (2026-11-09) none is off, so any new one fails.
//   It failed: use a size from DESIGN.md "Typography" (11 · 13 · 14 · 16 · 20 · 22 · 24 · 28) and a gap
//   from "Layout" (0 · 4 · 8 · 12 · 16 · 24 · 32 · 40 · 48, or the space steps in ui.jsx).

const SRC = path.resolve(__dirname, '..')

function scanAll() {
  const out = []
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(jsx|css)$/.test(e.name) && !e.name.includes('.test.')) {
      const c = countOffScale(fs.readFileSync(p, 'utf8'))
      if (c.sizes || c.gaps) out.push(`${path.relative(SRC, p).split(path.sep).join('/')}: ${c.sizes} sizes, ${c.gaps} gaps`)
    }
  })
  walk(SRC)
  return out.sort()
}

describe('off-scale text sizes and gaps', () => {
  it('counts sizes and gaps off the scale', () => {
    expect(countOffScale(`fontSize: '12px', fontSize: 13, gap: '6px 8px', font-size: 15px; gap: 10px; rowGap: 4; font: 700 12px/16px x`)).toEqual({ sizes: 3, gaps: 2 })
    expect(countOffScale(`fontSize: '14px', gap: '8px', gap: 0, column-gap: 16px; font: 700 28px/34px x`)).toEqual({ sizes: 0, gaps: 0 })
    // print sizes in pt, sizes in em and the 1px hairline grid are not counted
    expect(countOffScale(`font-size: 10.5pt; fontSize: '0.45em', gap: 1px; gap: 6mm`)).toEqual({ sizes: 0, gaps: 0 })
  })

  it('finds none in any screen file', () => {
    expect(scanAll(), 'Off-scale sizes or gaps; use the scales in DESIGN.md').toEqual([])
  })
})
