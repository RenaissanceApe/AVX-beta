// Fixture types from GDTF files on catalogue items, and the gig's MVR export (step 14,
// docs/FIELD_TOOLS.md "How MVR and GDTF work"). The parsing is in mvr.js; this file talks to
// Supabase. GDTF files are kept in the private "fixture-types" bucket at
// <org id>/<item id>/<file>.gdtf, so an MVR export can carry them.
import { supabase } from './supabase'
import { logger } from './logger'
import { barsOf } from './lightPlot'

export const BUCKET = 'fixture-types'
const safeName = s => String(s || 'fixture.gdtf').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120)

// Saves a parsed GDTF file on a catalogue item: the file, its modes and what it says about weight
// and power; with `useFigures`, the item's own weight and power become the file's.
export async function saveFixtureType({ orgId, itemId, gdtf, bytes, fileName, useFigures }) {
  const path = `${orgId}/${itemId}/${safeName(fileName)}`
  if (bytes) {
    const { error } = await supabase.storage.from(BUCKET).upload(path, new Blob([bytes], { type: 'application/octet-stream' }), { upsert: true })
    if (error) return { error }
  }
  const row = {
    org_id: orgId, item_id: itemId, manufacturer: (gdtf.manufacturer || '').slice(0, 80) || null,
    name: (gdtf.name || gdtf.shortName || fileName || 'GDTF').slice(0, 120), gdtf_id: (gdtf.gdtfId || '').slice(0, 64) || null,
    revision: (gdtf.revision || '').slice(0, 80) || null,
    modes: gdtf.modes.slice(0, 200).map(m => ({ name: m.name.slice(0, 40), footprint: m.footprint })),
    weight_kg: gdtf.weightKg, power_w: gdtf.powerW,
    ...(bytes ? { file_path: path, file_name: String(fileName).slice(0, 200) } : {}),
  }
  const { error } = await supabase.from('fixture_types').upsert(row, { onConflict: 'item_id' })
  if (error) return { error }
  if (useFigures && (gdtf.weightKg !== null || gdtf.powerW !== null)) {
    const patch = {}
    if (gdtf.weightKg !== null) patch.weight_kg = gdtf.weightKg
    if (gdtf.powerW !== null) patch.power_w = gdtf.powerW
    const { error: itemError } = await supabase.from('price_items').update(patch).eq('id', itemId)
    if (itemError) return { error: itemError }
  }
  return { error: null }
}

export async function fixtureTypesFor(itemIds) {
  const ids = [...new Set((itemIds || []).filter(Boolean))]
  if (!ids.length) return []
  const { data, error } = await supabase.from('fixture_types').select('item_id, name, manufacturer, gdtf_id, modes, file_path, file_name, weight_kg, power_w').in('item_id', ids)
  if (error) logger.warn('fixture-types', error, { step: 'load' })
  return data || []
}

export async function orgFixtureTypes(orgId) {
  const { data, error } = await supabase.from('fixture_types').select('item_id, name, manufacturer, gdtf_id, modes').eq('org_id', orgId)
  if (error) logger.warn('fixture-types', error, { step: 'org' })
  return data || []
}

const FIELDS = 'id, name, fixture_type, mode, footprint, universe, address, position, item_id, plot_x, plot_y, mvr_uuid, gdtf_spec, fixture_no, height_m'

// The gig's light plot and DMX patch as an .mvr file, downloaded. GDTF files stored on the
// fixtures' catalogue items go inside it (when the person may read the catalogue).
export async function exportMvr(gig) {
  const [show, fx] = await Promise.all([
    supabase.from('gig_show').select('stage, lighting').eq('gig_id', gig.id).maybeSingle(),
    supabase.from('gig_fixtures').select(FIELDS).eq('gig_id', gig.id).order('universe').order('address'),
  ])
  if (fx.error) return { error: fx.error }
  const fixtures = fx.data || []
  const types = await fixtureTypesFor(fixtures.map(f => f.item_id))
  const gdtfFiles = {}, specs = {}
  for (const ft of types) {
    if (!ft.file_path || !ft.file_name) continue
    const { data, error } = await supabase.storage.from(BUCKET).download(ft.file_path)
    if (error) { logger.warn('mvr', error, { step: 'gdtf-download' }); continue }
    gdtfFiles[ft.file_name] = new Uint8Array(await data.arrayBuffer())
    specs[ft.item_id] = ft.file_name
  }
  const { buildMvr } = await import('./mvr')
  const { bytes, count } = buildMvr({ fixtures, bars: barsOf(show.data?.lighting), stage: show.data?.stage, gdtfFiles, specs, name: gig.name || 'AVX' })
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${String(gig.name || 'light-plot').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'light-plot'}.mvr`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return { error: null, count }
}
