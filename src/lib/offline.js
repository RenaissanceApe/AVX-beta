import { useEffect, useState } from 'react'
import { logger } from './logger'

// Offline support for venues with no signal.
// - Snapshots: the last loaded copy of the dashboard, each gig and its call sheet (localStorage).
// - Files: copies of documents the user chose to keep offline (Cache Storage).
// Everything is per user and is wiped on sign-out (clearOfflineData).

const PREFIX = 'avx.offline.'
const FILE_CACHE = 'avx-files'
let currentUser = null

export function setOfflineUser(userId) {
  currentUser = userId
}

const key = name => `${PREFIX}${currentUser}.${name}`

export function saveSnapshot(name, data) {
  if (!currentUser) return
  try {
    localStorage.setItem(key(name), JSON.stringify({ savedAt: new Date().toISOString(), data }))
  } catch (err) {
    // Quota full or storage disabled: offline copy just won't be updated
    logger.warn('offline', 'Could not save offline copy', { name, reason: err?.name })
  }
}

export function loadSnapshot(name) {
  if (!currentUser) return null
  try {
    const raw = localStorage.getItem(key(name))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

// True when a Supabase/fetch error means "no connection" rather than "not allowed"
export function isNetworkError(error) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  return /failed to fetch|networkerror|load failed|network request failed/i.test(error?.message || '')
}

export function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return online
}

// ── Files ────────────────────────────────────────────────────────────────────
const fileKey = assetId => `/__avx_offline__/${currentUser}/${assetId}`
const hasCaches = () => typeof caches !== 'undefined'

export async function saveFileOffline(asset, signedUrl) {
  if (!hasCaches() || !currentUser) throw new Error('Offline storage is not available in this browser')
  const res = await fetch(signedUrl)
  if (!res.ok) throw new Error(`Download failed (${res.status})`)
  const cache = await caches.open(FILE_CACHE)
  await cache.put(fileKey(asset.id), new Response(await res.blob(), {
    headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream' },
  }))
}

export async function removeFileOffline(assetId) {
  if (!hasCaches()) return
  const cache = await caches.open(FILE_CACHE)
  await cache.delete(fileKey(assetId))
}

export async function offlineFileIds() {
  if (!hasCaches() || !currentUser) return new Set()
  const cache = await caches.open(FILE_CACHE)
  const prefix = `/__avx_offline__/${currentUser}/`
  const keys = await cache.keys()
  return new Set(keys.map(r => new URL(r.url).pathname).filter(p => p.startsWith(prefix)).map(p => p.slice(prefix.length)))
}

// Returns an object URL for a saved file, or null. Caller should URL.revokeObjectURL it when done.
export async function offlineFileUrl(assetId) {
  if (!hasCaches() || !currentUser) return null
  const cache = await caches.open(FILE_CACHE)
  const res = await cache.match(fileKey(assetId))
  return res ? URL.createObjectURL(await res.blob()) : null
}

// Remove every offline copy (all users) — called on sign-out and account deletion.
export async function clearOfflineData() {
  try {
    Object.keys(localStorage).filter(k => k.startsWith(PREFIX)).forEach(k => localStorage.removeItem(k))
  } catch { /* storage unavailable */ }
  if (hasCaches()) {
    try { await caches.delete(FILE_CACHE) } catch { /* ignore */ }
  }
}
