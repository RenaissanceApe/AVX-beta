// The speaker library (docs/TOOLS_PLAN.md §6, A1): speaker specs and the manufacturer's rigging
// data on catalogue items, the presets typed from manufacturers' datasheets, and what the sound
// system calculator (F4) takes from them. Later P1 (power) reads weight_kg / power_w and RG3
// (line arrays) reads rigging.
// Rule: values come only from the manufacturer's datasheet, never derived. A preset leaves out
// what its datasheet doesn't give.
import { PRESETS } from '../data/speakers'

export const SPEAKER_TYPES = ['point_source', 'line_array', 'subwoofer', 'monitor', 'column']

// The numeric specs, with the limits the database also checks (price_items_speaker_check)
export const SPEC_FIELDS = [
  { key: 'sensitivity_db', min: 60, max: 130, unit: 'dB' },
  { key: 'max_spl_db', min: 60, max: 160, unit: 'dB' },
  { key: 'dispersion_h', min: 0, max: 360, unit: '°', open: true },
  { key: 'dispersion_v', min: 0, max: 360, unit: '°', open: true },
  { key: 'freq_low_hz', min: 1, max: 20000, unit: 'Hz' },
  { key: 'freq_high_hz', min: 20, max: 100000, unit: 'Hz' },
  { key: 'impedance_ohm', min: 0, max: 100, unit: 'Ω', open: true },
  { key: 'amp_channels', min: 1, max: 16, unit: '', whole: true },
]
export const RIGGING_FIELDS = ['cog', 'pickup_points', 'frame_limits', 'source']
const RIGGING_MAX = 900 // characters per rigging text (the whole object must stay under 4 KB)
const SOURCE_MAX = 500

const toNum = v => {
  if (v === null || v === undefined || String(v).trim() === '') return null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

// Is a value inside a field's limits? (open: the lower limit itself isn't allowed, e.g. 0°)
export function inRange(field, n) {
  if (n === null) return true
  if (!Number.isFinite(n)) return false
  if (field.whole && !Number.isInteger(n)) return false
  return (field.open ? n > field.min : n >= field.min) && n <= field.max
}

// What's wrong with a set of specs, as { field: i18n key under spk.err.* }
export function specProblems(specs) {
  const out = {}
  for (const f of SPEC_FIELDS) if (!inRange(f, toNum(specs?.[f.key]))) out[f.key] = 'range'
  const lo = toNum(specs?.freq_low_hz), hi = toNum(specs?.freq_high_hz)
  if (!out.freq_low_hz && !out.freq_high_hz && lo !== null && hi !== null && lo >= hi) out.freq_high_hz = 'order'
  if (specs?.speaker_type && !SPEAKER_TYPES.includes(specs.speaker_type)) out.speaker_type = 'range'
  return out
}

// The rigging data kept on an item: the texts as printed, the source, and whether a second person
// has checked it (A1 never marks it checked: that sign-off is RG3's)
export function riggingOf(rigging) {
  if (!rigging || typeof rigging !== 'object' || Array.isArray(rigging)) return null
  const out = {}
  for (const k of RIGGING_FIELDS) {
    const v = String(rigging[k] ?? '').trim().slice(0, RIGGING_MAX)
    if (v) out[k] = v
  }
  if (!out.cog && !out.pickup_points && !out.frame_limits) return null
  out.checked = rigging.checked === true
  return out
}

// The item form's speaker part: from an item, and back to the columns to save
export function specsForm(item) {
  const form = { speaker_type: item?.speaker_type || '', speaker_preset: item?.speaker_preset || '', spec_source: item?.spec_source || '' }
  for (const f of SPEC_FIELDS) form[f.key] = item?.[f.key] ?? ''
  const rig = riggingOf(item?.rigging)
  for (const k of RIGGING_FIELDS) form[`rig_${k}`] = rig?.[k] || ''
  return form
}
export function specsRow(form) {
  const row = { speaker_type: form.speaker_type || null, speaker_preset: form.speaker_preset || null, spec_source: String(form.spec_source || '').trim().slice(0, SOURCE_MAX) || null }
  for (const f of SPEC_FIELDS) {
    const n = toNum(form[f.key])
    row[f.key] = n === null || !inRange(f, n) ? null : n
  }
  row.rigging = riggingOf(Object.fromEntries(RIGGING_FIELDS.map(k => [k, form[`rig_${k}`]])))
  return row
}
export const hasSpecs = item => Boolean(item?.speaker_type || SPEC_FIELDS.some(f => item?.[f.key] != null))

// ── Presets ──────────────────────────────────────────────────────────────────
export const normaliseName = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '')
export const presetById = id => PRESETS.find(p => p.id === id) || null
// A preset by its id or its brand and model, as people write them ("L-Acoustics K2", "d&b V8")
export function findPreset(text, presets = PRESETS) {
  const n = normaliseName(text)
  if (!n) return null
  return presets.find(p => p.id === String(text).trim().toLowerCase())
    || presets.find(p => normaliseName(`${p.brand} ${p.model}`) === n)
    || presets.find(p => normaliseName(p.model) === n && presets.filter(q => normaliseName(q.model) === n).length === 1)
    || null
}
export const presetSource = p => [p.source.document, p.source.version, p.source.url].filter(Boolean).join(' · ').slice(0, SOURCE_MAX)
export const presetLabel = p => `${p.brand} ${p.model}`

// What applying a preset writes on an item: every value its datasheet gives (nothing else), the
// kind, the source and, if it has some, the rigging data (not checked)
export function presetPatch(p) {
  const patch = { speaker_type: p.type, speaker_preset: p.id, spec_source: presetSource(p) }
  for (const f of SPEC_FIELDS) if (p.values[f.key] != null) patch[f.key] = p.values[f.key]
  if (p.values.weight_kg != null) patch.weight_kg = p.values.weight_kg
  if (p.values.power_w != null) patch.power_w = p.values.power_w
  if (p.rigging) patch.rigging = riggingOf({ ...p.rigging, source: p.rigging.source || presetSource(p), checked: false })
  return patch
}

// The import: a row naming a preset gets the preset's values in the cells the file left empty
export function fillFromPreset(row, p) {
  const out = { ...row }
  for (const [k, v] of Object.entries(presetPatch(p))) if (out[k] === undefined || out[k] === null || out[k] === '') out[k] = v
  return out
}

// ── The sound system calculator (F4) ─────────────────────────────────────────
// What a source takes from a catalogue speaker: the maximum SPL at 1 m and the horizontal
// dispersion, when the item has them. The calculator's limits still apply (60–160 dB, 1–180°).
export function sourceSpecs(item) {
  if (!item) return null
  const out = { item_id: item.id, item_name: String(item.name || '').slice(0, 60) }
  if (item.max_spl_db != null) out.spl = Math.min(160, Math.max(60, Number(item.max_spl_db)))
  if (item.dispersion_h != null) out.angle = Math.min(180, Math.max(1, Number(item.dispersion_h)))
  return out
}
// Has the catalogue changed since the source copied its specs?
export function specsChanged(source, item) {
  const s = sourceSpecs(item)
  if (!s) return false
  return (s.spl !== undefined && s.spl !== source.spl) || (s.angle !== undefined && s.angle !== source.angle)
}
// Which kind of calculator source a speaker type suggests
export const sourceKindFor = type => (type === 'subwoofer' ? 'sub' : null)

// The item page's lines for a speaker: [label, text], only what's filled in
export function speakerFacts(item, t) {
  if (!hasSpecs(item)) return []
  const n = v => (v == null ? null : Number(v))
  const range = (a, b, unit) => (a == null && b == null ? '' : `${a ?? '?'}–${b ?? '?'} ${unit}`)
  const deg = v => (v == null ? '—' : `${n(v)}°`)
  const hv = item.dispersion_h != null || item.dispersion_v != null ? `${deg(item.dispersion_h)} × ${deg(item.dispersion_v)}` : ''
  return [
    [t('spk.type'), item.speaker_type ? t(`spk.typeOpt.${item.speaker_type}`) : ''],
    [t('spk.field.sensitivity_db'), item.sensitivity_db != null ? `${n(item.sensitivity_db)} dB` : ''],
    [t('spk.field.max_spl_db'), item.max_spl_db != null ? `${n(item.max_spl_db)} dB` : ''],
    [t('spk.dispersion'), hv],
    [t('spk.freq'), range(n(item.freq_low_hz), n(item.freq_high_hz), 'Hz')],
    [t('spk.field.impedance_ohm'), item.impedance_ohm != null ? `${n(item.impedance_ohm)} Ω` : ''],
    [t('spk.field.amp_channels'), item.amp_channels ?? ''],
    [t('spk.source'), item.spec_source || ''],
  ].filter(([, v]) => v !== '' && v != null)
}
