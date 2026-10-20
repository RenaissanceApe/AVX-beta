import { useEffect, useState } from 'react'
import { THEMES } from '../theme/tokens'

// Appearance (docs/HELP.md, H3): theme, text size, comfortable mode and font. Kept on each device,
// not in the account: a phone in a sunny loading bay may want the light theme while the office
// computer stays dark. Applied as attributes on <html> that the CSS in index.html reads:
//   data-theme="dark|light|contrast"  data-size="normal|large|xlarge"  data-comfort  data-font="readable"
const KEY = 'avx.appearance'
export const DEFAULTS = { theme: 'dark', size: 'normal', comfort: false, font: 'standard', simple: 'auto' }
export const THEME_CHOICES = ['dark', 'light', 'contrast', 'system']
export const SIZE_CHOICES = ['normal', 'large', 'xlarge']
// Simple mode (H4): auto = on for people who are only crew, or on / off by choice
export const SIMPLE_CHOICES = ['auto', 'on', 'off']
export const SIZE_ZOOM = { normal: 1, large: 1.15, xlarge: 1.3 }

export function readAppearance() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}')
    return {
      theme: THEME_CHOICES.includes(saved.theme) ? saved.theme : DEFAULTS.theme,
      size: SIZE_CHOICES.includes(saved.size) ? saved.size : DEFAULTS.size,
      comfort: saved.comfort === true,
      font: saved.font === 'readable' ? 'readable' : 'standard',
      simple: SIMPLE_CHOICES.includes(saved.simple) ? saved.simple : DEFAULTS.simple,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

// "Follow the device": light or dark from the phone's or computer's own setting
export const resolveTheme = (theme, prefersLight) => (theme === 'system' ? (prefersLight ? 'light' : 'dark') : theme)
const prefersLight = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches

export function applyAppearance(a = readAppearance()) {
  const root = document.documentElement
  const theme = resolveTheme(a.theme, prefersLight())
  root.dataset.theme = theme
  root.dataset.size = a.size
  root.dataset.font = a.font
  if (a.comfort) root.dataset.comfort = ''
  else delete root.dataset.comfort
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEMES[theme].chrome)
}

export function saveAppearance(a) {
  try { localStorage.setItem(KEY, JSON.stringify(a)) } catch { /* private mode: still applies for this visit */ }
  applyAppearance(a)
  window.dispatchEvent(new Event('avx:appearance'))
}

// Text size zooms the page; things placed by hand (popovers) divide by this to land in the right spot
export const pageZoom = () => (typeof document === 'undefined' ? 1 : parseFloat(getComputedStyle(document.body).zoom) || 1)

export function useAppearance() {
  const [a, setA] = useState(readAppearance)
  useEffect(() => {
    const sync = () => setA(readAppearance())
    window.addEventListener('avx:appearance', sync)
    // Following the device: switch when the device switches
    const mq = window.matchMedia?.('(prefers-color-scheme: light)')
    const onDevice = () => { if (readAppearance().theme === 'system') applyAppearance() }
    mq?.addEventListener?.('change', onDevice)
    return () => { window.removeEventListener('avx:appearance', sync); mq?.removeEventListener?.('change', onDevice) }
  }, [])
  return [a, next => saveAppearance({ ...a, ...next })]
}
