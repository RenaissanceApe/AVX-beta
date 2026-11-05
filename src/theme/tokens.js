// Colour themes (docs/HELP.md, H3), based on the Lumen and Pixel palette. Every screen uses
// these through CSS variables (var(--text), var(--accent)…), so one attribute on <html>
// (data-theme) switches the whole app. tokens.test.js checks the contrast of every text colour
// on every background it is used on.
//
//   bg       the page            panel   raised cards, modals       chrome  top bar, phone tabs
//   fg       mixed into lines and tints (white on dark, navy on light)
//   shade    mixed into input backgrounds (darker on dark, lighter on light)
//   text     main text           text2   body text                  muted / soft  secondary text
//   accent   fills, borders      accent2 hover of accent fills (no gradients: Brand Book v1.2)
//   accentText  green text (lime is unreadable on light, so olive there)
//   onAccent text on accent fills
//   danger, warn, info, sky, purple, pink, yellow, orange  status and tint colours, as text
export const THEMES = {
  // Show: the default. L&P blue-700 page, a tone step up for panels, blue-900 chrome.
  dark: {
    bg: '#021829', panel: '#03213A', chrome: '#00080E', fg: '#F0F1F3', shade: '#00080E',
    text: '#F0F1F3', text2: '#DFE9F0', muted: '#B8BEC8', soft: '#B8BEC8',
    accent: '#33FB31', accent2: '#7EF67D', accentText: '#33FB31', onAccent: '#021829',
    danger: '#FA8A80', warn: '#F5B94A', info: '#94C0E2', sky: '#7FD0F0', purple: '#B9A3FB', pink: '#F78BC6', yellow: '#F2D14E', orange: '#F6A26A',
    lineK: 1,
  },
  // Daylight: gray-100 page, white panels, blue-100 chrome. The primary fill is navy: lime has no edge on white.
  light: {
    bg: '#F0F1F3', panel: '#FFFFFF', chrome: '#DFE9F0', fg: '#021829', shade: '#FFFFFF',
    text: '#021829', text2: '#2E3441', muted: '#4A5462', soft: '#4A5462',
    accent: '#021829', accent2: '#16598C', accentText: '#3F511A', onAccent: '#F0F1F3',
    danger: '#931A11', warn: '#733606', info: '#134D7A', sky: '#02486A', purple: '#4E1EA6', pink: '#870F44', yellow: '#633F06', orange: '#7A3105',
    lineK: 1.6,
  },
  // High contrast: for low vision and bright sun. 7:1 text, pure white on near-black.
  contrast: {
    bg: '#00080E', panel: '#021829', chrome: '#000000', fg: '#FFFFFF', shade: '#000000',
    text: '#FFFFFF', text2: '#FFFFFF', muted: '#E6EAEF', soft: '#E6EAEF',
    accent: '#33FB31', accent2: '#7EF67D', accentText: '#33FB31', onAccent: '#00080E',
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
