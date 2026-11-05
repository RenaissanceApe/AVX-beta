import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { selectAll } from './selectAll'
import { logger } from './logger'

// Every gig's finance row of an organisation (public.gig_finance, step 10), as a Map by gig id,
// for the margin hint on gig cards. Only call it for those who see money (admins and members);
// null while loading, when off, or if it failed (the cards then show no hint).
export function useGigMargins(orgId) {
  const [margins, setMargins] = useState(null)
  useEffect(() => {
    setMargins(null)
    if (!orgId) return
    let cancelled = false
    selectAll(() => supabase.rpc('gig_finance', { p_org: orgId, p_from: null, p_until: null }).order('gig_id')).then(({ data, error }) => {
      if (cancelled) return
      if (error) { logger.warn('gig-finance', error, { step: 'card-hints' }); return }
      setMargins(new Map((data || []).map(r => [r.gig_id, r])))
    })
    return () => { cancelled = true }
  }, [orgId])
  return margins
}
