import { describe, it, expect } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import { PARTS, PAGE_SIZE, fileName, cell, toCsv, fetchPart, slug, buildOrgExport } from './orgExport'
import { parseTable, guessMapping, buildRows } from './importer'

const columnsOf = part => PARTS.find(p => p.part === part).columns

describe('organisation export', () => {
  it('writes cells like the other CSV files', () => {
    expect(cell(null)).toBe('')
    expect(cell(12.5)).toBe('12,5')
    expect(cell(true)).toBe('yes')
    expect(cell('Rock; Pop')).toBe('"Rock; Pop"')
    expect(cell('Say "hi"')).toBe('"Say ""hi"""')
    expect(cell({ a: 1 })).toBe('"{""a"":1}"')
    expect(fileName('organisation')).toBe('01-organisation.csv')
    expect(fileName('quote_lines')).toBe(`${String(PARTS.findIndex(p => p.part === 'quote_lines') + 1).padStart(2, '0')}-quote-lines.csv`)
    expect(slug('Lumen & Pixel, Lda.')).toBe('lumen-pixel-lda')
  })

  it('keeps the columns in order, adding any others at the end', () => {
    const csv = toCsv([{ code: 'A1', name: 'Mic', extra: 'x' }], ['name', 'code'])
    expect(csv).toBe('name;code;extra\r\nMic;A1;x\r\n')
    expect(toCsv([], ['name', 'unit_price'])).toBe('name;unit price\r\n')
  })

  it('fetches a part page by page', async () => {
    const calls = []
    const rpc = async (_fn, args) => {
      calls.push(args.p_offset)
      const left = PAGE_SIZE + 3 - args.p_offset
      return { data: Array.from({ length: Math.max(0, Math.min(PAGE_SIZE, left)) }, (_, i) => ({ n: args.p_offset + i })), error: null }
    }
    const rows = await fetchPart(rpc, 'org', 'units')
    expect(rows).toHaveLength(PAGE_SIZE + 3)
    expect(calls).toEqual([0, PAGE_SIZE])
  })

  it('imports back into AVX: catalogue, units, kit contents, contacts and jobs', () => {
    const back = (part, kind, rows) => {
      const table = parseTable(toCsv(rows, columnsOf(part)))
      const mapping = guessMapping(table.headers, kind)
      return buildRows(table, mapping, kind)
    }
    const [item] = back('items', 'items', [{ name: 'Shure SM58', code: 'SM58', category: 'Audio', brand: 'Shure', unit_price: 12.5, kind: 'rental', charged_per: 'day', tracking: 'serial', weight_kg: 0.3, replacement_value: 99 }])
    expect(item).toMatchObject({ name: 'Shure SM58', code: 'SM58', category: 'Audio', brand: 'Shure', unit_price: 12.5, kind: 'rental', unit: 'day', tracking: 'serial', weight_kg: 0.3, replacement_value: 99 })
    expect(item._errors).toEqual([])
    const [unit] = back('units', 'units', [{ item: 'Shure SM58', item_code: 'SM58', code: 'A001', serial: 'SN1', location: 'Warehouse', status: 'available', purchase_date: '2024-03-01', purchase_cost: 89.9 }])
    expect(unit).toMatchObject({ item: 'Shure SM58', item_code: 'SM58', code: 'A001', serial: 'SN1', location: 'Warehouse', status: 'available', purchase_date: '2024-03-01', purchase_cost: 89.9 })
    const [kit] = back('kit_contents', 'kits', [{ kit: 'Mic set', kit_code: 'SET1', kit_type: 'set', item: 'Shure SM58', item_code: 'SM58', quantity: 6, part_kind: 'content' }])
    expect(kit).toMatchObject({ kit: 'Mic set', kit_code: 'SET1', item: 'Shure SM58', item_code: 'SM58', quantity: 6 })
    const [client] = back('clients', 'clients', [{ name: 'Festival Lda', contact_name: 'Ana', email: 'ana@example.com', phone: '+351 912', address: 'Rua 1', tax_id: 'PT123' }])
    expect(client).toMatchObject({ name: 'Festival Lda', email: 'ana@example.com', tax_id: 'PT123' })
    const [gig] = back('gigs', 'gigs', [{ ref: 'g-1', name: 'Summer Fest', start_date: '2026-11-10', end_date: '2026-11-12', venue: 'Parque', status: 'confirmed' }])
    expect(gig).toMatchObject({ ref: 'g-1', name: 'Summer Fest', start_date: '2026-11-10', end_date: '2026-11-12', venue: 'Parque', status: 'confirmed' })
    const [line] = back('gig_equipment', 'gig_equipment', [{ gig_ref: 'g-1', gig: 'Summer Fest', item: 'Shure SM58', item_code: 'SM58', quantity: 4 }])
    expect(line).toMatchObject({ gig_ref: 'g-1', gig: 'Summer Fest', item: 'Shure SM58', item_code: 'SM58', quantity: 4 })
    const [q] = back('quote_lines', 'quotes', [{ quote_number: 'Q0001', title: 'Summer Fest', client: 'Festival Lda', issue_date: '2026-10-21', section: 'Audio', description: 'SM58', item_code: 'SM58', quantity: 4, days: 2, unit_price: 5, discount_pct: 10, line_total: 36 }])
    expect(q).toMatchObject({ quote_ref: 'Q0001', title: 'Summer Fest', client: 'Festival Lda', section: 'Audio', description: 'SM58', item_code: 'SM58', quantity: 4, factor: 2, unit_price: 5, discount_pct: 10 })
  })

  it('builds a zip with every file, the messages and a README', async () => {
    const rpc = async (fn, args) => {
      if (fn === 'export_org_messages') return { data: [{ conversation: 'c1', messages: [{ text: 'Hi' }, { text: 'Olá' }] }], error: null }
      return { data: args.p_part === 'items' ? [{ name: 'Mic', code: 'M1' }] : [], error: null }
    }
    const steps = []
    const { blob, counts } = await buildOrgExport({ rpc, org: { id: 'o1', name: 'Export Co' }, readme: 'Read me', onProgress: (d, t) => steps.push(`${d}/${t}`) })
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()))
    expect(Object.keys(files)).toHaveLength(PARTS.length + 2)
    // A byte order mark first, so spreadsheets read the accents right
    expect([...files[fileName('items')].slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(strFromU8(files[fileName('items')].slice(3))).toBe(toCsv([{ name: 'Mic', code: 'M1' }], columnsOf('items')))
    expect(JSON.parse(strFromU8(files['messages.json'])).organisation).toBe('Export Co')
    expect(strFromU8(files['README.txt'])).toBe('Read me')
    expect(counts.items).toBe(1)
    expect(counts.messages).toBe(2)
    expect(steps.at(-1)).toBe(`${PARTS.length + 1}/${PARTS.length + 1}`)
  })

  it('stops on a refused part', async () => {
    const rpc = async () => ({ data: null, error: new Error('Two-step sign-in required') })
    await expect(buildOrgExport({ rpc, org: { id: 'o1', name: 'X' }, readme: '' })).rejects.toThrow('Two-step')
  })
})
