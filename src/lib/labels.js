// Label templates and print layouts (U5, docs/PENDING.md D31, docs/TOOLS_PLAN.md "Decided (2026-11-03)").
// Three sizes, none tied to a printer brand. Each prints on a roll (one label per page), on pre-cut
// A4 sheets, or on plain A4 / US Letter with cut lines. The label itself is drawn a little inside the
// smaller of its roll and its pre-cut cell, so one design fits both. All measures in millimetres.
import { LABEL_BAND } from '../theme/labels'

export const LABEL_SIZES = {
  small: { label: { w: 48, h: 23 }, roll: { w: 50, h: 25 }, sheet: { w: 52.5, h: 29.7, cols: 4, rows: 10 } },
  medium: { label: { w: 97, h: 47 }, roll: { w: 100, h: 50 }, sheet: { w: 105, h: 57, cols: 2, rows: 5 } },
  large: { label: { w: 99, h: 142 }, roll: { w: 102, h: 152 }, sheet: { w: 105, h: 148, cols: 2, rows: 2 } },
}
export const SIZE_KEYS = Object.keys(LABEL_SIZES)

export const PAPERS = { a4: { w: 210, h: 297 }, letter: { w: 215.9, h: 279.4 } }
// roll: one label per page · sheet: pre-cut A4 · a4 / letter: plain paper with cut lines
export const PRINT_MODES = ['roll', 'sheet', 'a4', 'letter']
// Plain paper keeps this much clear at each edge, inside what office printers can reach
export const PLAIN_MARGIN = 5

// What can go on a label, in the order it's listed
export const LABEL_FIELDS = ['name', 'code', 'qr', 'org', 'gig', 'contents', 'department']
export const DEFAULT_FIELDS = {
  small: ['name', 'code', 'qr'],
  medium: ['name', 'code', 'qr', 'org', 'department'],
  large: [...LABEL_FIELDS],
}

const round = n => Math.round(n * 100) / 100

// Where the labels sit on one printed page
//   { page, cell, label, cols, rows, perPage, origin: { x, y }, cutLines }
// cell = the space each label gets; the label is centred in it.
export function pageLayout(size, mode) {
  const s = LABEL_SIZES[size] || LABEL_SIZES.small
  const label = s.label
  if (mode === 'roll') {
    return { page: { ...s.roll }, cell: { ...s.roll }, label, cols: 1, rows: 1, perPage: 1, origin: { x: 0, y: 0 }, cutLines: false }
  }
  if (mode === 'sheet') {
    const page = PAPERS.a4
    const { cols, rows } = s.sheet
    const cell = { w: s.sheet.w, h: s.sheet.h }
    return {
      page: { ...page }, cell, label, cols, rows, perPage: cols * rows,
      origin: { x: round((page.w - cols * cell.w) / 2), y: round((page.h - rows * cell.h) / 2) },
      cutLines: false,
    }
  }
  // Plain paper: as many labels as fit inside the margins, packed edge to edge with cut lines
  const page = PAPERS[mode] || PAPERS.a4
  const cell = { ...label }
  const cols = Math.max(1, Math.floor((page.w - 2 * PLAIN_MARGIN) / cell.w))
  const rows = Math.max(1, Math.floor((page.h - 2 * PLAIN_MARGIN) / cell.h))
  return {
    page: { ...page }, cell, label, cols, rows, perPage: cols * rows,
    origin: { x: round((page.w - cols * cell.w) / 2), y: round((page.h - rows * cell.h) / 2) },
    cutLines: true,
  }
}

// The top-left corner of the label at this place on its page (row by row)
export function labelPosition(layout, index) {
  const i = index % layout.perPage
  const col = i % layout.cols
  const row = Math.floor(i / layout.cols)
  return {
    x: round(layout.origin.x + col * layout.cell.w + (layout.cell.w - layout.label.w) / 2),
    y: round(layout.origin.y + row * layout.cell.h + (layout.cell.h - layout.label.h) / 2),
  }
}

export const pageCount = (count, layout) => Math.ceil(Math.max(0, count) / layout.perPage)

// Labels split into pages
export function paginate(labels, layout) {
  const pages = []
  for (let i = 0; i < labels.length; i += layout.perPage) pages.push(labels.slice(i, i + layout.perPage))
  return pages
}

// A template's fields: known ones only, each once, in the standard order; never empty
export function normalizeFields(fields) {
  const set = new Set(Array.isArray(fields) ? fields : [])
  const list = LABEL_FIELDS.filter(f => set.has(f))
  return list.length ? list : ['name']
}

// The organisation's saved fields for each size (rows from label_templates), else the defaults
export function templatesFrom(rows) {
  const out = {}
  for (const size of SIZE_KEYS) {
    const row = (rows || []).find(r => r.size === size)
    out[size] = row ? normalizeFields(row.fields) : [...DEFAULT_FIELDS[size]]
  }
  return out
}

export const sameFields = (a, b) => normalizeFields(a).join(',') === normalizeFields(b).join(',')

// The colour family of a department band, from its name ("Audio", "Iluminação", "Power")
// Whole words only, accents included (\b alone stops at "á")
const words = list => new RegExp(`(?<![\\p{L}\\d])(${list})(?![\\p{L}\\d])`, 'iu')
const DEPT_WORDS = [
  ['sound', words('sound|audio|áudio|som|pa|microphones?|mics?|microfones?|monitors?|monitores|rf|backline')],
  ['lighting', words('light|lights|lighting|lx|luz|luzes|iluminação|iluminacao|fixtures?|projectores|dimmers?')],
  ['video', words('video|vídeo|led|screens?|ecrãs?|projection|projeção|projecao|cameras?|câmaras?|media')],
  ['power', words('power|energia|electrical|elétrica|eletrica|distros?|cables?|cabos?|cablagem')],
  ['rigging', words('rigging|truss|hoists?|motors?|motores|talhas?|estrutura')],
  ['staging', words('stage|staging|palco|estrados?|risers?|decks?|cenografia|set')],
]
export function departmentKind(name) {
  const text = String(name || '')
  for (const [kind, re] of DEPT_WORDS) if (re.test(text)) return kind
  return 'other'
}

// The band for a department name, or null when there is none to print
export function departmentBand(name) {
  const text = String(name || '').trim()
  if (!text) return null
  return { name: text, ...LABEL_BAND[departmentKind(text)] }
}

// "2 × Shure SM58" for each line of contents, biggest first then by name
export function contentLines(parts) {
  return (parts || [])
    .filter(p => p && p.name)
    .sort((a, b) => (b.quantity || 1) - (a.quantity || 1) || String(a.name).localeCompare(String(b.name)))
    .map(p => `${p.quantity || 1} × ${p.name}`)
}

// Units packed in a case, grouped by their item: [{ name, quantity }]
export function groupUnits(units) {
  const by = new Map()
  for (const u of units || []) {
    const name = u.name || ''
    if (!name) continue
    by.set(name, (by.get(name) || 0) + 1)
  }
  return [...by].map(([name, quantity]) => ({ name, quantity }))
}

// The size a list of labels starts on when nothing is remembered: cases large, units and distros
// medium, everything else small (TOOLS_PLAN.md: cables and small items small)
export function defaultSize(labels) {
  if ((labels || []).some(l => l.kind === 'case')) return 'large'
  if ((labels || []).some(l => l.kind === 'unit' || l.kind === 'distro')) return 'medium'
  return 'small'
}
