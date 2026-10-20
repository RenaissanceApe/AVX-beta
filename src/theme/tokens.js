// Colour themes (docs/HELP.md, H3), based on the Lumen and Pixel palette. Every screen uses
// these through CSS variables (var(--text), var(--accent)…), so one attribute on <html>
// (data-theme) switches the whole app. tokens.test.js checks the contrast of every text colour
// on every background it is used on.
//
//   bg       the page            panel   raised cards, modals       chrome  top bar, phone tabs
//   fg       mixed into lines and tints (white on dark, navy on light)
//   shade    mixed into input backgrounds (darker on dark, lighter on light)
//   text     main text           text2   body text                  muted / soft  secondary text
//   accent   fills, borders      accent2 the end of the button gradient
//   accentText  green text (lime is unreadable on light, so olive there)
//   onAccent text on accent fills
//   danger, warn, info, sky, purple, pink, yellow, orange  status and tint colours, as text
export const THEMES = {
  dark: {
    bg: '#021829', panel: '#06223A', chrome: '#00101C', fg: '#FFFFFF', shade: '#000000',
    text: '#F0F1F3', text2: '#D9E0E7', muted: '#B8BEC8', soft: '#AEB9C6',
    accent: '#33FB31', accent2: '#22C920', accentText: '#33FB31', onAccent: '#021829',
    danger: '#FB8C8C', warn: '#F8B84E', info: '#7DB5FB', sky: '#5CCBF9', purple: '#B9A3FB', pink: '#F78BC6', yellow: '#FBCB4E', orange: '#FBA36A',
    lineK: 1,
  },
  light: {
    bg: '#F0F1F3', panel: '#FFFFFF', chrome: '#DFE9F0', fg: '#021829', shade: '#FFFFFF',
    text: '#021829', text2: '#1C2B3A', muted: '#4A5462', soft: '#4A5462',
    accent: '#33FB31', accent2: '#28D626', accentText: '#3F511A', onAccent: '#021829',
    danger: '#931A11', warn: '#733606', info: '#1A3BA0', sky: '#02486A', purple: '#4E1EA6', pink: '#870F44', yellow: '#633F06', orange: '#7A3105',
    lineK: 1.6,
  },
  contrast: {
    bg: '#00080E', panel: '#021829', chrome: '#000000', fg: '#FFFFFF', shade: '#000000',
    text: '#FFFFFF', text2: '#FFFFFF', muted: '#E6EAEF', soft: '#E6EAEF',
    accent: '#33FB31', accent2: '#33FB31', accentText: '#33FB31', onAccent: '#00080E',
    danger: '#FFA3A3', warn: '#FFCB66', info: '#A6CFFF', sky: '#8FDCFD', purple: '#D2C4FF', pink: '#FFB3DA', yellow: '#FFE066', orange: '#FFC49A',
    lineK: 2.5,
  },
}

export const THEME_NAMES = Object.keys(THEMES)

const kebab = s => s.replace(/[A-Z0-9]+/g, m => `-${m.toLowerCase()}`)

// The CSS for all themes: :root[data-theme="light"] { --bg: …; } and so on
export function themeCss() {
  return THEME_NAMES.map(name => {
    const vars = Object.entries(THEMES[name]).map(([k, v]) => `--${kebab(k)}: ${v};`).join(' ')
    return `:root[data-theme="${name}"] { ${vars} color-scheme: ${name === 'light' ? 'light' : 'dark'}; }`
  }).join('\n')
}

// Contrast ratio between two #rrggbb colours (WCAG 2)
export function contrast(a, b) {
  const lum = hex => {
    const [r, g, bl] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}
