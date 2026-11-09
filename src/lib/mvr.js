// MVR and GDTF (docs/FIELD_TOOLS.md, "How MVR and GDTF work"; step 14). Read in the browser.
// MVR (DIN SPEC 15801) is a zip with GeneralSceneDescription.xml (the scene: layers, fixtures,
// positions) and the GDTF files of the fixture types used. GDTF (DIN SPEC 15800) is a zip with
// description.xml (the fixture type: modes, DMX channels, weight, power).
//
// What the programs we were asked about write differently, and how it is handled here:
// - Vectorworks: hanging positions as AUXData <Position>, referenced from each fixture; the
//   GDTFSpec sometimes without ".gdtf"; fixture numbers in FixtureID or only in UnitNumber.
// - grandMA3: fixtures grouped in GroupObjects (the group's name is used as the position when
//   there is no Position); parts of a multi-instance fixture as Fixtures inside a Fixture (only
//   those with their own DMX address count); addresses as absolute numbers (513 = universe 2.1).
// - Capture: fixtures as children of the Truss they hang on (the truss's name is the position);
//   transforms on layers, groups and trusses (all multiplied through).
// - Addresses: absolute numbers or "universe.address"; the first DMX break is used.
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate'
import { stageSize, round2 } from './stagePlot'
import { UNIVERSE_SIZE } from './dmx'
import { layoutFixtures } from './lightPlot'

// ── A small XML reader and writer ─────────────────────────────────────────────
const decode = s => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&amp;/g, '&')
export const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// '<a x="1"><b/>hi</a>' → { name: 'a', attrs: { x: '1' }, children: [{ name: 'b', … }], text: 'hi' }
export function parseXml(xml) {
  const root = { name: '#root', attrs: {}, children: [], text: '' }
  const stack = [root]
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/\s*([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g
  let m
  while ((m = re.exec(String(xml || ''))) !== null) {
    const top = stack[stack.length - 1]
    if (m[1] !== undefined) top.text += m[1]
    else if (m[2]) { if (stack.length > 1) stack.pop() }
    else if (m[3]) {
      const attrs = {}
      for (const a of (m[4] || '').matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = decode(a[2] ?? a[3] ?? '')
      const el = { name: m[3].replace(/^[^:]+:/, ''), attrs, children: [], text: '' }
      top.children.push(el)
      if (!m[5]) stack.push(el)
    } else if (m[6] !== undefined) top.text += decode(m[6])
  }
  return root.children[0] || null
}
const kids = (el, name) => (el?.children || []).filter(c => !name || c.name === name)
const kid = (el, name) => kids(el, name)[0] || null
const textOf = (el, name) => (kid(el, name)?.text || '').trim()
// Every element called `name` below el, at any depth
function findAll(el, name, out = []) {
  for (const c of el?.children || []) { if (c.name === name) out.push(c); findAll(c, name, out) }
  return out
}
// The file in a zip, whatever case or folder it was written with
function zipFile(files, name) {
  const key = Object.keys(files).find(k => k.toLowerCase() === name.toLowerCase())
    || Object.keys(files).find(k => k.toLowerCase().endsWith(`/${name.toLowerCase()}`))
  return key ? files[key] : null
}
const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

// ── GDTF ─────────────────────────────────────────────────────────────────────
// How many DMX channels a mode takes: the highest channel offset in its first DMX break,
// counting each instance of a geometry reference (pixel fixtures) at its own offset
function modeFootprint(mode, geometryRoots) {
  const refs = {}
  const root = geometryRoots.find(g => g.attrs.Name === mode.attrs.Geometry) || null
  for (const r of findAll(root, 'GeometryReference')) (refs[r.attrs.Geometry] ||= []).push(r)
  let max = 0
  for (const ch of findAll(kid(mode, 'DMXChannels'), 'DMXChannel')) {
    const offsets = String(ch.attrs.Offset || '').split(',').map(Number).filter(n => Number.isFinite(n) && n > 0)
    if (!offsets.length) continue
    const brk = ch.attrs.DMXBreak === 'Overwrite' ? 1 : Number(ch.attrs.DMXBreak || 1)
    const instances = refs[ch.attrs.Geometry]
    if (instances?.length) {
      for (const r of instances) {
        const b = kids(r, 'Break').find(x => Number(x.attrs.DMXBreak || 1) === brk) || kids(r, 'Break')[0]
        if (Number(b?.attrs.DMXBreak || 1) !== 1) continue
        const shift = Number(b?.attrs.DMXOffset || 1) - 1
        max = Math.max(max, ...offsets.map(o => o + shift))
      }
    } else if (brk === 1) max = Math.max(max, ...offsets)
  }
  return max > 0 ? Math.min(max, UNIVERSE_SIZE) : null
}

// description.xml (text), or the .gdtf file (bytes) → the fixture type
export function parseGdtf(input) {
  let xml = input
  if (input instanceof Uint8Array) {
    const files = unzipSync(input, { filter: f => /description\.xml$/i.test(f.name) })
    const desc = zipFile(files, 'description.xml')
    if (!desc) throw new Error('gdtf: no description.xml')
    xml = strFromU8(desc)
  }
  const doc = parseXml(xml)
  const ft = doc?.name === 'FixtureType' ? doc : kid(doc, 'FixtureType')
  if (!ft) throw new Error('gdtf: no FixtureType')
  const geometryRoots = kids(kid(ft, 'Geometries'))
  const modes = kids(kid(ft, 'DMXModes'), 'DMXMode').map(m => ({ name: m.attrs.Name || '', footprint: modeFootprint(m, geometryRoots) })).filter(m => m.name)
  const props = kid(kid(ft, 'PhysicalDescriptions'), 'Properties')
  const power = findAll(props, 'PowerConsumption').map(p => num(p.attrs.Value)).filter(v => v !== null)
  const revisions = kids(kid(ft, 'Revisions'), 'Revision')
  return {
    manufacturer: ft.attrs.Manufacturer || '',
    name: ft.attrs.LongName || ft.attrs.Name || '',
    shortName: ft.attrs.Name || '',
    gdtfId: ft.attrs.FixtureTypeID || '',
    revision: revisions.length ? (revisions[revisions.length - 1].attrs.Text || '') : '',
    modes,
    weightKg: num(kid(props, 'Weight')?.attrs.Value),
    powerW: power.length ? Math.round(power.reduce((s, v) => s + v, 0)) : null,
  }
}

// "Robe Lighting@Robin 600 LEDWash@v2.gdtf" → "Robe Lighting Robin 600 LEDWash"
export function typeFromSpec(spec) {
  const parts = String(spec || '').replace(/\.gdtf$/i, '').split('@').map(s => s.trim()).filter(Boolean)
  return (parts.length >= 2 ? `${parts[0]} ${parts[1]}` : parts[0] || '').slice(0, 80)
}
export const typeName = gdtf => [gdtf.manufacturer, gdtf.shortName || gdtf.name].filter(Boolean).join(' ').slice(0, 80)
const specKey = s => String(s || '').trim().toLowerCase().replace(/\.gdtf$/, '')

// ── Matrices ─────────────────────────────────────────────────────────────────
// "{ux,uy,uz}{vx,vy,vz}{wx,wy,wz}{ox,oy,oz}" (offset in mm); a point p goes to
// p.x·u + p.y·v + p.z·w + o
const IDENTITY = { u: [1, 0, 0], v: [0, 1, 0], w: [0, 0, 1], o: [0, 0, 0] }
export function parseMatrix(text) {
  const groups = [...String(text || '').matchAll(/\{([^}]*)\}/g)].map(g => g[1].split(',').map(Number))
  if (groups.length !== 4 || groups.some(g => g.length !== 3 || g.some(n => !Number.isFinite(n)))) return IDENTITY
  return { u: groups[0], v: groups[1], w: groups[2], o: groups[3] }
}
const apply = (m, p) => [0, 1, 2].map(i => p[0] * m.u[i] + p[1] * m.v[i] + p[2] * m.w[i])
// The child's transform seen from the parent's parent
const compose = (parent, child) => ({
  u: apply(parent, child.u), v: apply(parent, child.v), w: apply(parent, child.w),
  o: apply(parent, child.o).map((n, i) => n + parent.o[i]),
})

// ── DMX addresses ────────────────────────────────────────────────────────────
// 513 → { universe: 2, address: 1 }; "2.1" → the same; nothing usable → null
export function readAddress(value) {
  const s = String(value ?? '').trim()
  let universe, address
  const dotted = s.match(/^(\d+)\.(\d+)$/)
  if (dotted) { universe = Number(dotted[1]); address = Number(dotted[2]) }
  else if (/^\d+$/.test(s) && Number(s) > 0) { universe = Math.floor((Number(s) - 1) / UNIVERSE_SIZE) + 1; address = ((Number(s) - 1) % UNIVERSE_SIZE) + 1 }
  else return null
  if (universe < 1 || universe > 256 || address < 1 || address > UNIVERSE_SIZE) return null
  return { universe, address }
}
export const absoluteAddress = (universe, address) => (universe - 1) * UNIVERSE_SIZE + address

// ── MVR import ───────────────────────────────────────────────────────────────
const CONTAINERS = new Set(['GroupObject', 'Truss', 'SceneObject', 'Support', 'Fixture', 'VideoScreen', 'Projector'])

// The bytes of an .mvr file → { provider, fixtures, gdtf: { [spec key]: fixture type }, gdtfFiles }
// Each fixture: uuid, name, fixtureNo, gdtfSpec, mode, universe, address, x/y/z (metres,
// world), position (name or null).
export function parseMvr(bytes) {
  const files = unzipSync(bytes)
  const scene = zipFile(files, 'GeneralSceneDescription.xml')
  if (!scene) throw new Error('mvr: no GeneralSceneDescription.xml')
  const doc = parseXml(strFromU8(scene))
  if (doc?.name !== 'GeneralSceneDescription') throw new Error('mvr: not a scene description')
  const sceneEl = kid(doc, 'Scene')
  const positions = new Map(findAll(kid(sceneEl, 'AUXData'), 'Position').map(p => [String(p.attrs.uuid || '').toLowerCase(), p.attrs.name || '']))

  // GDTF files carried in the MVR
  const gdtf = {}
  const gdtfFiles = {}
  for (const [name, data] of Object.entries(files)) {
    if (!/\.gdtf$/i.test(name)) continue
    const base = name.split('/').pop()
    gdtfFiles[base] = data
    try { gdtf[specKey(base)] = parseGdtf(data) } catch { /* a fixture type we can't read: the fixtures still come in */ }
  }
  // AVX's own notes (footprint and type) from an earlier export, for fixtures without a GDTF file
  const ours = new Map()
  for (const d of kids(kid(doc, 'UserData'), 'Data')) {
    if (d.attrs.provider !== 'AVX') continue
    for (const f of kids(d, 'Fixture')) ours.set(String(f.attrs.uuid || '').toLowerCase(), f.attrs)
  }

  const fixtures = []
  const walk = (el, matrix, container, insideFixture) => {
    for (const child of kids(kid(el, 'ChildList'))) {
      const m = compose(matrix, parseMatrix(textOf(child, 'Matrix')))
      if (child.name === 'Fixture') {
        const addr = kids(kid(child, 'Addresses'), 'Address').sort((a, b) => Number(a.attrs.break || 0) - Number(b.attrs.break || 0))[0]
        const at = addr ? readAddress(addr.text) : null
        if (!insideFixture || at) {
          const uuid = String(child.attrs.uuid || '').toLowerCase()
          const spec = textOf(child, 'GDTFSpec')
          const mode = textOf(child, 'GDTFMode')
          const type = gdtf[specKey(spec)]
          const note = ours.get(uuid)
          const fromType = type?.modes.find(x => x.name.toLowerCase() === mode.toLowerCase()) || (type?.modes.length === 1 ? type.modes[0] : null)
          const fixtureNo = num(textOf(child, 'FixtureID')) || num(textOf(child, 'UnitNumber'))
          const typeLabel = (note?.type || (type ? typeName(type) : '') || typeFromSpec(spec) || '').slice(0, 80)
          fixtures.push({
            uuid: /^[0-9a-f-]{36}$/.test(uuid) ? uuid : null,
            name: (child.attrs.name || '').trim() || [typeLabel, fixtureNo].filter(Boolean).join(' ') || 'Fixture',
            fixtureNo: fixtureNo && fixtureNo >= 1 && fixtureNo <= 99999 ? Math.round(fixtureNo) : null,
            gdtfSpec: spec,
            type: typeLabel,
            mode,
            footprint: fromType?.footprint || num(note?.footprint) || null,
            universe: at?.universe || 1,
            address: at?.address || null,
            x: round2(m.o[0] / 1000), y: round2(m.o[1] / 1000), z: round2(m.o[2] / 1000),
            position: positions.get(textOf(child, 'Position').toLowerCase()) || container || null,
          })
        }
        walk(child, m, container, true)
      } else if (CONTAINERS.has(child.name)) {
        walk(child, m, (child.attrs.name || '').trim() || container, insideFixture)
      }
    }
  }
  for (const layer of kids(kid(sceneEl, 'Layers'), 'Layer')) walk(layer, parseMatrix(textOf(layer, 'Matrix')), null, false)
  return { provider: doc.attrs.provider || '', fixtures, gdtf, gdtfFiles }
}

// The GDTF file a fixture's GDTFSpec names, from those carried in the MVR: { name, bytes } or null
export function gdtfFileFor(parsed, spec) {
  const name = Object.keys(parsed.gdtfFiles || {}).find(n => specKey(n) === specKey(spec))
  return name ? { name, bytes: parsed.gdtfFiles[name] } : null
}

// ── From MVR to the gig ──────────────────────────────────────────────────────
// MVR's origin is taken as the middle of the stage's front edge (the centre line on the setting
// line, as plans are usually drawn), y towards the back of the stage, z up. The light plot
// measures x from the left edge of the stage.
const PLOT_LIMITS = { x: [-20, 60], y: [-20, 50] }
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
export function toPlot(f, stage) {
  const { width_m } = stageSize(stage)
  return {
    plot_x: round2(clamp(f.x + width_m / 2, ...PLOT_LIMITS.x)),
    plot_y: round2(clamp(f.y, ...PLOT_LIMITS.y)),
    height_m: round2(clamp(f.z, -10, 50)),
  }
}
export function fromPlot(x, y, z, stage) {
  const { width_m } = stageSize(stage)
  return [round2(x - width_m / 2), round2(y), round2(z || 0)]
}

// The kind of fixture (one row per type in the file) for matching to catalogue items
export const typeKey = f => (f.gdtfSpec ? specKey(f.gdtfSpec) : `type:${String(f.type || f.name).toLowerCase()}`)
export function fixtureTypes(parsed) {
  const out = new Map()
  for (const f of parsed.fixtures) {
    const key = typeKey(f)
    const row = out.get(key) || { key, type: f.type || f.name, spec: f.gdtfSpec, gdtf: parsed.gdtf[specKey(f.gdtfSpec)] || null, modes: new Set(), count: 0, missingFootprint: 0 }
    row.count += 1
    if (f.mode) row.modes.add(f.mode)
    if (!f.footprint) row.missingFootprint += 1
    out.set(key, row)
  }
  return [...out.values()].map(r => ({ ...r, modes: [...r.modes] }))
}

const words = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
// The catalogue item each fixture type probably is: the item with the same GDTF fixture type,
// then the same name, then a name that contains the other. null when unsure.
export function suggestItem(type, catalogue, fixtureTypeRows = []) {
  const gdtfId = type.gdtf?.gdtfId
  if (gdtfId) {
    const hit = fixtureTypeRows.find(r => r.gdtf_id && r.gdtf_id.toLowerCase() === gdtfId.toLowerCase())
    if (hit && catalogue.some(i => i.id === hit.item_id)) return hit.item_id
  }
  const want = [type.type, type.gdtf?.name, type.gdtf?.shortName].map(words).filter(Boolean)
  for (const w of want) {
    const same = catalogue.filter(i => words(i.name) === w)
    if (same.length === 1) return same[0].id
  }
  for (const w of want) {
    const near = catalogue.filter(i => { const n = words(i.name); return n.length > 3 && (w.includes(n) || n.includes(w)) })
    if (near.length === 1) return near[0].id
  }
  return null
}

// The footprint of a fixture whose file didn't say: the matched item's fixture type (same mode
// name, or its only mode), then what the person typed for the type
export function footprintFor(f, typeRow, choice) {
  if (f.footprint) return f.footprint
  const modes = typeRow?.modes || []
  const hit = modes.find(m => m.name.toLowerCase() === String(f.mode || '').toLowerCase()) || (modes.length === 1 ? modes[0] : null)
  return hit?.footprint || num(choice?.footprint) || null
}

// What importing does: rows to add, rows to update (same MVR id already in the gig), positions
// to add to the light plot, and how many fixtures came without an address or that didn't fit.
// choices: { [type key]: { item_id, footprint } }; fixtureTypeRows: fixture_types by item.
export function planImport(parsed, { existing = [], bars = [], stage, choices = {}, fixtureTypeRows = [], limit = 1000 } = {}) {
  const byUuid = new Map(existing.filter(f => f.mvr_uuid).map(f => [String(f.mvr_uuid).toLowerCase(), f]))
  const typeRows = new Map(fixtureTypeRows.map(r => [r.item_id, r]))
  const inserts = [], updates = []
  let unaddressed = 0, tooMany = 0, noFootprint = 0
  let room = limit - existing.length
  for (const f of parsed.fixtures) {
    const choice = choices[typeKey(f)] || {}
    const item_id = choice.item_id || null
    const footprint = footprintFor(f, typeRows.get(item_id), choice)
    if (!footprint) { noFootprint += 1; continue }
    let address = f.address
    if (address && address + footprint - 1 > UNIVERSE_SIZE) address = null
    if (!address) unaddressed += 1
    const row = {
      name: f.name.slice(0, 60), fixture_type: (f.type || f.name).slice(0, 80), mode: f.mode ? f.mode.slice(0, 40) : null,
      footprint, universe: f.universe, address, position: f.position ? f.position.slice(0, 60) : null, item_id,
      mvr_uuid: f.uuid, gdtf_spec: f.gdtfSpec ? f.gdtfSpec.slice(0, 120) : null, fixture_no: f.fixtureNo,
      ...toPlot(f, stage),
    }
    const old = f.uuid ? byUuid.get(f.uuid) : null
    if (old) updates.push({ id: old.id, ...row, item_id: item_id || old.item_id || null })
    else if (room > 0) { inserts.push(row); room -= 1 }
    else tooMany += 1
  }
  return { inserts, updates, newBars: barsFor([...inserts, ...updates], bars, stage), unaddressed, tooMany, noFootprint }
}

// A position on the light plot for each position name the file brings that the plot hasn't
// got: along the fixtures on it (across or up-and-down, whichever they spread along), at their
// average height; below 0.5 m it's a floor position
export function barsFor(rows, bars, stage) {
  const taken = new Set((bars || []).map(b => b.name.toLowerCase()))
  const groups = new Map()
  for (const r of rows) {
    if (!r.position || taken.has(r.position.toLowerCase())) continue
    const k = r.position.toLowerCase()
    if (!groups.has(k)) groups.set(k, { name: r.position, list: [] })
    groups.get(k).list.push(r)
  }
  const { width_m } = stageSize(stage)
  let n = 0
  return [...groups.values()].map(({ name, list }) => {
    const xs = list.map(r => r.plot_x), ys = list.map(r => r.plot_y), zs = list.map(r => r.height_m || 0)
    const spanX = Math.max(...xs) - Math.min(...xs), spanY = Math.max(...ys) - Math.min(...ys)
    const across = spanX >= spanY
    const height = round2(zs.reduce((s, z) => s + z, 0) / zs.length)
    const length = clamp(round2((across ? spanX : spanY) + 1), across && list.length === 1 ? Math.min(width_m, 2) : 0.5, 40)
    n += 1
    return {
      id: `mvr${n}${Date.now().toString(36)}`, name: name.slice(0, 40), kind: height < 0.5 ? 'floor' : 'truss',
      x: round2(across ? (Math.max(...xs) + Math.min(...xs)) / 2 : xs.reduce((s, x) => s + x, 0) / xs.length),
      y: round2(across ? ys.reduce((s, y) => s + y, 0) / ys.length : (Math.max(...ys) + Math.min(...ys)) / 2),
      length, rotation: across ? 0 : 90, height: clamp(height, 0, 30), phase: null,
    }
  })
}

// ── MVR export ───────────────────────────────────────────────────────────────
// A stable UUID made from a text (for positions, which have no UUID of their own)
export function uuidFrom(text) {
  let h1 = 0x811c9dc5, h2 = 0x01000193, h3 = 0x9e3779b9, h4 = 0x85ebca6b
  for (const ch of String(text)) {
    const c = ch.codePointAt(0)
    h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822519); h3 = Math.imul(h3 ^ c, 3266489917); h4 = Math.imul(h4 ^ c, 668265263)
  }
  const hex = [h1, h2, h3, h4].map(h => (h >>> 0).toString(16).padStart(8, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`.toUpperCase()
}
const fmtMatrix = (x, y, z) => `{1,0,0}{0,1,0}{0,0,1}{${Math.round(x * 1000)},${Math.round(y * 1000)},${Math.round(z * 1000)}}`
const safeFile = s => String(s || 'fixture').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 100) || 'fixture'

// The gig's fixtures and positions → the bytes of an .mvr file. gdtfFiles: { [file name]: bytes }
// for fixture types with a stored GDTF file; specs: { [item id]: file name } for those items.
export function buildMvr({ fixtures = [], bars = [], stage, gdtfFiles = {}, specs = {}, name = 'AVX', version = '' } = {}) {
  const layout = layoutFixtures(bars, fixtures)
  const barByName = new Map(bars.map(b => [b.name.toLowerCase(), b]))
  const placed = fixtures.filter(f => f.position || layout[f.id])
  const usedBars = new Set()
  const fixtureXml = fixtures.map((f, i) => {
    const at = layout[f.id] || { x: 0, y: 0 }
    const bar = f.position ? barByName.get(String(f.position).toLowerCase()) : null
    if (bar) usedBars.add(bar)
    const z = f.height_m ?? bar?.height ?? 0
    const [x, y, zz] = fromPlot(at.x, at.y, Number(z), stage)
    const spec = f.gdtf_spec || specs[f.item_id] || `${safeFile(f.fixture_type)}.gdtf`
    const uuid = String(f.mvr_uuid || f.id || uuidFrom(`${f.name}${i}`)).toUpperCase()
    return [
      `<Fixture name="${esc(f.name)}" uuid="${esc(uuid)}">`,
      `<Matrix>${fmtMatrix(x, y, zz)}</Matrix>`,
      `<GDTFSpec>${esc(spec)}</GDTFSpec>`,
      `<GDTFMode>${esc(f.mode || '')}</GDTFMode>`,
      bar ? `<Position>${uuidFrom(`position:${bar.id}`)}</Position>` : '',
      `<FixtureID>${esc(f.fixture_no ?? i + 1)}</FixtureID>`,
      `<UnitNumber>${esc(f.fixture_no ?? i + 1)}</UnitNumber>`,
      f.address ? `<Addresses><Address break="0">${absoluteAddress(f.universe, f.address)}</Address></Addresses>` : '<Addresses/>',
      '</Fixture>',
    ].join('')
  })
  const ours = fixtures.map((f, i) => `<Fixture uuid="${esc(String(f.mvr_uuid || f.id || uuidFrom(`${f.name}${i}`)).toUpperCase())}" type="${esc(f.fixture_type)}" footprint="${f.footprint}"/>`)
  const xml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
    `<GeneralSceneDescription verMajor="1" verMinor="6" provider="AVX" providerVersion="${esc(version)}">`,
    `<UserData><Data provider="AVX" ver="1">${ours.join('')}</Data></UserData>`,
    '<Scene>',
    `<AUXData>${[...usedBars].map(b => `<Position name="${esc(b.name)}" uuid="${uuidFrom(`position:${b.id}`)}"/>`).join('')}</AUXData>`,
    `<Layers><Layer name="${esc(name)}" uuid="${uuidFrom(`layer:${name}`)}"><ChildList>${fixtureXml.join('')}</ChildList></Layer></Layers>`,
    '</Scene>',
    '</GeneralSceneDescription>',
  ].join('\n')
  const zip = { 'GeneralSceneDescription.xml': strToU8(xml) }
  for (const [file, data] of Object.entries(gdtfFiles)) zip[file] = data
  return { bytes: zipSync(zip, { level: 6 }), count: fixtures.length, placed: placed.length }
}
