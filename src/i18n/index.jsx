import { createContext, useContext, useEffect, useState } from 'react'
import { format as dfFormat, formatDistanceToNow } from 'date-fns'
import { pt as ptLocale, enGB } from 'date-fns/locale'
import en from './en'
import pt from './pt'

// Lightweight i18n: flat dictionaries, {placeholders}, and plural keys (key.one / key.other).
// A module-level current language lets non-React helpers (error messages, activity text) translate too;
// the provider re-renders the app when it changes.

export const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'pt', label: 'Português' },
]
const DICTS = { en, pt }
const DATE_LOCALES = { en: enGB, pt: ptLocale }
const STORAGE_KEY = 'avx.lang'

let current = 'en'

export function detectLanguage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && DICTS[stored]) return stored
  } catch { /* storage unavailable */ }
  const nav = (typeof navigator !== 'undefined' && (navigator.languages?.[0] || navigator.language)) || 'en'
  return nav.toLowerCase().startsWith('pt') ? 'pt' : 'en'
}

export function setCurrentLanguage(lang) {
  current = DICTS[lang] ? lang : 'en'
}
export const getLanguage = () => current

export function t(key, vars) {
  const dict = DICTS[current] || en
  let template
  if (vars && typeof vars.count === 'number') {
    const form = vars.count === 1 ? 'one' : 'other'
    template = dict[`${key}.${form}`] ?? en[`${key}.${form}`]
  }
  template = template ?? dict[key] ?? en[key]
  if (template === undefined) return key
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (m, name) => (vars[name] !== undefined && vars[name] !== null ? String(vars[name]) : m))
}

export const dateLocale = () => DATE_LOCALES[current] || enGB
export const fmt = (date, pattern) => dfFormat(typeof date === 'string' && date.length === 10 ? new Date(`${date}T00:00:00`) : new Date(date), pattern, { locale: dateLocale() })
export const ago = date => formatDistanceToNow(new Date(date), { addSuffix: true, locale: dateLocale() })

const I18nContext = createContext({ lang: 'en', setLang: () => {} })

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    const l = detectLanguage()
    setCurrentLanguage(l)
    return l
  })

  useEffect(() => { document.documentElement.lang = lang }, [lang])

  function setLang(next) {
    if (!DICTS[next]) return
    setCurrentLanguage(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* ignore */ }
    setLangState(next)
  }

  return <I18nContext.Provider value={{ lang, setLang }}>{children}</I18nContext.Provider>
}

// Components call this so they re-render when the language changes.
export function useI18n() {
  const { lang, setLang } = useContext(I18nContext)
  return { lang, setLang, t, fmt, ago }
}
