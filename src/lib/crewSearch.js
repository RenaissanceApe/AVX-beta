// Crew search (docs/CREW_NETWORK.md, N2): the page's filters → search_crew()'s arguments, and the
// database's refusals → the words people see.

export const RADII = [25, 50, 100, 250, 500]

export const EMPTY_FILTERS = { fn: '', text: '', language: '', certificate: '', place: null, km: 100, from: '', to: '', onlyFree: false }

export function searchArgs(orgId, f, offset = 0) {
  const from = f.from || null
  const to = f.to && f.from && f.to < f.from ? f.from : (f.to || null)
  return {
    p_org: orgId,
    p_functions: f.fn ? [f.fn] : [],
    p_text: f.text?.trim() || null,
    p_languages: f.language ? [f.language] : [],
    p_certificate: f.certificate?.trim() || null,
    p_lat: f.place?.lat ?? null,
    p_lng: f.place?.lng ?? null,
    p_km: f.place ? (Number(f.km) || 100) : null,
    p_country: f.place?.country ?? null,
    p_from: from,
    p_to: from ? (to || from) : null,
    p_only_free: !!(from && f.onlyFree),
    p_offset: offset,
  }
}

// A gig → the filters it suggests (its dates, and its venue to look up)
export function gigFilters(gig) {
  return { from: gig?.start_date || '', to: gig?.end_date || gig?.start_date || '' }
}

// search_crew / contact_crew errors → i18n keys
export function crewError(error) {
  const m = String(error?.message || '')
  if (/Search limit/i.test(m)) return 'crewSearch.err.searchLimit'
  if (/Contact limit/i.test(m)) return 'crewSearch.err.contactLimit'
  if (/Already asked/i.test(m)) return 'crewSearch.err.alreadyAsked'
  if (/Already on this gig/i.test(m)) return 'crewSearch.err.alreadyOn'
  if (/Nobody to invite/i.test(m)) return 'crewSearch.err.cantReach'
  if (/Only takes contact/i.test(m)) return 'trust.err.onlyKnown'
  if (error?.code === '42501' || /Not allowed/i.test(m)) return 'crewSearch.err.notAllowed'
  return null
}
