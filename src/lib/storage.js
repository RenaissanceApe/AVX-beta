import { supabase } from './supabase'
import { logger } from './logger'

// Removes every stored file for the given gigs. Used before deleting an organisation
// or account, because deleting database rows does not delete files from storage.
export async function removeGigFiles(gigIds) {
  for (const gigId of gigIds) {
    const { data: files, error } = await supabase.storage.from('gig-assets').list(gigId, { limit: 1000 })
    if (error) {
      logger.error('storage', error, { step: 'list', gigId })
      continue
    }
    const paths = (files || []).filter(f => f.id).map(f => `${gigId}/${f.name}`)
    if (!paths.length) continue
    const { error: removeError } = await supabase.storage.from('gig-assets').remove(paths)
    if (removeError) logger.error('storage', removeError, { step: 'remove', gigId, count: paths.length })
  }
}

// Short-lived link to a stored file (optionally forcing a download filename)
export async function signedUrl(path, downloadName, expiresIn = 600) {
  const { data, error } = await supabase.storage.from('gig-assets')
    .createSignedUrl(path, expiresIn, downloadName ? { download: downloadName } : undefined)
  if (error || !data?.signedUrl) throw error || new Error('No link returned')
  return data.signedUrl
}
