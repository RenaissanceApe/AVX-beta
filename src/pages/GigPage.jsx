import { useState, useEffect } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Loader2, HardHat } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { logger } from '../lib/logger'
import { useI18n } from '../i18n'
import { useToast } from '../lib/ToastContext'
import { btn, btnPrimary, colors } from '../components/ui'
import GigHeader, { GIG_TABS, TAB_ALIASES } from '../components/gig/GigHeader'
import { useSimpleMode, SIMPLE_GIG_TABS } from '../lib/simpleMode'
import OverviewTab from '../components/gig/OverviewTab'
import ScheduleTab from '../components/gig/ScheduleTab'
import AssetsTab from '../components/gig/AssetsTab'
import CrewTab from '../components/gig/CrewTab'
import EquipmentTab from '../components/gig/EquipmentTab'
import UpdatesTab from '../components/gig/UpdatesTab'
import ToolsTab from '../components/gig/ToolsTab'
import ChatTab from '../components/gig/ChatTab'
import TasksTab from '../components/gig/TasksTab'
import OnSiteView from '../components/gig/OnSiteView'
import { readOnSite, saveOnSite, onSiteState, switchOnSite, ONSITE_CHANGED } from '../lib/onSite'
import AssetVersionsModal from '../components/gig/AssetVersionsModal'
import EditGigModal from '../components/gig/EditGigModal'
import AppShell from '../components/shell/AppShell'
import { useWorkspace } from '../lib/WorkspaceContext'
import OfflineBanner from '../components/OfflineBanner'
import { saveSnapshot, loadSnapshot, isNetworkError } from '../lib/offline'

// Gig page container: loads the gig's data, keeps it live, works out permissions,
// and hands everything to the tab components in src/components/gig/.
export default function GigPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const { t } = useI18n()
  const { notify } = useToast()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const rawTab = searchParams.get('tab')
  const requestedTab = TAB_ALIASES[rawTab] || rawTab
  // Updates shows posts, or the history when the link asked for the old Activity tab
  const [updatesView, setUpdatesView] = useState(rawTab === 'activity' ? 'history' : 'posts')
  useEffect(() => { if (rawTab === 'activity') setUpdatesView('history'); else if (rawTab === 'feed') setUpdatesView('posts') }, [rawTab])

  const [data, setData] = useState(null) // { gig, members, assets, posts, invites, schedule, activity }
  const [profiles, setProfiles] = useState({})
  const [orgRole, setOrgRole] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState(GIG_TABS.includes(requestedTab) ? requestedTab : 'overview')
  const [showUpload, setShowUpload] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [versionsAsset, setVersionsAsset] = useState(null)
  const [savedAt, setSavedAt] = useState(null) // set when showing the offline copy
  const [company, setCompany] = useState(null)
  // On-site mode (TOOLS_PLAN §1): kept on this device; follows changes made in Settings
  const [onSite, setOnSite] = useState(readOnSite)
  useEffect(() => {
    const sync = () => setOnSite(readOnSite())
    window.addEventListener(ONSITE_CHANGED, sync)
    return () => window.removeEventListener(ONSITE_CHANGED, sync)
  }, [])
  const { orgs } = useWorkspace()
  const location = useLocation()
  // Back goes where you came from (My work, an organisation, a notification); fresh tabs go home
  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate('/dashboard'))

  // Switching gigs (e.g. from a notification) must not show the previous gig while loading
  useEffect(() => { setData(null); setVersionsAsset(null); loadAll() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  // Back online: replace the saved copy with fresh data
  useEffect(() => {
    const onOnline = () => loadAll({ silent: true })
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  // The company this gig belongs to: known if you're a member, otherwise asked for by name only
  const gigOrgId = data?.gig?.org_id
  useEffect(() => {
    if (!gigOrgId) return setCompany(null)
    const mine = orgs.find(o => o.id === gigOrgId)
    if (mine) return setCompany(mine.name)
    let cancelled = false
    supabase.rpc('my_gig_companies').then(({ data: rows }) => {
      if (!cancelled) setCompany(rows?.find(r => r.org_id === gigOrgId)?.name || null)
    })
    return () => { cancelled = true }
  }, [gigOrgId, orgs])

  // Simple mode (H4) shows fewer tabs; a link to another tab (from a notification) still opens it
  const { simple } = useSimpleMode()
  // Tools (FIELD_TOOLS.md, F1): who edits the Plan tools. The tab is always there (On site tools)
  const editsTools = !!data?.gig && (data.gig.created_by === user.id || orgRole === 'admin' || orgRole === 'member'
    || (data.members || []).some(m => m.user_id === user.id && m.role === 'pm'))
  const tabs = (simple ? [...SIMPLE_GIG_TABS, ...(GIG_TABS.includes(requestedTab) && !SIMPLE_GIG_TABS.includes(requestedTab) ? [requestedTab] : [])] : GIG_TABS)
  useEffect(() => { if (!tabs.includes(tab)) setTab('overview') }, [tabs.join(), tab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Links such as /gig/:id?tab=schedule (from notifications) select a tab
  useEffect(() => { if (GIG_TABS.includes(requestedTab)) setTab(requestedTab) }, [requestedTab, id])

  // Live updates: new feed posts and any change logged in the activity table
  // (uploads, crew, schedule, status) trigger a quiet reload.
  useEffect(() => {
    let timer
    const reload = () => { clearTimeout(timer); timer = setTimeout(() => loadAll({ silent: true }), 400) }
    const channel = supabase.channel(`gig-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'feed_posts', filter: `gig_id=eq.${id}` }, reload)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gig_activity', filter: `gig_id=eq.${id}` }, reload)
      .subscribe(status => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') logger.warn('realtime', `Channel ${status}`, { gigId: id })
      })
    return () => { clearTimeout(timer); supabase.removeChannel(channel) }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAll({ silent = false } = {}) {
    if (!silent) setLoading(true)
    const [gigRes, membersRes, assetsRes, postsRes, invitesRes, scheduleRes, activityRes, toolsRes, tasksRes] = await Promise.all([
      supabase.from('gigs').select('*').eq('id', id).maybeSingle(),
      supabase.from('gig_members').select('*').eq('gig_id', id),
      supabase.from('assets').select('*').eq('gig_id', id).is('superseded_by', null).order('created_at', { ascending: false }),
      supabase.from('feed_posts').select('*').eq('gig_id', id).order('created_at', { ascending: true }),
      // Only returns rows for PMs / org admins (RLS)
      supabase.from('gig_invites').select('*').eq('gig_id', id).order('created_at', { ascending: true }),
      supabase.from('gig_schedule').select('*').eq('gig_id', id),
      supabase.from('gig_activity').select('*').eq('gig_id', id).order('created_at', { ascending: false }).limit(100),
      supabase.from('gig_tools').select('tool').eq('gig_id', id),
      supabase.from('tasks').select('id, status, assignee_id, due_on, title').eq('gig_id', id).is('removed_at', null),
    ])
    const results = { gig: gigRes, members: membersRes, assets: assetsRes, posts: postsRes, schedule: scheduleRes, activity: activityRes }

    // No connection: show the copy saved the last time this gig loaded
    if (gigRes.error && isNetworkError(gigRes.error)) {
      const snap = loadSnapshot(`gig.${id}`)
      if (snap) {
        setData(snap.data.data)
        setProfiles(snap.data.profiles)
        setOrgRole(snap.data.orgRole)
        setSavedAt(snap.savedAt)
      } else if (!silent) {
        setData(d => d ?? { offlineMissing: true })
      }
      setLoading(false)
      return
    }
    for (const [step, res] of Object.entries(results)) {
      if (res.error) logger.error('gig', res.error, { step, gigId: id })
    }
    const next = {
      gig: gigRes.data,
      members: membersRes.data || [],
      assets: assetsRes.data || [],
      posts: postsRes.data || [],
      invites: invitesRes.data || [],
      schedule: scheduleRes.data || [],
      activity: activityRes.data || [],
      tools: (toolsRes.data || []).map(r => r.tool),
      tasks: tasksRes.data || [],
    }

    // My role in the gig's organisation decides what I can edit (mirrors the database rules)
    let role = null
    if (next.gig?.org_id) {
      const { data: om } = await supabase.from('org_members').select('role')
        .eq('org_id', next.gig.org_id).eq('user_id', user.id).maybeSingle()
      role = om?.role ?? null
      setOrgRole(role)
    }

    const uids = [...new Set([
      ...next.members.map(m => m.user_id),
      ...next.posts.map(p => p.user_id),
      ...next.assets.map(a => a.created_by),
      ...next.activity.flatMap(e => [e.actor_id, e.details?.user_id]),
    ].filter(Boolean))]
    let profileMap = {}
    if (uids.length) {
      const { data: profileData, error } = await supabase.from('profiles').select('id, full_name, phone').in('id', uids)
      if (error) logger.error('gig', error, { step: 'profiles', gigId: id })
      profileMap = Object.fromEntries((profileData || []).map(p => [p.id, p]))
      setProfiles(profileMap)
    }
    setData(next)
    setSavedAt(null)
    setLoading(false)
    if (next.gig) saveSnapshot(`gig.${id}`, { data: next, profiles: profileMap, orgRole: role })
  }

  if (loading && !data) return (
    <AppShell>
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={28} color={colors.accentText} style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    </AppShell>
  )

  if (data?.offlineMissing) return (
    <AppShell>
      <OfflineBanner />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', textAlign: 'center' }}>
        <div style={{ maxWidth: '360px' }}>
          <p style={{ color: colors.muted, fontSize: '14px', lineHeight: 1.6, marginBottom: '20px' }}>{t('offline.notSaved')}</p>
          <button onClick={() => navigate('/dashboard')} style={btnPrimary}><ArrowLeft size={14} /> {t('common.backToDashboard')}</button>
        </div>
      </div>
    </AppShell>
  )

  if (!data?.gig) return (
    <AppShell>
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center' }}>
        <div style={{ maxWidth: '360px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '10px' }}>{t('gig.notAvailableTitle')}</h1>
          <p style={{ color: colors.muted, fontSize: '14px', lineHeight: 1.6, marginBottom: '20px' }}>{t('gig.notAvailableBody')}</p>
          <button onClick={() => navigate('/dashboard')} style={btnPrimary}><ArrowLeft size={14} /> {t('common.backToDashboard')}</button>
        </div>
      </div>
    </AppShell>
  )

  const { gig, members, assets, posts, invites, schedule, activity } = data
  const tools = data.tools || []
  const nameOf = uid => profiles[uid]?.full_name || t('common.unknown')
  const phoneOf = uid => profiles[uid]?.phone || ''
  const myMembership = members.find(m => m.user_id === user.id)
  // Mirrors private.can_manage_gig / can_contribute_gig in the database
  const isPM = myMembership?.role === 'pm' || gig.created_by === user.id || orgRole === 'admin'
  const canUpload = isPM || !!orgRole
  const reload = () => loadAll({ silent: true })
  const onSiteWhy = onSiteState(gig, onSite)

  return (
    <AppShell>
      <OfflineBanner savedAt={savedAt} />
      <GigHeader gig={gig} crewCount={members.length} myMembership={myMembership} canEdit={isPM}
        tab={tab} setTab={setTab} tabs={tabs} counts={{ assets: assets.length, crew: members.length, updates: posts.length, schedule: schedule.length, tools: tools.length, tasks: (data.tasks || []).filter(x => x.status === 'open').length }}
        onBack={goBack} onRefresh={() => loadAll()} onEdit={() => setShowEdit(true)}
        company={company} orgRole={orgRole} />

      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 16px' }}>
        {tab === 'overview' && onSiteWhy && (
          <OnSiteView gig={gig} schedule={schedule} tools={tools} myMembership={myMembership} canScan={canUpload} why={onSiteWhy}
            noteSeen={onSite.noteSeen} onDismissNote={() => saveOnSite({ ...readOnSite(), noteSeen: true })}
            onLeave={() => saveOnSite({ ...switchOnSite(readOnSite(), gig.id, false), noteSeen: true })} setTab={setTab} />
        )}
        {tab === 'overview' && !onSiteWhy && (
          <button type="button" onClick={() => saveOnSite(switchOnSite(readOnSite(), gig.id, true))}
            style={{ ...btn, background: 'transparent', marginBottom: '12px' }}><HardHat size={14} /> {t('onsite.enter')}</button>
        )}
        {tab === 'overview' && !onSiteWhy && (
          <OverviewTab gig={gig} assets={assets} members={members} posts={posts} schedule={schedule}
            canUpload={canUpload} isPM={isPM} nameOf={nameOf} setTab={setTab} onOpenAsset={setVersionsAsset}
            openUpload={() => { setTab('assets'); setShowUpload(true) }}
            openInvite={() => { setTab('crew'); setShowInvite(true) }} />
        )}
        {tab === 'schedule' && (
          <ScheduleTab gig={gig} items={schedule} canManage={isPM}
            onChanged={reload} onOpenCallSheet={() => navigate(`/gig/${id}/callsheet`)} />
        )}
        {tab === 'assets' && (
          <AssetsTab gigId={id} assets={assets} canUpload={canUpload} offline={!!savedAt} onOpen={setVersionsAsset} onChanged={reload}
            showUpload={showUpload} setShowUpload={setShowUpload} />
        )}
        {tab === 'crew' && (
          <CrewTab gig={gig} members={members} invites={invites} isPM={isPM} orgRole={orgRole} userId={user.id} nameOf={nameOf} phoneOf={phoneOf}
            onChanged={reload} onLeft={() => navigate('/dashboard')} showInvite={showInvite} setShowInvite={setShowInvite} />
        )}
        {tab === 'tasks' && (
          <TasksTab gig={gig} members={members} nameOf={nameOf} userId={user.id} canManage={editsTools}
            canNote={editsTools || ['pm', 'crew'].includes(myMembership?.role)} offline={!!savedAt} onChanged={reload} />
        )}
        {tab === 'equipment' && (
          <EquipmentTab gig={gig} org={orgs.find(o => o.id === gig.org_id) || {}}
            canEdit={isPM || orgRole === 'admin' || orgRole === 'member'} canAdd={orgRole === 'admin' || orgRole === 'member'} />
        )}
        {tab === 'chat' && <ChatTab gigId={id} canPost={isPM || ['pm', 'crew'].includes(myMembership?.role)} />}
        {tab === 'tools' && (
          <ToolsTab gig={gig} tools={tools} canEdit={editsTools} canPlanEquipment={orgRole === 'admin' || orgRole === 'member'}
            orgTools={orgs.find(o => o.id === gig.org_id)?.field_tools} offline={!!savedAt} onChanged={reload}
            members={members} nameOf={nameOf} userId={user.id} canManage={editsTools}
            canNote={editsTools || ['pm', 'crew'].includes(myMembership?.role)} />
        )}
        {tab === 'updates' && (
          <UpdatesTab view={updatesView} setView={setUpdatesView}
            feed={{ gigId: id, posts, userId: user.id, isPM, nameOf, onChanged: reload }}
            activity={{ entries: activity, nameOf }} />
        )}
      </main>

      {versionsAsset && <AssetVersionsModal asset={versionsAsset} nameOf={nameOf} onClose={() => setVersionsAsset(null)} />}
      {showEdit && (
        <EditGigModal gig={gig} canDelete={orgRole === 'admin' || gig.created_by === user.id} onClose={() => setShowEdit(false)}
          onSaved={changes => setData(d => ({ ...d, gig: { ...d.gig, ...changes } }))}
          onDeleted={() => { notify(t('danger.gigDeleted', { name: gig.name }), 'success'); navigate('/dashboard', { replace: true }) }} />
      )}
    </AppShell>
  )
}
