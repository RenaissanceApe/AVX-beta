// Reading an Excel workbook (.xlsx) for the import wizard (docs/SWITCHING.md, S1b; IM2 picks the
// sheet): a sheet's cells as text, so the rest of the import treats it like a CSV file. Only what an
// export needs: shared and inline strings, numbers, booleans and dates (by the cell's number
// format). Formulas give their last calculated value. Loaded only when an Excel file is chosen.
import { unzipSync, strFromU8 } from 'fflate'

const WANTED = /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|styles\.xml|worksheets\/[^/]+\.xml)$/
// Built-in number formats that are dates
const DATE_FORMATS = new Set([14, 15, 16, 17, 22, 27, 30, 36, 45, 46, 47, 50, 57])

const decode = s => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&amp;/g, '&')
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]
// All the text inside <t> elements (rich text has several runs)
const texts = xml => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => decode(m[1])).join('')

// "B12" → 1 (zero-based column)
export function columnIndex(ref) {
  const letters = String(ref || '').match(/^[A-Z]+/i)?.[0].toUpperCase() || 'A'
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

// Excel's day number → '2024-03-01' (1900 date system; time of day dropped)
export function serialToDate(serial) {
  const ms = Math.round((Number(serial) - 25569) * 86400) * 1000
  const d = new Date(ms)
  return Number.isFinite(ms) ? d.toISOString().slice(0, 10) : ''
}

// A number as people would type it: no float noise ("0.30000000000000004" → "0.3")
const plainNumber = v => {
  const n = Number(v)
  return Number.isFinite(n) ? String(parseFloat(n.toPrecision(12))) : String(v)
}

function dateStyles(stylesXml) {
  if (!stylesXml) return new Set()
  const custom = new Map([...stylesXml.matchAll(/<numFmt\s[^>]*>/g)].map(m => [Number(attr(m[0], 'numFmtId')), decode(attr(m[0], 'formatCode') || '')]))
  const isDate = id => DATE_FORMATS.has(id) || (custom.has(id) && /[dmy]/i.test(custom.get(id).replace(/"[^"]*"|\[[^\]]*\]/g, '')))
  const xfs = stylesXml.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] || ''
  const out = new Set()
  ;[...xfs.matchAll(/<xf\s[^>]*?\/?>/g)].forEach((m, i) => { if (isDate(Number(attr(m[0], 'numFmtId')))) out.add(i) })
  return out
}

// The workbook's sheets in their order: [{ name, path }] (a sheet whose file is missing is left out)
function sheetPaths(files) {
  const wb = files['xl/workbook.xml'] ? strFromU8(files['xl/workbook.xml']) : ''
  const rels = files['xl/_rels/workbook.xml.rels'] ? strFromU8(files['xl/_rels/workbook.xml.rels']) : ''
  const relList = [...rels.matchAll(/<Relationship\s[^>]*>/g)].map(m => m[0])
  const out = []
  for (const m of wb.matchAll(/<sheet\s[^>]*>/g)) {
    const rid = attr(m[0], 'r:id') || m[0].match(/\sr:id="([^"]*)"/)?.[1]
    const target = rid && attr(relList.find(r => attr(r, 'Id') === rid) || '', 'Target')
    if (!target) continue
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`
    if (files[path]) out.push({ name: decode(attr(m[0], 'name') || ''), path })
  }
  if (!out.length) {
    const any = Object.keys(files).filter(f => f.startsWith('xl/worksheets/')).sort()[0]
    if (any) out.push({ name: '', path: any })
  }
  return out
}

function unzip(buffer) {
  try {
    return unzipSync(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer), { filter: f => WANTED.test(f.name) })
  } catch {
    throw new Error('not-xlsx')
  }
}

function readSheet(files, path) {
  const shared = files['xl/sharedStrings.xml']
    ? [...strFromU8(files['xl/sharedStrings.xml']).matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => texts(m[1]))
    : []
  const dates = dateStyles(files['xl/styles.xml'] ? strFromU8(files['xl/styles.xml']) : '')
  const sheet = strFromU8(files[path])
  const rows = []
  for (const r of sheet.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const at = Number(attr(`<row${r[1]}>`, 'r')) || rows.length + 1
    const cells = []
    for (const c of r[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const head = `<c${c[1]}>`
      const body = c[2] || ''
      const type = attr(head, 't')
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1]
      let text = ''
      if (type === 's') text = shared[Number(v)] ?? ''
      else if (type === 'inlineStr') text = texts(body)
      else if (type === 'b') text = v === '1' ? 'TRUE' : 'FALSE'
      else if (type === 'str' || type === 'e') text = v === undefined ? '' : decode(v)
      else if (v !== undefined) text = dates.has(Number(attr(head, 's'))) ? serialToDate(v) : plainNumber(v)
      cells[attr(head, 'r') ? columnIndex(attr(head, 'r')) : cells.length] = text
    }
    rows[at - 1] = Array.from(cells, x => x ?? '')
  }
  const filled = Array.from(rows, r => r || [])
  const width = Math.max(0, ...filled.map(r => r.length))
  return filled.map(r => [...r, ...Array(width - r.length).fill('')])
}

const filledRows = rows => rows.filter(r => r.some(v => String(v).trim() !== '')).length

// One sheet of the workbook (the first unless sheet names another) → { sheet: name, rows: [[text, …], …],
// sheets: [{ name, rows }] } (rows padded to the same width; sheets: every sheet with its number of
// filled rows, for the sheet picker)
export function readXlsx(buffer, { sheet } = {}) {
  const files = unzip(buffer)
  const paths = sheetPaths(files)
  if (!paths.length) throw new Error('not-xlsx')
  const read = new Map(paths.map(p => [p.path, readSheet(files, p.path)]))
  const chosen = paths.find(p => p.name === sheet) || paths[0]
  return { sheet: chosen.name, rows: read.get(chosen.path), sheets: paths.map(p => ({ name: p.name, rows: filledRows(read.get(p.path)) })) }
}

// Rows → tab-separated text the wizard reads like any file (cells with tabs, quotes or line
// breaks are quoted)
export function rowsToText(rows) {
  const cell = v => (/[\t"\n\r]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v)
  return rows.filter(r => r.some(v => String(v).trim() !== '')).map(r => r.map(cell).join('\t')).join('\n')
}
