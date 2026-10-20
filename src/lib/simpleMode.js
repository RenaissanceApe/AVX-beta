import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './AuthContext'
import { useWorkspace } from './WorkspaceContext'
import { useAppearance } from './appearance'

// Simple mode (docs/HELP.md, H4, decided 2026-10-20): the home shows only the next gig with its
// call time, the call sheet, the chat and "report a problem"; a gig shows fewer tabs.
// On automatically for people who are only crew: no organisation role above viewer and not a
// production manager on any gig. Everyone can turn it on or off in Account → Appearance.

// Is this person only crew? orgs: [{ myRole }]; managesGigs: true if they're a PM on any gig
export const isCrewOnly = (orgs, managesGigs) => !managesGigs && !(orgs || []).some(o => o.myRole === 'admin' || o.myRole === 'member')

// The setting ('auto' | 'on' | 'off') and the facts → simple mode or not
export const resolveSimple = (setting, crewOnly) => (setting === 'on' ? true : setting === 'off' ? false : crewOnly)

// The gig tabs in simple mode (equipment stays for "report damage")
export const SIMPLE_GIG_TABS = ['overview', 'schedule', 'assets', 'equipment', 'chat']

const pmCache = new Map() // user id → Promise<boolean>
function managesAnyGig(userId) {
  if (!pmCache.has(userId)) {
    pmCache.set(userId, supabase.from('gig_members').select('gig_id', { count: 'exact', head: true }).eq('user_id', userId).eq('role', 'pm')
      .then(({ count, error }) => (error ? false : (count || 0) > 0)))
  }
  return pmCache.get(userId)
}

// { simple, setting, crewOnly } for the person signed in; simple is false until the facts are in,
// so a manager never sees the simple home flash first
export function useSimpleMode() {
  const { user } = useAuth()
  const { orgs, loading } = useWorkspace()
  const [appearance] = useAppearance()
  const [managesGigs, setManagesGigs] = useState(null)
  useEffect(() => {
    if (!user) return
    let cancelled = false
    managesAnyGig(user.id).then(v => { if (!cancelled) setManagesGigs(v) })
    return () => { cancelled = true }
  }, [user])
  const known = !loading && managesGigs !== null
  const crewOnly = known && isCrewOnly(orgs, managesGigs)
  return { simple: appearance.simple === 'on' || (known && resolveSimple(appearance.simple, crewOnly)), setting: appearance.simple, crewOnly, known }
}
