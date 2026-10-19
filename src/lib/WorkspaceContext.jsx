import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './AuthContext'
import { logger } from './logger'
import { saveSnapshot, loadSnapshot, isNetworkError } from './offline'
import { MY_WORK, defaultWorkspace } from './nav'

// Fired by the bell when notifications arrive or are read, so the counts in the switcher follow
export const NOTIFICATIONS_CHANGED = 'avx:notifications-changed'

// The workspace you're looking at: My work (every gig you're on, anywhere) or one of
// your organisations. Your role there (admin / member / viewer) comes with it, so
// switching organisation switches what the menus offer. Remembered per person and device.

const WorkspaceContext = createContext({})
const storageKey = userId => `avx.workspace.${userId}`

function readRemembered(userId) {
  try { return localStorage.getItem(storageKey(userId)) } catch { return null }
}

export function WorkspaceProvider({ children }) {
  const { user, mfaRequired } = useAuth()
  const [orgs, setOrgs] = useState([]) // [{ ...organisation, myRole }]
  const [loading, setLoading] = useState(true)
  const [loadedFor, setLoadedFor] = useState(null) // whose organisations are loaded
  const [offlineSince, setOfflineSince] = useState(null)
  const [workspace, setWorkspaceState] = useState(MY_WORK)
  const [unreadByOrg, setUnreadByOrg] = useState({}) // org_id ('' = none) -> unread count
  const [mutedIds, setMutedIds] = useState(() => new Set())

  const refresh = useCallback(async () => {
    if (!user) return []
    const { data, error } = await supabase.from('org_members').select('role, organisations(*)').eq('user_id', user.id)
    let list
    if (error && isNetworkError(error)) {
      const snap = loadSnapshot('workspace.orgs')
      list = snap?.data || []
      setOfflineSince(snap?.savedAt ?? null)
    } else {
      if (error) logger.error('workspace', error, { step: 'orgs' })
      list = (data || []).filter(d => d.organisations).map(d => ({ ...d.organisations, myRole: d.role }))
        .sort((a, b) => a.name.localeCompare(b.name))
      if (!error) saveSnapshot('workspace.orgs', list)
      setOfflineSince(null)
    }
    setOrgs(list)
    setWorkspaceState(current => {
      const next = current !== MY_WORK && list.some(o => o.id === current) ? current : defaultWorkspace(list, readRemembered(user.id))
      return next
    })
    setLoading(false)
    setLoadedFor(user.id)
    return list
  }, [user])

  useEffect(() => {
    if (!user || mfaRequired) { setOrgs([]); setLoading(!user ? false : true); return }
    setLoading(true)
    refresh()
  }, [user, mfaRequired, refresh])

  // Unread notifications per organisation, and the organisations you muted
  const refreshUnread = useCallback(async () => {
    if (!user || mfaRequired) return
    const [counts, mutes] = await Promise.all([supabase.rpc('my_unread_counts'), supabase.from('org_mutes').select('org_id')])
    if (!counts.error) setUnreadByOrg(Object.fromEntries((counts.data || []).map(r => [r.org_id || '', Number(r.unread)])))
    if (!mutes.error) setMutedIds(new Set((mutes.data || []).map(r => r.org_id)))
  }, [user, mfaRequired])
  useEffect(() => {
    refreshUnread()
    window.addEventListener(NOTIFICATIONS_CHANGED, refreshUnread)
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED, refreshUnread)
  }, [refreshUnread])

  // Muting an organisation: no unread badge and no email summary for its updates
  // (direct questions such as availability requests still come through)
  const setMuted = useCallback(async (orgId, muted) => {
    setMutedIds(ids => { const next = new Set(ids); if (muted) next.add(orgId); else next.delete(orgId); return next })
    const { error } = muted
      ? await supabase.from('org_mutes').upsert({ org_id: orgId }, { onConflict: 'user_id,org_id', ignoreDuplicates: true })
      : await supabase.from('org_mutes').delete().eq('org_id', orgId)
    if (error) logger.error('workspace', error, { step: 'mute' })
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED))
    return !error
  }, [])

  useEffect(() => {
    const onOnline = () => refresh()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [refresh])

  const setWorkspace = useCallback(id => {
    const next = id || MY_WORK
    setWorkspaceState(next)
    if (user) { try { localStorage.setItem(storageKey(user.id), next) } catch { /* private mode */ } }
  }, [user])

  const value = useMemo(() => {
    const currentOrg = orgs.find(o => o.id === workspace) || null
    const memberOf = new Set(orgs.map(o => o.id))
    const unreadIn = orgId => (mutedIds.has(orgId) ? 0 : unreadByOrg[orgId] || 0)
    // My work: everything not tied to one of your organisations (gigs you crew for others)
    const unreadMyWork = Object.entries(unreadByOrg)
      .filter(([id]) => !memberOf.has(id) && !mutedIds.has(id)).reduce((sum, [, n]) => sum + n, 0)
    return {
      // Still loading until this person's organisations are in: right after signing in, the
      // first render has a user but the previous (signed-out) state, which would open My work
      orgs, loading: loading || (!!user && !mfaRequired && loadedFor !== user.id), offlineSince, refresh, setWorkspace,
      mutedIds, setMuted, unreadIn, unreadMyWork, refreshUnread,
      workspace: currentOrg ? workspace : MY_WORK,
      currentOrg,
      role: currentOrg?.myRole ?? null,
      roleIn: orgId => orgs.find(o => o.id === orgId)?.myRole ?? null,
    }
  }, [orgs, loading, loadedFor, user, mfaRequired, offlineSince, refresh, setWorkspace, workspace, unreadByOrg, mutedIds, setMuted, refreshUnread])

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export const useWorkspace = () => useContext(WorkspaceContext)
