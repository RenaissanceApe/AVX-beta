// Nominatim search results → the places the crew profile offers (docs/CREW_NETWORK.md, N1):
// "Porto, Porto, Portugal" with the country code and coordinates rounded to about 1 km.
// Plain functions, so the app's unit tests check them too (src/lib/crewProfile.test.js).

export type Place = { label: string, place: string, country: string, lat: number, lng: number }

const round2 = (n: number) => Math.round(n * 100) / 100

// deno-lint-ignore no-explicit-any
export function toPlaces(rows: any[]): Place[] {
  const seen = new Set<string>()
  const out: Place[] = []
  for (const r of Array.isArray(rows) ? rows : []) {
    const a = r?.address ?? {}
    const name = a.city ?? a.town ?? a.village ?? a.municipality ?? a.hamlet ?? r?.name ?? ''
    const region = a.state ?? a.county ?? a.region ?? ''
    const p = {
      label: [name, region !== name ? region : '', a.country].filter(Boolean).join(', '),
      place: [name, a.country].filter(Boolean).join(', '),
      country: String(a.country_code ?? '').toUpperCase(),
      lat: round2(Number(r?.lat)),
      lng: round2(Number(r?.lon)),
    }
    if (!name || !/^[A-Z]{2}$/.test(p.country) || !Number.isFinite(p.lat) || !Number.isFinite(p.lng) || seen.has(p.label)) continue
    seen.add(p.label)
    out.push(p)
  }
  return out
}
