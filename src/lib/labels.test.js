import { describe, it, expect } from 'vitest'
import {
  LABEL_SIZES, SIZE_KEYS, PRINT_MODES, PAPERS, PLAIN_MARGIN, DEFAULT_FIELDS, LABEL_FIELDS,
  pageLayout, labelPosition, pageCount, paginate, normalizeFields, templatesFrom, sameFields,
  departmentKind, departmentBand, contentLines, groupUnits, defaultSize,
} from './labels'

describe('label sizes (D31)', () => {
  it('has the three sizes with their rolls and pre-cut A4 sheets', () => {
    expect(SIZE_KEYS).toEqual(['small', 'medium', 'large'])
    expect(LABEL_SIZES.small.roll).toEqual({ w: 50, h: 25 })
    expect(LABEL_SIZES.small.sheet).toMatchObject({ w: 52.5, h: 29.7, cols: 4, rows: 10 })
    expect(LABEL_SIZES.medium.roll).toEqual({ w: 100, h: 50 })
    expect(LABEL_SIZES.medium.sheet).toMatchObject({ w: 105, h: 57, cols: 2, rows: 5 })
    expect(LABEL_SIZES.large.roll).toEqual({ w: 102, h: 152 })
    expect(LABEL_SIZES.large.sheet).toMatchObject({ w: 105, h: 148, cols: 2, rows: 2 })
  })

  it('draws each label inside both its roll and its sheet cell, with a margin', () => {
    for (const size of SIZE_KEYS) {
      const { label, roll, sheet } = LABEL_SIZES[size]
      expect(label.w).toBeLessThan(Math.min(roll.w, sheet.w))
      expect(label.h).toBeLessThan(Math.min(roll.h, sheet.h))
      expect(Math.min(roll.w, sheet.w) - label.w).toBeGreaterThanOrEqual(2)
      expect(Math.min(roll.h, sheet.h) - label.h).toBeGreaterThanOrEqual(2)
    }
  })

  it('fits each pre-cut sheet on A4', () => {
    for (const size of SIZE_KEYS) {
      const { sheet } = LABEL_SIZES[size]
      expect(sheet.cols * sheet.w).toBeLessThanOrEqual(PAPERS.a4.w + 0.01)
      expect(sheet.rows * sheet.h).toBeLessThanOrEqual(PAPERS.a4.h + 0.01)
    }
  })
})

describe('pageLayout', () => {
  it('prints one label per page on a roll, the page the size of the roll', () => {
    for (const size of SIZE_KEYS) {
      const l = pageLayout(size, 'roll')
      expect(l.perPage).toBe(1)
      expect(l.page).toEqual(LABEL_SIZES[size].roll)
      expect(l.cutLines).toBe(false)
    }
    // The label is centred on its roll page
    expect(labelPosition(pageLayout('small', 'roll'), 0)).toEqual({ x: 1, y: 1 })
    expect(labelPosition(pageLayout('large', 'roll'), 3)).toEqual({ x: 1.5, y: 5 })
  })

  it('fills pre-cut A4 sheets: 40, 10 and 4 a sheet, centred on the page', () => {
    expect(pageLayout('small', 'sheet')).toMatchObject({ perPage: 40, cols: 4, rows: 10, origin: { x: 0, y: 0 }, cutLines: false })
    expect(pageLayout('medium', 'sheet')).toMatchObject({ perPage: 10, cols: 2, rows: 5, origin: { x: 0, y: 6 } })
    expect(pageLayout('large', 'sheet')).toMatchObject({ perPage: 4, cols: 2, rows: 2, origin: { x: 0, y: 0.5 } })
    expect(pageLayout('medium', 'sheet').page).toEqual(PAPERS.a4)
  })

  it('places sheet labels row by row in the middle of their cells', () => {
    const l = pageLayout('small', 'sheet')
    expect(labelPosition(l, 0)).toEqual({ x: 2.25, y: 3.35 })
    expect(labelPosition(l, 1)).toEqual({ x: 54.75, y: 3.35 })
    expect(labelPosition(l, 4)).toEqual({ x: 2.25, y: 33.05 })
    // The 41st label starts the next page in the same place as the first
    expect(labelPosition(l, 40)).toEqual(labelPosition(l, 0))
    const m = pageLayout('medium', 'sheet')
    expect(labelPosition(m, 9)).toEqual({ x: 109, y: 6 + 4 * 57 + 5 })
  })

  it('packs plain A4 and Letter inside the margins, with cut lines', () => {
    const counts = Object.fromEntries(SIZE_KEYS.map(s => [s, [pageLayout(s, 'a4').perPage, pageLayout(s, 'letter').perPage]]))
    expect(counts).toEqual({ small: [48, 44], medium: [12, 10], large: [4, 2] })
    for (const size of SIZE_KEYS) {
      for (const mode of ['a4', 'letter']) {
        const l = pageLayout(size, mode)
        expect(l.cutLines).toBe(true)
        expect(l.cell).toEqual(LABEL_SIZES[size].label)
        // Nothing closer to the edge than the margin
        expect(l.origin.x).toBeGreaterThanOrEqual(PLAIN_MARGIN)
        expect(l.origin.y).toBeGreaterThanOrEqual(PLAIN_MARGIN)
        expect(l.origin.x + l.cols * l.cell.w).toBeLessThanOrEqual(l.page.w - PLAIN_MARGIN + 0.01)
        expect(l.origin.y + l.rows * l.cell.h).toBeLessThanOrEqual(l.page.h - PLAIN_MARGIN + 0.01)
      }
    }
    expect(pageLayout('small', 'letter').page).toEqual({ w: 215.9, h: 279.4 })
  })

  it('knows every print mode and falls back to small', () => {
    expect(PRINT_MODES).toEqual(['roll', 'sheet', 'a4', 'letter'])
    expect(pageLayout('huge', 'sheet').perPage).toBe(40)
  })
})

describe('pages', () => {
  it('counts and splits pages', () => {
    const sheet = pageLayout('medium', 'sheet')
    expect(pageCount(0, sheet)).toBe(0)
    expect(pageCount(10, sheet)).toBe(1)
    expect(pageCount(11, sheet)).toBe(2)
    expect(pageCount(3, pageLayout('small', 'roll'))).toBe(3)
    const pages = paginate(Array.from({ length: 23 }, (_, i) => i), sheet)
    expect(pages.map(p => p.length)).toEqual([10, 10, 3])
    expect(paginate([], sheet)).toEqual([])
  })
})

describe('templates', () => {
  it('has the agreed defaults', () => {
    expect(DEFAULT_FIELDS.small).toEqual(['name', 'code', 'qr'])
    expect(DEFAULT_FIELDS.medium).toEqual(['name', 'code', 'qr', 'org', 'department'])
    expect(DEFAULT_FIELDS.large).toEqual(LABEL_FIELDS)
  })

  it('keeps known fields once, in order, never none', () => {
    expect(normalizeFields(['qr', 'name', 'qr', 'bogus'])).toEqual(['name', 'qr'])
    expect(normalizeFields([])).toEqual(['name'])
    expect(normalizeFields(null)).toEqual(['name'])
  })

  it('uses the organisation\'s saved fields, else the defaults', () => {
    const t = templatesFrom([{ size: 'small', fields: ['qr', 'department'] }])
    expect(t.small).toEqual(['qr', 'department'])
    expect(t.medium).toEqual(DEFAULT_FIELDS.medium)
    expect(templatesFrom(null).large).toEqual(LABEL_FIELDS)
    expect(sameFields(['code', 'name'], ['name', 'code'])).toBe(true)
    expect(sameFields(['code'], ['name', 'code'])).toBe(false)
  })
})

describe('department bands', () => {
  it('finds the colour family from the name, in English and Portuguese', () => {
    expect(departmentKind('Audio')).toBe('sound')
    expect(departmentKind('Áudio')).toBe('sound')
    expect(departmentKind('Som')).toBe('sound')
    expect(departmentKind('Iluminação')).toBe('lighting')
    expect(departmentKind('Lighting')).toBe('lighting')
    expect(departmentKind('Vídeo')).toBe('video')
    expect(departmentKind('Power')).toBe('power')
    expect(departmentKind('Cabos')).toBe('power')
    expect(departmentKind('Truss')).toBe('rigging')
    expect(departmentKind('Palco')).toBe('staging')
    expect(departmentKind('Catering')).toBe('other')
    // Whole words only
    expect(departmentKind('Somebody')).toBe('other')
  })

  it('always prints the name with the colour; nothing without a name', () => {
    expect(departmentBand('Audio')).toMatchObject({ name: 'Audio', bg: expect.any(String), fg: expect.any(String) })
    expect(departmentBand('  ')).toBeNull()
    expect(departmentBand(null)).toBeNull()
  })
})

describe('contents', () => {
  it('lists case contents biggest first', () => {
    expect(contentLines([{ name: 'XLR 10 m', quantity: 2 }, { name: 'Shure SM58', quantity: 6 }, { name: 'DI', quantity: 2 }, { name: '' }]))
      .toEqual(['6 × Shure SM58', '2 × DI', '2 × XLR 10 m'])
  })

  it('groups packed units by item', () => {
    expect(groupUnits([{ name: 'SM58' }, { name: 'SM58' }, { name: 'Beta 91' }, { name: '' }]))
      .toEqual([{ name: 'SM58', quantity: 2 }, { name: 'Beta 91', quantity: 1 }])
  })

  it('starts cases large, units and distros medium, the rest small', () => {
    expect(defaultSize([{ kind: 'item' }, { kind: 'case' }])).toBe('large')
    expect(defaultSize([{ kind: 'unit' }])).toBe('medium')
    expect(defaultSize([{ kind: 'distro' }])).toBe('medium')
    expect(defaultSize([{ kind: 'cable' }, { kind: 'item' }])).toBe('small')
    expect(defaultSize([])).toBe('small')
  })
})
