// Asset version history (pure, unit tested).
// Versions are linked by assets.superseded_by -> the newer version's id.

// Returns the chain ending at `currentId`, newest first.
export function versionChain(allAssets, currentId) {
  const byId = new Map(allAssets.map(a => [a.id, a]))
  const olderOf = new Map(allAssets.filter(a => a.superseded_by).map(a => [a.superseded_by, a]))
  const chain = []
  let node = byId.get(currentId)
  const seen = new Set()
  while (node && !seen.has(node.id)) {
    chain.push(node)
    seen.add(node.id)
    node = olderOf.get(node.id)
  }
  return chain
}

export function previewKind(fileName) {
  const ext = String(fileName || '').split('?')[0].split('.').pop().toLowerCase()
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image'
  if (ext === 'pdf') return 'pdf'
  return null
}
