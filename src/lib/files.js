// Helpers for asset uploads (kept pure so they can be unit tested).

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024 // matches the gig-assets bucket limit

// Storage keys only allow a safe character set — strip accents and symbols.
export function slugify(name, maxLength = 60) {
  const slug = String(name ?? '').trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
  return slug || 'file'
}

export function fileExtension(fileName) {
  const parts = String(fileName ?? '').split('.')
  if (parts.length < 2) return 'bin'
  const ext = parts.pop().toLowerCase().replace(/[^a-z0-9]/g, '')
  return ext || 'bin'
}

export function storagePath(gigId, displayName, fileName, now = Date.now()) {
  return `${gigId}/${now}-${slugify(displayName)}.${fileExtension(fileName)}`
}

// A new upload replaces the current asset with the same type and name (case-insensitive).
export function findAssetToSupersede(currentAssets, type, name) {
  const key = String(name ?? '').trim().toLowerCase()
  return currentAssets.find(a => a.type === type && a.name.trim().toLowerCase() === key) || null
}

export function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
