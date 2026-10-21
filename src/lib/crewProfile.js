// Crew profiles (docs/CREW_NETWORK.md, N1): the shared lists and the checks the profile page and
// the database agree on. Names of countries and languages come from the browser (Intl), so every
// language AVX speaks shows them in its own words.

// Functions people do on a show, as keys (translated under crewFn.*), in a sensible order
export const FUNCTIONS = [
  'foh_engineer', 'monitor_engineer', 'system_tech', 'audio_tech',
  'lighting_designer', 'lighting_op', 'lighting_tech',
  'video_tech', 'led_tech', 'camera_op', 'media_server',
  'rigger', 'stagehand', 'backline_tech', 'carpenter', 'power_tech',
  'stage_manager', 'production_manager', 'tour_manager', 'site_manager',
  'truck_driver', 'runner',
]

// Languages offered first (others can be added from the full list)
export const LANGUAGES = ['pt', 'en', 'es', 'fr', 'de', 'it', 'nl', 'pl', 'ro', 'uk', 'ru', 'ar', 'zh', 'ja', 'hi', 'sv', 'da', 'no', 'fi', 'cs', 'el', 'tr', 'hu', 'ca', 'gl', 'eu']

export const TRAVEL = [
  { scope: 'km', km: 25 }, { scope: 'km', km: 50 }, { scope: 'km', km: 100 }, { scope: 'km', km: 250 }, { scope: 'km', km: 500 },
  { scope: 'country' }, { scope: 'europe' }, { scope: 'world' },
]
export const travelKey = p => (p?.travel_scope || 'km') === 'km' ? `km:${p?.travel_km ?? ''}` : p.travel_scope
export const fromTravelKey = key => key.startsWith('km:') ? { travel_scope: 'km', travel_km: Number(key.slice(3)) || null } : { travel_scope: key, travel_km: null }

export const MAX = { functions: 12, languages: 12, links: 3, certificates: 20, headline: 120, other: 200, bio: 1000 }

const names = (lang, type) => {
  try { return new Intl.DisplayNames([lang], { type }) } catch { return null }
}
export const countryName = (code, lang = 'en') => (code && names(lang, 'region')?.of(code)) || code || ''
export const languageName = (code, lang = 'en') => {
  const n = code && names(lang, 'language')?.of(code)
  return n ? n.charAt(0).toLocaleUpperCase(lang) + n.slice(1) : code || ''
}

// "example.com/me" → "https://example.com/me"; anything that isn't a web address → null
export function cleanLink(raw) {
  let s = String(raw || '').trim()
  if (!s) return null
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`
  try {
    const u = new URL(s)
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.') || /\s/.test(s) || s.length > 207) return null
    return s
  } catch { return null }
}

// What's missing before the profile can be switched on
export function missing(p) {
  const out = []
  if (!(p.functions?.length || p.other_functions?.trim())) out.push('functions')
  if (!p.base_place) out.push('base')
  return out
}

// The form → the row to save (trimmed, limited, links cleaned); { row, errors }
export function toRow(p) {
  const errors = []
  const links = (p.links || []).map(l => String(l || '').trim()).filter(Boolean)
  const cleaned = links.map(cleanLink)
  if (cleaned.some(l => !l)) errors.push('links')
  const certificates = (p.certificates || [])
    .map(c => ({ name: String(c.name || '').trim(), issuer: String(c.issuer || '').trim() || undefined, expires_on: c.expires_on || undefined }))
    .filter(c => c.name)
  const years = p.experience_years === '' || p.experience_years == null ? null : Math.round(Number(p.experience_years))
  if (years != null && !(years >= 0 && years <= 70)) errors.push('experience')
  if (p.enabled && missing(p).length) errors.push('incomplete')
  const row = {
    enabled: !!p.enabled,
    visibility: p.visibility === 'crew' ? 'crew' : 'companies',
    headline: (p.headline || '').trim().slice(0, MAX.headline) || null,
    functions: [...new Set((p.functions || []).filter(f => FUNCTIONS.includes(f)))].slice(0, MAX.functions),
    other_functions: (p.other_functions || '').trim().slice(0, MAX.other) || null,
    bio: (p.bio || '').trim().slice(0, MAX.bio) || null,
    base_place: p.base_place || null,
    base_country: p.base_country || null,
    base_lat: p.base_lat ?? null,
    base_lng: p.base_lng ?? null,
    ...fromTravelKey(travelKey(p)),
    languages: [...new Set((p.languages || []).filter(l => /^[a-z]{2,3}$/.test(l)))].slice(0, MAX.languages),
    experience_years: Number.isFinite(years) ? years : null,
    links: cleaned.filter(Boolean).slice(0, MAX.links),
    certificates: certificates.slice(0, MAX.certificates),
  }
  return { row, errors }
}

// An expired certificate (shown as such on the profile)
export const isExpired = (c, today = new Date().toISOString().slice(0, 10)) => !!c.expires_on && c.expires_on < today
