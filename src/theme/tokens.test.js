import { describe, it, expect } from 'vitest'
import { THEMES, themeCss, contrast, DERIVED_PCT } from './tokens'

// A colour at some percent over a background, as #rrggbb (what color-mix(… transparent) shows)
const over = (fg, bg, pct) => '#' + [1, 3, 5].map(i => Math.round(parseInt(fg.slice(i, i + 2), 16) * pct / 100 + parseInt(bg.slice(i, i + 2), 16) * (1 - pct / 100)).toString(16).padStart(2, '0')).join('')

// Small text needs 4.5:1 (WCAG AA), on the page, on cards and in the top bar
const TEXT = ['text', 'text2', 'muted', 'soft', 'accentText', 'danger', 'warn', 'info', 'sky', 'purple', 'pink', 'yellow', 'orange']
const BACKGROUNDS = ['bg', 'panel', 'chrome']

describe('themes', () => {
  it('have the same tokens', () => {
    const keys = Object.keys(THEMES.dark).sort()
    for (const t of Object.values(THEMES)) expect(Object.keys(t).sort()).toEqual(keys)
  })

  it('keep every text colour readable on every background (4.5:1)', () => {
    const low = []
    for (const [name, t] of Object.entries(THEMES)) {
      for (const fg of TEXT) for (const bg of BACKGROUNDS) {
        const r = contrast(t[fg], t[bg])
        if (r < 4.5) low.push(`${name}: ${fg} on ${bg} = ${r.toFixed(2)}`)
      }
      const onAccent = contrast(t.onAccent, t.accent)
      if (onAccent < 4.5) low.push(`${name}: onAccent on accent = ${onAccent.toFixed(2)}`)
    }
    expect(low).toEqual([])
  })

  it('keep status colours readable on their own tint (chips, avatars, warnings: up to 25%)', () => {
    const low = []
    for (const [name, t] of Object.entries(THEMES)) {
      for (const c of ['accentText', 'danger', 'warn', 'info', 'sky', 'purple', 'pink', 'yellow', 'orange']) {
        for (const bg of ['bg', 'panel']) {
          const r = contrast(t[c], over(t[c], t[bg], 25))
          if (r < 4.5) low.push(`${name}: ${c} on its tint over ${bg} = ${r.toFixed(2)}`)
        }
      }
    }
    expect(low).toEqual([])
  })

  it('make the high-contrast theme at least 7:1 for text', () => {
    const t = THEMES.contrast
    for (const fg of ['text', 'text2', 'muted', 'accentText']) for (const bg of BACKGROUNDS) expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(7)
  })

  it('give control edges (line-strong) and the focus ring 3:1 on every ground', () => {
    const low = []
    for (const [name, t] of Object.entries(THEMES)) {
      const pct = Math.min(100, DERIVED_PCT.lineStrong * t.lineK)
      for (const bg of ['bg', 'panel', 'chrome']) {
        const edge = contrast(over(t.fg, t[bg], pct), t[bg])
        if (edge < 3) low.push(`${name}: line-strong on ${bg} = ${edge.toFixed(2)}`)
        const ring = contrast(t.focus, t[bg])
        if (ring < 3) low.push(`${name}: focus on ${bg} = ${ring.toFixed(2)}`)
      }
    }
    expect(low).toEqual([])
  })

  it('keep every label colour readable on the chip ground (fill over bg and panel)', () => {
    const low = []
    for (const [name, t] of Object.entries(THEMES)) {
      for (const c of ['muted', 'info', 'accentText', 'danger', 'yellow', 'orange', 'purple', 'pink', 'sky', 'warn', 'text']) {
        for (const bg of ['bg', 'panel']) {
          const fill = over(t.fg, t[bg], Math.min(100, DERIVED_PCT.fill * t.lineK))
          const r = contrast(t[c], fill)
          if (r < 4.5) low.push(`${name}: ${c} on fill over ${bg} = ${r.toFixed(2)}`)
        }
      }
    }
    expect(low).toEqual([])
  })

  it('keep status text readable on the danger-soft and warn-soft rows', () => {
    const low = []
    for (const [name, t] of Object.entries(THEMES)) {
      for (const [c, pct] of [['danger', 16], ['warn', 14]]) {
        const soft = over(t[c], t.panel, pct)
        for (const fg of ['text', 'muted', c]) {
          const r = contrast(t[fg], soft)
          if (r < 4.5) low.push(`${name}: ${fg} on ${c}-soft = ${r.toFixed(2)}`)
        }
      }
    }
    expect(low).toEqual([])
  })

  it('writes one CSS block per theme', () => {
    const css = themeCss()
    expect(css).toMatch(/:root\[data-theme="light"\] \{[^}]*--accent-text: #3F511A;/)
    expect(css).toMatch(/--on-accent: #021829;/)
    for (const v of ['line', 'line-strong', 'fill', 'hover', 'selection', 'danger-soft', 'warn-soft', 'overlay', 'paper', 'ink', 'focus']) {
      expect(css.split('\n').every(block => block.includes(`--${v}: `))).toBe(true)
    }
  })
})

// New colours go through the theme (colors.* / var(--…) / tint()), never written straight in a
// screen; otherwise they don't follow the light and high-contrast themes. Paper-like pages
// (print, call sheet, public quote, labels) and pictures on white are the exceptions.
describe('screens use theme colours', () => {
  it('has no raw colours outside the theme', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const PAPER = /Dipswitches|RehearsalReportPage|QuoteDocument|QuotePublicPage|GuestThread|SupplierLinkPage|CallSheetPage|QuotePrintPage|PackingListPage|InputListPage|StagePlotPage|StagePlotSvg|PatchSheetPage|LightPlotPage|LightPlotSvg|SystemCalcPage|SystemPlotSvg|LabelsPage/
    const ALLOWED = [/background: '#fff'/, /background: '#000'/, /brand_color: '#1EC878'/, /rgba\(0,\s*0,\s*0,/]
    const found = []
    const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) { if (e.name !== 'theme') walk(p) } else if (/\.jsx?$/.test(e.name) && !/\.test\./.test(e.name) && !PAPER.test(p)) {
        fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
          const raw = line.match(/#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b(?![\w-])|rgba?\(\s*\d/g)
          if (raw && !ALLOWED.some(a => a.test(line))) found.push(`${path.relative(process.cwd(), p)}:${i + 1} ${raw.join(' ')}`)
        })
      }
    })
    walk(path.resolve(__dirname, '..'))
    expect(found).toEqual([])
  })
})

// Brand Book v1.2 / DESIGN.md: depth comes from grounds and 1px lines, never from shadows or blur.
// Only the focus ring (outline) and 2px indicator bars (borders) are allowed.
describe('screens stay flat', () => {
  const scan = async (pattern) => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const found = []
    const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.jsx?$/.test(e.name) && !/\.test\./.test(e.name)) {
        fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
          if (pattern.test(line)) found.push(`${path.relative(process.cwd(), p)}:${i + 1}`)
        })
      }
    })
    walk(path.resolve(__dirname, '..'))
    return found
  }
  it('has no shadows, blur or glows', async () => {
    expect(await scan(/box-?shadow|boxShadow|backdrop-?filter|backdropFilter|text-?shadow|textShadow|drop-shadow/i)).toEqual([])
  })
  // Hatching (repeating-linear-gradient) marks unavailable days and is allowed; the dot field lives in brand.css
  it('has no gradients or grain', async () => {
    expect(await scan(/(?<!repeating-)linear-gradient|radial-gradient|conic-gradient|linearGradient|radialGradient|feTurbulence/)).toEqual([])
  })
})
