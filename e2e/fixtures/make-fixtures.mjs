#!/usr/bin/env node
// Makes the sample files in e2e/fixtures/ (made-up data only). Run it again after changing it:
//   node e2e/fixtures/make-fixtures.mjs
// The xlsx and the Windows-1252 CSV are binary, so they are made here rather than typed.
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zipSync, strToU8 } from 'fflate'

const here = dirname(fileURLToPath(import.meta.url))
const out = (name, data) => writeFileSync(join(here, name), data)
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// A small Excel workbook: one sheet "Equipment" with inline strings and numbers
function xlsx(sheetName, rows) {
  const col = i => String.fromCharCode(65 + i)
  const cells = rows.map((row, r) => `<row r="${r + 1}">${row.map((v, c) => typeof v === 'number'
    ? `<c r="${col(c)}${r + 1}"><v>${v}</v></c>`
    : `<c r="${col(c)}${r + 1}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`).join('')}</row>`).join('')
  return zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${cells}</sheetData></worksheet>`),
  }, { mtime: new Date('2026-01-01T00:00:00Z') })
}

// Windows-1252: the characters Portuguese needs are all single bytes in Latin-1's range
const win1252 = text => Uint8Array.from([...text].map(ch => {
  const code = ch.codePointAt(0)
  if (code > 0xff) throw new Error(`Not in Windows-1252: ${ch}`)
  return code
}))

out('equipment.xlsx', xlsx('Equipment', [
  ['Name', 'Code', 'Quantity', 'Price', 'Category'],
  ['E2E Moving head', 'E2E-MH', 8, 45, 'Lighting'],
  ['E2E Speaker', 'E2E-SPK', 4, 60, 'Audio'],
  ['E2E Cable 10 m', 'E2E-CBL', 30, 2.5, 'Cables'],
]))

out('equipment-windows-1252.csv', win1252([
  'Nome;Código;Quantidade;Localização',
  'E2E Projetor;E2E-PRJ;2;Armazém',
  'E2E Ecrã;E2E-ECR;1;Armazém',
  'E2E Cabo elétrico;E2E-CAB;12;Armazém',
  '',
].join('\r\n')))

// Column names as in a Rentman equipment export (made-up rows; no real account data)
out('rentman-equipment.csv', [
  'displayname,code,rental sales,stock management,current quantity,critical stock level,list price,internal remark',
  'E2E Line array,E2E-LA,rental,yes,6,1,120,Made-up row',
  'E2E Subwoofer,E2E-SUB,rental,yes,4,0,90,Made-up row',
  'E2E Gaffa tape,E2E-GAF,sales,no,50,10,6.5,Made-up row',
  '',
].join('\n'))
