// Counts text sizes and gaps that are off the design scales (DESIGN.md "Typography" and "Layout").
// Used by offScale.test.js, which fails on any off-scale size or gap in a screen file.

export const TEXT_SIZES = [11, 13, 14, 16, 20, 22, 24, 28]
export const GAPS = [0, 4, 8, 12, 16, 24, 32, 40, 48]
// A 1px gap over a line-coloured background draws hairlines between tiles (the menu cards in AppShell):
// a rule, not spacing, so it is allowed.
const HAIRLINE = 1

// fontSize: '12px' · fontSize: 12 · font-size: 12px (CSS in template strings). Only px or no unit: print
// sheets in pt / mm and sizes in em (relative to a parent) are not on the screen scale.
export const SIZE_RE = /(?:fontSize\s*:\s*['"`]?|font-size\s*:\s*)(\d+(?:\.\d+)?)(?!\.?\d)(px)?(?![a-z%])/g
// font: '700 12px/16px …' (the size in the shorthand; the number after / is the line height)
export const FONT_RE = /\bfont\s*:\s*['"`]?[^;'"`}\n]*?(\d+(?:\.\d+)?)px/g
// gap: '6px' · gap: '6px 8px' · rowGap: 6 · column-gap: 10px
export const GAP_RE = /(?:\b(?:gap|rowGap|columnGap)\s*:\s*['"`]?|\b(?:row-|column-)?gap\s*:\s*)((?:\d+(?:\.\d+)?(?:px)?\s*){1,2})(?![\d.a-z%])/g

export function countOffScale(source) {
  let sizes = 0
  let gaps = 0
  for (const m of source.matchAll(SIZE_RE)) {
    if (!TEXT_SIZES.includes(Number(m[1]))) sizes++
  }
  for (const m of source.matchAll(FONT_RE)) {
    if (!TEXT_SIZES.includes(Number(m[1]))) sizes++
  }
  for (const m of source.matchAll(GAP_RE)) {
    for (const v of m[1].trim().split(/\s+/)) {
      const n = Number(v.replace('px', ''))
      if (n !== HAIRLINE && !GAPS.includes(n)) gaps++
    }
  }
  return { sizes, gaps }
}
