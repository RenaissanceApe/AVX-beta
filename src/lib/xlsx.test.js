import { describe, it, expect } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { readXlsx, rowsToText, columnIndex, serialToDate } from './xlsx'
import { parseTable } from './importer'

// A small workbook like Excel writes: shared strings, a number, a date-formatted cell, an empty
// cell in the middle, an inline string, a boolean and rich text
function workbook({ sheetName = 'Equipment', withStyles = true } = {}) {
  const files = {
    'xl/workbook.xml': strToU8(`<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/><sheet name="Other" sheetId="2" r:id="rId2"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId2" Target="worksheets/sheet2.xml"/><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/sharedStrings.xml': strToU8('<sst><si><t>Naam</t></si><si><t>Prijs</t></si><si><t>Aankoopdatum</t></si><si><t>Kabel &amp; "stekker"</t></si><si><r><t>MAC </t></r><r><t xml:space="preserve">Aura</t></r></si></sst>'),
    'xl/worksheets/sheet1.xml': strToU8(`<worksheet><sheetData>
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>
      <row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2"><v>2.5</v></c><c r="C2" s="1"><v>45352</v></c></row>
      <row r="4"><c r="A4" t="s"><v>4</v></c><c r="C4" s="1"><v>45000.75</v></c></row>
      <row r="5"><c r="A5" t="inlineStr"><is><t>Tab\there</t></is></c><c r="B5"><v>0.30000000000000004</v></c><c r="C5" t="b"><v>1</v></c></row>
    </sheetData></worksheet>`),
    'xl/worksheets/sheet2.xml': strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Wrong sheet</t></is></c></row></sheetData></worksheet>'),
  }
  if (withStyles) files['xl/styles.xml'] = strToU8('<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164" applyNumberFormat="1"/></cellXfs></styleSheet>')
  return zipSync(files)
}

describe('reading Excel files', () => {
  it('turns column letters and day numbers into what the import needs', () => {
    expect(columnIndex('A1')).toBe(0)
    expect(columnIndex('Z9')).toBe(25)
    expect(columnIndex('AB3')).toBe(27)
    expect(serialToDate(45352)).toBe('2024-03-01')
    expect(serialToDate(1)).toBe('1899-12-31')
  })

  it('reads the first sheet: strings, numbers, dates, gaps, rich text and booleans', () => {
    const { sheet, rows } = readXlsx(workbook())
    expect(sheet).toBe('Equipment')
    expect(rows).toEqual([
      ['Naam', 'Prijs', 'Aankoopdatum'],
      ['Kabel & "stekker"', '2.5', '2024-03-01'],
      ['', '', ''],
      ['MAC Aura', '', '2023-03-15'],
      ['Tab\there', '0.3', 'TRUE'],
    ])
  })

  it('shows dates as numbers when the file has no date formats', () => {
    expect(readXlsx(workbook({ withStyles: false })).rows[1][2]).toBe('45352')
  })

  it('becomes text the wizard reads like a CSV file', () => {
    const text = rowsToText(readXlsx(workbook()).rows)
    const table = parseTable(text)
    expect(table.headers).toEqual(['Naam', 'Prijs', 'Aankoopdatum'])
    expect(table.rows).toEqual([['Kabel & "stekker"', '2.5', '2024-03-01'], ['MAC Aura', '', '2023-03-15'], ['Tab\there', '0.3', 'TRUE']])
  })

  it('refuses something that is not a workbook', () => {
    expect(() => readXlsx(new Uint8Array([1, 2, 3, 4]))).toThrow('not-xlsx')
    expect(() => readXlsx(zipSync({ 'hello.txt': strToU8('hi') }))).toThrow('not-xlsx')
  })
})
