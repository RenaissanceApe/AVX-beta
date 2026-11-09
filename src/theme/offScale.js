// Counts text sizes and gaps that are off the design scales (DESIGN.md "Typography" and "Layout"),
// per file. Used by offScale.test.js, a ratchet: a file's counts may go down, never up.

export const TEXT_SIZES = [11, 13, 14, 16, 20, 22, 24, 28]
export const GAPS = [0, 4, 8, 12, 16, 24, 32, 40, 48]

// fontSize: '12px' · fontSize: 12 · font-size: 12px (CSS in template strings)
const SIZE_RE = /(?:fontSize\s*:\s*['"`]?|font-size\s*:\s*)(\d+(?:\.\d+)?)(px)?\b/g
// gap: '6px' · gap: '6px 8px' · rowGap: 6 · column-gap: 10px
const GAP_RE = /(?:\b(?:gap|rowGap|columnGap)\s*:\s*['"`]?|\b(?:row-|column-)?gap\s*:\s*)((?:\d+(?:\.\d+)?(?:px)?\s*){1,2})/g

export function countOffScale(source) {
  let sizes = 0
  let gaps = 0
  for (const m of source.matchAll(SIZE_RE)) {
    if (!TEXT_SIZES.includes(Number(m[1]))) sizes++
  }
  for (const m of source.matchAll(GAP_RE)) {
    for (const v of m[1].trim().split(/\s+/)) {
      if (!GAPS.includes(Number(v.replace('px', '')))) gaps++
    }
  }
  return { sizes, gaps }
}
