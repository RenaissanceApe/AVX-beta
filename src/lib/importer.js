// The import wizard (docs/SWITCHING.md, S1): reading a spreadsheet export, matching its columns
// to AVX's fields, cleaning the values and predicting what an import will do. The import itself
// runs in the database (run_import), which checks everything again.
import { parsePrice } from './quotes'

export const KINDS = ['locations', 'items', 'units', 'kits']
export const MAX_ROWS = 5000
const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/

// Words people (and Rentman, in Dutch or English) use for each choice
const WORDS = {
  locationKind: {
    warehouse: ['warehouse', 'magazijn', 'armazem', 'depot', 'store', 'storage', 'opslag', 'loja'],
    vehicle: ['vehicle', 'van', 'truck', 'lorry', 'bus', 'carrinha', 'camiao', 'viatura', 'voertuig', 'bestelbus', 'vrachtwagen'],
    site: ['site', 'venue', 'local', 'locatie', 'sala', 'recinto'],
    other: ['other', 'overig', 'outro', 'anders'],
  },
  itemKind: {
    rental: ['rental', 'rent', 'hire', 'verhuur', 'huur', 'aluguer', 'aluguel', 'equipment'],
    sale: ['sale', 'sell', 'verkoop', 'venda', 'consumable', 'verbruik', 'consumivel'],
    crew: ['crew', 'personeel', 'staff', 'equipa', 'pessoal', 'labour', 'labor'],
    transport: ['transport', 'vervoer', 'transporte', 'vehicle'],
    other: ['other', 'overig', 'outro'],
  },
  unit: {
    unit: ['unit', 'piece', 'pc', 'pcs', 'each', 'stuk', 'stuks', 'unidade', 'un'],
    day: ['day', 'days', 'dag', 'dagen', 'dia', 'dias', 'per day'],
    hour: ['hour', 'hours', 'uur', 'hora', 'horas', 'per hour'],
    km: ['km', 'kilometer', 'kilometre', 'quilometro'],
    set: ['set', 'conjunto', 'kit'],
    lump: ['lump', 'lump sum', 'fixed', 'vast', 'fixo', 'forfait'],
  },
  tracking: {
    none: ['none', 'no', 'nee', 'nao', 'not tracked', 'geen'],
    bulk: ['bulk', 'quantity', 'count', 'counted', 'aantal', 'quantidade', 'ja', 'yes', 'sim'],
    serial: ['serial', 'serials', 'serial numbers', 'serienummer', 'serienummers', 'serie', 'numero de serie', 'individual', 'unit'],
  },
  partKind: {
    content: ['content', 'contents', 'inhoud', 'conteudo', 'in case', 'in set', 'packed', 'case content', 'set content'],
    accessory: ['accessory', 'accessories', 'accessoire', 'accessoires', 'toebehoren', 'acessorio', 'acessorios', 'extra', 'with'],
  },
  kitType: {
    set: ['set', 'conjunto', 'kit', 'package', 'pakket', 'pacote'],
    case: ['case', 'flightcase', 'flight case', 'koffer', 'kist', 'caixa', 'mala', 'rack'],
  },
  unitStatus: {
    available: ['available', 'beschikbaar', 'disponivel', 'ok', 'in stock', 'active', 'actief', 'ativo'],
    repair: ['repair', 'in repair', 'reparatie', 'defect', 'defective', 'broken', 'reparacao', 'avariado'],
    lost: ['lost', 'missing', 'kwijt', 'vermist', 'perdido', 'desaparecido'],
    retired: ['retired', 'sold', 'written off', 'afgeschreven', 'verkocht', 'abatido', 'vendido', 'inactive', 'inactief'],
  },
}

// Each kind's fields: key, type, whether it's required, and the column names it's guessed from
// (compared without capitals, accents or punctuation). Order matters: a column goes to the
// first field that claims it.
export const FIELDS = {
  locations: [
    { key: 'name', type: 'text', max: 100, required: true, names: ['name', 'naam', 'nome', 'location', 'location name', 'warehouse', 'locatie', 'local', 'armazem', 'magazijn'] },
    { key: 'kind', type: 'enum', words: 'locationKind', names: ['kind', 'type', 'soort', 'tipo'] },
    { key: 'address', type: 'text', max: 300, names: ['address', 'adres', 'morada', 'endereco', 'street', 'straat'] },
    { key: 'notes', type: 'text', max: 500, names: ['notes', 'note', 'remarks', 'opmerkingen', 'opmerking', 'notas', 'observacoes'] },
  ],
  items: [
    { key: 'name', type: 'text', max: 200, required: true, names: ['name', 'naam', 'nome', 'item', 'equipment', 'artigo', 'equipamento', 'displayname', 'display name', 'article', 'artikel', 'product', 'produto'] },
    { key: 'code', type: 'code', names: ['code', 'number', 'nummer', 'item code', 'article number', 'artikelnummer', 'codigo', 'referencia', 'ref', 'sku', 'barcode', 'equipment code'] },
    { key: 'category', type: 'text', max: 80, names: ['category', 'categorie', 'categoria', 'folder', 'map', 'group', 'groep', 'grupo', 'pasta'] },
    { key: 'brand', type: 'text', max: 80, names: ['brand', 'merk', 'marca', 'manufacturer', 'fabrikant', 'fabricante', 'make'] },
    { key: 'model', type: 'text', max: 80, names: ['model', 'modelo'] },
    { key: 'unit_price', type: 'money', names: ['price', 'rental price', 'prijs', 'verhuurprijs', 'preco', 'price per day', 'dagprijs', 'day price', 'rate', 'tarief', 'unit price', 'preco unitario', 'preco de aluguer'] },
    { key: 'kind', type: 'enum', words: 'itemKind', names: ['kind', 'type', 'soort', 'tipo', 'item type'] },
    { key: 'unit', type: 'enum', words: 'unit', names: ['unit', 'eenheid', 'unidade', 'per', 'charged per'] },
    { key: 'tracking', type: 'enum', words: 'tracking', names: ['tracking', 'stock tracking', 'serials', 'serial numbers', 'serienummers', 'stock management', 'voorraadbeheer', 'controlo de stock'] },
    { key: 'quantity', type: 'int', max: 100000, names: ['quantity', 'qty', 'stock', 'aantal', 'voorraad', 'quantidade', 'in stock', 'current stock', 'stock quantity', 'existencias'] },
    { key: 'location', type: 'text', max: 100, names: ['location', 'warehouse', 'magazijn', 'locatie', 'local', 'armazem', 'stock location'] },
    { key: 'weight_kg', type: 'number', names: ['weight', 'weight kg', 'gewicht', 'peso', 'kg'] },
    { key: 'power_w', type: 'int', max: 1000000, names: ['power', 'power w', 'vermogen', 'potencia', 'watt', 'watts', 'w'] },
    { key: 'dimensions', type: 'text', max: 80, names: ['dimensions', 'size', 'afmetingen', 'dimensoes', 'measurements'] },
    { key: 'replacement_value', type: 'money', names: ['replacement value', 'vervangingswaarde', 'new price', 'nieuwprijs', 'valor de reposicao', 'value', 'waarde', 'insured value'] },
    { key: 'min_stock', type: 'int', max: 100000, names: ['minimum stock', 'min stock', 'minimale voorraad', 'stock minimo'] },
    { key: 'packing_note', type: 'text', max: 500, names: ['packing note', 'pakbon opmerking', 'nota de embalagem'] },
    { key: 'details', type: 'text', max: 2000, names: ['details', 'description', 'omschrijving', 'beschrijving', 'descricao', 'notes', 'remarks', 'opmerkingen', 'notas'] },
  ],
  units: [
    { key: 'item', type: 'text', max: 200, names: ['item', 'equipment', 'item name', 'equipment name', 'naam', 'name', 'artigo', 'equipamento', 'nome', 'artikel'] },
    { key: 'item_code', type: 'code', names: ['item code', 'equipment code', 'equipment number', 'artikelcode', 'artikelnummer', 'codigo do artigo', 'article number'] },
    { key: 'code', type: 'code', names: ['barcode', 'code', 'label', 'asset', 'asset tag', 'asset number', 'qr', 'qr code', 'codigo de barras', 'etiqueta', 'streepjescode', 'id'] },
    { key: 'serial', type: 'text', max: 80, names: ['serial', 'serial number', 'serienummer', 'numero de serie', 'sn', 's n', 'serial no'] },
    { key: 'location', type: 'text', max: 100, names: ['location', 'warehouse', 'magazijn', 'locatie', 'local', 'armazem', 'current location'] },
    { key: 'status', type: 'enum', words: 'unitStatus', names: ['status', 'state', 'estado', 'conditie', 'condition'] },
    { key: 'purchase_date', type: 'date', names: ['purchase date', 'bought', 'aankoopdatum', 'data de compra', 'purchased', 'date purchased', 'in use since'] },
    { key: 'purchase_cost', type: 'money', names: ['purchase price', 'purchase cost', 'cost', 'aankoopprijs', 'inkoopprijs', 'custo', 'preco de compra', 'valor de compra'] },
    { key: 'notes', type: 'text', max: 500, names: ['notes', 'remarks', 'opmerkingen', 'notas', 'observacoes', 'comment', 'comments'] },
  ],
  kits: [
    { key: 'kit', type: 'text', max: 200, names: ['kit', 'set', 'case', 'parent', 'kit name', 'set name', 'case name', 'parent name', 'hoofdartikel', 'samengesteld artikel', 'conjunto', 'caixa', 'artigo principal'] },
    { key: 'kit_code', type: 'code', names: ['kit code', 'set code', 'case code', 'parent code', 'parent number', 'codigo do conjunto', 'codigo da caixa'] },
    { key: 'item', type: 'text', max: 200, names: ['item', 'content', 'contents', 'part', 'child', 'component', 'onderdeel', 'inhoud', 'artikel', 'componente', 'conteudo', 'equipment', 'name', 'naam', 'nome'] },
    { key: 'item_code', type: 'code', names: ['item code', 'part code', 'child code', 'component code', 'code', 'artikelcode', 'artikelnummer', 'codigo'] },
    { key: 'quantity', type: 'int', max: 1000, names: ['quantity', 'qty', 'aantal', 'quantidade', 'number', 'count'] },
    { key: 'part_kind', type: 'enum', words: 'partKind', names: ['kind', 'type', 'soort', 'tipo', 'relation', 'relatie', 'part type'] },
    { key: 'kit_type', type: 'enum', words: 'kitType', names: ['kit type', 'set or case', 'parent type', 'tipo de conjunto'] },
  ],
}

// "Número de Série" → "numero de serie"
export const normalise = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// ── Reading ──────────────────────────────────────────────────────────────────
// The file's records: its lines, with a line break inside quotes kept in its record
function records(text) {
  const out = []
  let buf = null
  for (const line of String(text || '').split(/\r?\n/)) {
    buf = buf === null ? line : `${buf}\n${line}`
    if (((buf.match(/"/g) || []).length % 2) === 0) { out.push(buf); buf = null }
  }
  if (buf !== null) out.push(buf)
  return out.filter(r => r.trim() !== '')
}

// Which character separates the columns: the one that splits the first records most evenly
export function detectDelimiter(text) {
  const lines = records(text).slice(0, 5)
  let best = '\t', bestScore = -1
  for (const d of ['\t', ';', ',', '|']) {
    const counts = lines.map(l => splitLine(l, d).length)
    const min = Math.min(...counts)
    const score = min > 1 && counts.every(c => c === counts[0]) ? min * 10 : min
    if (score > bestScore) { best = d; bestScore = score }
  }
  return best
}

function splitLine(line, d) {
  const out = []
  let cur = '', quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"' && cur.trim() === '') { quoted = true; cur = '' }
    else if (ch === d) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out.map(s => s.trim())
}

// A CSV/TSV file or text pasted from a spreadsheet → { headers, rows } (rows are arrays of
// strings; quoted cells may hold the separator, quotes and line breaks). headers: the first row,
// or "Column 1", "Column 2"… when the file has none.
export function parseTable(text, { headerRow = true, delimiter } = {}) {
  const src = String(text || '').replace(/^\uFEFF/, '')
  const d = delimiter || detectDelimiter(src)
  const rows = records(src).map(r => splitLine(r, d))
  const width = Math.max(0, ...rows.map(r => r.length))
  if (!rows.length) return { headers: [], rows: [], delimiter: d }
  const headers = headerRow
    ? rows[0].map((h, i) => h || `Column ${i + 1}`)
    : Array.from({ length: width }, (_, i) => `Column ${i + 1}`)
  while (headers.length < width) headers.push(`Column ${headers.length + 1}`)
  return { headers, rows: (headerRow ? rows.slice(1) : rows).map(r => headers.map((_, i) => r[i] ?? '')), delimiter: d }
}

// ── Matching columns ─────────────────────────────────────────────────────────
// { header: fieldKey } for the columns AVX recognises; each field from one column at most
export function guessMapping(headers, kind) {
  const fields = FIELDS[kind] || []
  const mapping = {}
  const taken = new Set()
  // Exact names first, then names contained in the header ("Rental price (€)")
  for (const pass of ['exact', 'contains']) {
    for (const h of headers) {
      if (mapping[h]) continue
      const n = normalise(h)
      const f = fields.find(f => !taken.has(f.key) && f.names.some(name => (pass === 'exact' ? n === name : n.split(' ').length > 1 && (` ${n} `).includes(` ${name} `) && name.length > 2)))
      if (f) { mapping[h] = f.key; taken.add(f.key) }
    }
  }
  return mapping
}

// A saved preset applied to this file: only the columns that exist
export const applyPreset = (headers, preset) => Object.fromEntries(headers.filter(h => preset?.[h]).map(h => [h, preset[h]]))

// Required fields not matched to any column
export function missingFields(mapping, kind) {
  const used = new Set(Object.values(mapping))
  if (kind === 'units') return used.has('item') || used.has('item_code') ? [] : ['item']
  if (kind === 'kits') return [...(used.has('kit') || used.has('kit_code') ? [] : ['kit']), ...(used.has('item') || used.has('item_code') ? [] : ['item'])]
  if (kind === 'items') return used.has('name') || used.has('code') ? [] : ['name']
  return (FIELDS[kind] || []).filter(f => f.required && !used.has(f.key)).map(f => f.key)
}

// ── Cleaning values ──────────────────────────────────────────────────────────
// "1.234,50" → 1234.5; "2 kg" → 2; returns NaN when it isn't a number
export function parseNumber(text) {
  const s = String(text ?? '').trim()
  if (!s) return NaN
  if (!/\d/.test(s)) return NaN
  return parsePrice(s.replace(/[a-zA-Z€$£]/g, ''))
}

// 2024-03-01, 01-03-2024, 1/3/2024, 01.03.2024 → '2024-03-01' (day before month), or null
export function parseDate(text) {
  const s = String(text ?? '').trim()
  let y, m, d
  let r = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (r) [, y, m, d] = r
  else if ((r = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/))) [, d, m, y] = r
  else return null
  const date = new Date(Date.UTC(+y, +m - 1, +d))
  if (date.getUTCFullYear() !== +y || date.getUTCMonth() !== +m - 1 || date.getUTCDate() !== +d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function parseChoice(text, words) {
  const n = normalise(text)
  if (!n) return null
  for (const [value, list] of Object.entries(WORDS[words] || {})) if (value === n || list.includes(n)) return value
  return undefined
}

// One cell for one field → { value } or { error } (an i18n key under imp.err.*)
export function cleanValue(raw, field) {
  const s = String(raw ?? '').trim()
  if (!s) return { value: null }
  switch (field.type) {
    case 'money':
    case 'number': {
      const n = parseNumber(s)
      return Number.isFinite(n) && n >= 0 ? { value: Math.round(n * 1000) / 1000 } : { error: 'number' }
    }
    case 'int': {
      const n = parseNumber(s)
      return Number.isFinite(n) && Number.isInteger(n) && n >= 0 && n <= (field.max || 1e9) ? { value: n } : { error: 'whole' }
    }
    case 'date': {
      const d = parseDate(s)
      return d ? { value: d } : { error: 'date' }
    }
    case 'enum': {
      const v = parseChoice(s, field.words)
      return v ? { value: v } : { error: 'choice' }
    }
    case 'code': return CODE_RE.test(s) ? { value: s } : { error: 'code' }
    default: return s.length <= (field.max || 200) ? { value: s } : { error: 'long' }
  }
}

// The file's rows as AVX rows: [{ _row (line in the file), field: value, …, _errors: [{ field, error }] }].
// Rows with nothing in the matched columns are left out.
export function buildRows(table, mapping, kind, { headerRow = true } = {}) {
  const fields = FIELDS[kind] || []
  const cols = table.headers.map((h, i) => ({ i, field: fields.find(f => f.key === mapping[h]) })).filter(c => c.field)
  const out = []
  table.rows.forEach((cells, n) => {
    const row = { _row: n + (headerRow ? 2 : 1), _errors: [] }
    let any = false
    for (const { i, field } of cols) {
      const { value, error } = cleanValue(cells[i], field)
      if (error) row._errors.push({ field: field.key, error })
      if (value !== null && value !== undefined) { row[field.key] = value; any = true }
      else if (error) any = true
    }
    if (!any) return
    if (kind === 'locations' && !row.name) row._errors.push({ field: 'name', error: 'missing' })
    if (kind === 'items' && !row.name && !row.code) row._errors.push({ field: 'name', error: 'missing' })
    if (kind === 'units' && !row.item && !row.item_code) row._errors.push({ field: 'item', error: 'missing' })
    if (kind === 'kits' && !row.kit && !row.kit_code) row._errors.push({ field: 'kit', error: 'missing' })
    if (kind === 'kits' && !row.item && !row.item_code) row._errors.push({ field: 'item', error: 'missing' })
    if (kind === 'kits' && row.quantity === 0) row._errors.push({ field: 'quantity', error: 'whole' })
    if (kind === 'items' && row.quantity > 0 && !row.location) row._errors.push({ field: 'location', error: 'needLocation' })
    out.push(row)
  })
  return out
}

// What sending these rows will do, predicted from what exists: each row gets
// { action: 'create' | 'match' | 'skip', reason } (the database has the final word)
export function dryRun(rows, kind, existing) {
  const lower = s => String(s || '').toLowerCase()
  const locations = new Set((existing.locations || []).filter(l => !l.archived_at).map(l => lower(l.name)))
  const items = (existing.items || []).filter(i => !i.archived_at)
  const itemByCode = new Map(items.filter(i => i.code).map(i => [i.code.toUpperCase(), i]))
  const itemsByName = new Map()
  for (const i of items) itemsByName.set(lower(i.name), [...(itemsByName.get(lower(i.name)) || []), i])
  const unitCodes = new Set((existing.units || []).map(u => u.code.toUpperCase()))
  const seen = new Set()
  const findItem = (code, name) => (code && itemByCode.get(code.toUpperCase())) || (name && itemsByName.get(lower(name))?.length === 1 ? itemsByName.get(lower(name))[0] : null)
  const plan = rows.map(row => {
    if (row._errors.length) return { action: 'skip', reason: row._errors[0].error, field: row._errors[0].field }
    if (kind === 'locations') {
      const key = lower(row.name)
      const action = locations.has(key) || seen.has(key) ? 'match' : 'create'
      seen.add(key)
      return { action }
    }
    if (kind === 'items') {
      if (row.location && !locations.has(lower(row.location))) return { action: 'skip', reason: 'unknownLocation', value: row.location }
      if (!row.code && row.name && (itemsByName.get(lower(row.name))?.length || 0) > 1) return { action: 'skip', reason: 'sameName', value: row.name }
      const key = row.code ? `#${row.code.toUpperCase()}` : lower(row.name)
      const action = findItem(row.code, row.name) || seen.has(key) ? 'match' : 'create'
      seen.add(key)
      return { action }
    }
    if (kind === 'kits') {
      const kit = findItem(row.kit_code, row.kit)
      if (!kit) return { action: 'skip', reason: 'unknownKit', value: row.kit_code || row.kit }
      const item = findItem(row.item_code, row.item)
      if (!item) return { action: 'skip', reason: 'unknownItem', value: row.item_code || row.item }
      if (kit.id === item.id) return { action: 'skip', reason: 'selfKit', value: kit.name }
      const partKind = row.part_kind || (!kit.kit_type && kit.tracking !== 'none' && !row.kit_type ? 'accessory' : 'content')
      const key = `${kit.id}>${item.id}>${partKind}`
      const action = (existing.parts || []).some(p => p.parent_id === kit.id && p.child_id === item.id && p.kind === partKind) || seen.has(key) ? 'match' : 'create'
      seen.add(key)
      return { action }
    }
    // units
    if (row.location && !locations.has(lower(row.location))) return { action: 'skip', reason: 'unknownLocation', value: row.location }
    const item = findItem(row.item_code, row.item)
    // An item created by an earlier import in this session isn't known here yet; the database decides
    if (!item) return { action: 'skip', reason: 'unknownItem', value: row.item_code || row.item }
    if (item.tracking === 'bulk') return { action: 'skip', reason: 'bulkItem', value: item.name }
    const key = row.code ? row.code.toUpperCase() : null
    const action = (key && (unitCodes.has(key) || seen.has(key))) ? 'match' : 'create'
    if (key) seen.add(key)
    return { action }
  })
  const counts = { create: 0, match: 0, skip: 0 }
  for (const p of plan) counts[p.action] += 1
  return { plan, counts }
}

// Rows to send: only the fields (and the line number)
export const toPayload = rows => rows.filter(r => !r._errors.length).map(({ _errors, ...rest }) => rest)

// The import's report as CSV: line, result, message
export function reportCsv(problems, labels) {
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`
  return [[labels.row, labels.level, labels.message].map(esc).join(','),
    ...(problems || []).map(p => [p.row, labels[p.level] || p.level, p.message].map(esc).join(','))].join('\n')
}

// The database's reasons for skipping a row, as i18n keys (imp.srv.*) with their values; null
// for anything else (shown as it came)
const SERVER = [
  [/^The name is missing/, 'nameMissing'],
  [/^Unknown location: (.+)$/, 'unknownLocation'],
  [/^Several items are called (.+?): add their codes/, 'sameName'],
  [/^Unknown item: (.+)$/, 'unknownItem'],
  [/^Item (.+) is counted in bulk/, 'bulkItem'],
  [/^Item (.+) is archived/, 'archived'],
  [/^Code (.+) belongs to a unit of another item/, 'otherItem'],
  [/^Serial-numbered items get their stock/, 'serialQuantity'],
  [/^A quantity needs a location/, 'needLocation'],
  [/^Quantity not added/, 'quantityKept'],
  [/^duplicate key value/, 'duplicate'],
  [/^Only rental or sale items can have stock/, 'notStock'],
  [/^Unknown kit: (.+)$/, 'unknownKit'],
  [/^The quantity must be 1 to 1000/, 'kitQuantity'],
  [/^Only sets and cases have contents/, 'notKit'],
  [/^Accessories belong to stock-tracked items/, 'accessoryUntracked'],
  [/^Only stock-tracked items can be part of a kit/, 'partUntracked'],
  [/^An item can't contain itself/, 'selfKit'],
  [/violates check constraint "price_items_kit_check"/, 'kitType'],
  [/^Stock tracking can't change/, 'trackingLocked'],
]
export function serverMessage(message) {
  for (const [re, key] of SERVER) {
    const m = String(message || '').match(re)
    if (m) return { key, name: m[1] }
  }
  return null
}
