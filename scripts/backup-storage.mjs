#!/usr/bin/env node
// Downloads every file in the gig-assets bucket into a local folder (used by the backup workflow).
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment. Logs counts only, never file names.
//
//   node scripts/backup-storage.mjs <output-dir>

import fs from 'node:fs/promises'
import path from 'node:path'

const BUCKET = 'gig-assets'
const url = process.env.SUPABASE_URL?.replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const outDir = process.argv[2]
if (!url || !key || !outDir) {
  console.error('Usage: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/backup-storage.mjs <output-dir>')
  process.exit(2)
}
const headers = { Authorization: `Bearer ${key}`, apikey: key }

async function list(prefix) {
  const items = []
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${url}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }),
    })
    if (!res.ok) throw new Error(`list failed: HTTP ${res.status}`)
    const page = await res.json()
    items.push(...page)
    if (page.length < 1000) return items
  }
}

// Folders come back without an id; recurse into them
async function walk(prefix = '') {
  const files = []
  for (const item of await list(prefix)) {
    const full = prefix ? `${prefix}/${item.name}` : item.name
    if (item.id) files.push(full)
    else files.push(...(await walk(full)))
  }
  return files
}

const files = await walk()
let bytes = 0
let failed = 0
for (const file of files) {
  const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${file.split('/').map(encodeURIComponent).join('/')}`, { headers })
  if (!res.ok) { failed++; continue }
  const buf = Buffer.from(await res.arrayBuffer())
  const dest = path.join(outDir, file)
  await fs.mkdir(path.dirname(dest), { recursive: true })
  await fs.writeFile(dest, buf)
  bytes += buf.length
}
console.log(`Downloaded ${files.length - failed}/${files.length} files (${(bytes / 1048576).toFixed(1)} MB)`)
if (failed) process.exit(1)
