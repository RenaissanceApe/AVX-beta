// Place search results (Nominatim-style, from LocationIQ) → the places the crew profile offers
// (docs/CREW_NETWORK.md, N1): "Porto, Porto, Portugal" with the country code and coordinates
// rounded to about 1 km. Only towns: streets and buildings (any other class) are left out, and at
// most MAX_PLACES are kept.
// Plain functions, so the app's unit tests check them too (src/lib/crewProfile.test.js).

export type Place = { label: string, place: string, country: string, lat: number, lng: number }

const round2 = (n: number) => Math.round(n * 100) / 100
export const MAX_PLACES = 6
// A town, village or municipality; rows without a class (older answers) are kept
const isTown = (r: { class?: string, type?: string }) =>
  !r?.class || r.class === 'place' || (r.class === 'boundary' && r.type === 'administrative')

// deno-lint-ignore no-explicit-any
export function toPlaces(rows: any[]): Place[] {
  const seen = new Set<string>()
  const out: Place[] = []
  for (const r of Array.isArray(rows) ? rows : []) {
    if (out.length >= MAX_PLACES) break
    if (!isTown(r)) continue
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
