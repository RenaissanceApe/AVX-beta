import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './AuthContext'
import { logger } from './logger'
import { saveSnapshot, loadSnapshot, isNetworkError } from './offline'
import { MY_WORK, defaultWorkspace } from './nav'

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
  const [offlineSince, setOfflineSince] = useState(null)
  const [workspace, setWorkspaceState] = useState(MY_WORK)

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
    return list
  }, [user])

  useEffect(() => {
    if (!user || mfaRequired) { setOrgs([]); setLoading(!user ? false : true); return }
    setLoading(true)
    refresh()
  }, [user, mfaRequired, refresh])

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
    return {
      orgs, loading, offlineSince, refresh, setWorkspace,
      workspace: currentOrg ? workspace : MY_WORK,
      currentOrg,
      role: currentOrg?.myRole ?? null,
      roleIn: orgId => orgs.find(o => o.id === orgId)?.myRole ?? null,
    }
  }, [orgs, loading, offlineSince, refresh, setWorkspace, workspace])

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export const useWorkspace = () => useContext(WorkspaceContext)
