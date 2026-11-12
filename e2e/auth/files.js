// Reading what the app hands over: downloads (zip exports, PDFs, calendar files) and two-step
// sign-in codes. docs/TESTING.md, "Automated test suite".
import { readFile } from 'node:fs/promises'
import { unzipSync, strFromU8 } from 'fflate'
import { extractText, getDocumentProxy } from 'unpdf'
import { TOTP } from 'otpauth'

// The bytes of a Playwright download (page.waitForEvent('download')), or of a buffer given as is
export async function bytesOf(download) {
  if (download instanceof Uint8Array) return download
  return new Uint8Array(await readFile(await download.path()))
}

// A zip export: { 'path/in/zip': Uint8Array, … }. text(files, path) reads one as text.
export async function readZip(download) {
  return unzipSync(await bytesOf(download))
}
export const zipText = (files, path) => {
  if (!files[path]) throw new Error(`No ${path} in the zip (it has: ${Object.keys(files).join(', ')})`)
  return strFromU8(files[path])
}

// A PDF's text: { pages: number, text: string } with the pages joined by a blank line
export async function readPdfText(download) {
  const pdf = await getDocumentProxy(await bytesOf(download))
  const { totalPages, text } = await extractText(pdf, { mergePages: false })
  return { pages: totalPages, text: text.join('\n\n') }
}

// A calendar file (.ics, or the calendar feed's text): the events, each { SUMMARY, DTSTART, … }
// with the property names as written (parameters such as ;TZID= are kept in `params`).
// Folded lines (RFC 5545: a line starting with a space continues the one before) are joined, and
// \, \; \n escapes are read.
export function parseIcs(text) {
  const lines = String(text).replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n')
  const events = []
  let current = null
  const unescape = v => v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1')
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { current = { params: {} }; continue }
    if (line === 'END:VEVENT') { if (current) events.push(current); current = null; continue }
    if (!current) continue
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const [name, ...params] = line.slice(0, colon).split(';')
    current[name.toUpperCase()] = unescape(line.slice(colon + 1))
    if (params.length) current.params[name.toUpperCase()] = Object.fromEntries(params.map(p => p.split('=')))
  }
  return events
}

// The current two-step sign-in code for an authenticator secret (base32, as the app shows it when
// you set up two-step sign-in), the same 6-digit / 30 s code an authenticator app shows.
// A code that is about to change is avoided: wait for the next one if fewer than 5 s are left.
export async function totpCode(secret) {
  const totp = new TOTP({ secret: secret.replace(/\s+/g, ''), digits: 6, period: 30, algorithm: 'SHA1' })
  const left = 30 - (Math.floor(Date.now() / 1000) % 30)
  if (left < 5) await new Promise(resolve => setTimeout(resolve, left * 1000 + 200))
  return totp.generate()
}
