import { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { logger } from '../lib/logger'
import { useI18n } from '../i18n'
import { btnPrimary, colors } from '../components/ui'
import GigHeader, { GIG_TABS } from '../components/gig/GigHeader'
import OverviewTab from '../components/gig/OverviewTab'
import ScheduleTab from '../components/gig/ScheduleTab'
import AssetsTab from '../components/gig/AssetsTab'
import CrewTab from '../components/gig/CrewTab'
import FeedTab from '../components/gig/FeedTab'
import ActivityTab from '../components/gig/ActivityTab'
import AssetVersionsModal from '../components/gig/AssetVersionsModal'
import EditGigModal from '../components/gig/EditGigModal'
import NotificationBell from '../components/NotificationBell'

// Gig page container: loads the gig's data, keeps it live, works out permissions,
// and hands everything to the tab components in src/components/gig/.
export default function GigPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')

  const [data, setData] = useState(null) // { gig, members, assets, posts, invites, schedule, activity }
  const [profiles, setProfiles] = useState({})
  const [orgRole, setOrgRole] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState(GIG_TABS.includes(requestedTab) ? requestedTab : 'overview')
  const [showUpload, setShowUpload] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [versionsAsset, setVersionsAsset] = useState(null)

  // Switching gigs (e.g. from a notification) must not show the previous gig while loading
  useEffect(() => { setData(null); setVersionsAsset(null); loadAll() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
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
    const [gigRes, membersRes, assetsRes, postsRes, invitesRes, scheduleRes, activityRes] = await Promise.all([
      supabase.from('gigs').select('*').eq('id', id).maybeSingle(),
      supabase.from('gig_members').select('*').eq('gig_id', id),
      supabase.from('assets').select('*').eq('gig_id', id).is('superseded_by', null).order('created_at', { ascending: false }),
      supabase.from('feed_posts').select('*').eq('gig_id', id).order('created_at', { ascending: true }),
      // Only returns rows for PMs / org admins (RLS)
      supabase.from('gig_invites').select('*').eq('gig_id', id).order('created_at', { ascending: true }),
      supabase.from('gig_schedule').select('*').eq('gig_id', id),
      supabase.from('gig_activity').select('*').eq('gig_id', id).order('created_at', { ascending: false }).limit(100),
    ])
    const results = { gig: gigRes, members: membersRes, assets: assetsRes, posts: postsRes, schedule: scheduleRes, activity: activityRes }
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
    }

    // My role in the gig's organisation decides what I can edit (mirrors the database rules)
    if (next.gig?.org_id) {
      const { data: om } = await supabase.from('org_members').select('role')
        .eq('org_id', next.gig.org_id).eq('user_id', user.id).maybeSingle()
      setOrgRole(om?.role ?? null)
    }

    const uids = [...new Set([
      ...next.members.map(m => m.user_id),
      ...next.posts.map(p => p.user_id),
      ...next.assets.map(a => a.created_by),
      ...next.activity.flatMap(e => [e.actor_id, e.details?.user_id]),
    ].filter(Boolean))]
    if (uids.length) {
      const { data: profileData, error } = await supabase.from('profiles').select('id, full_name, phone').in('id', uids)
      if (error) logger.error('gig', error, { step: 'profiles', gigId: id })
      setProfiles(Object.fromEntries((profileData || []).map(p => [p.id, p])))
    }
    setData(next)
    setLoading(false)
  }

  if (loading && !data) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Loader2 size={28} color={colors.accent} style={{ animation: 'spin 1s linear infinite' }} />
    </div>
  )

  if (!data?.gig) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center' }}>
      <div style={{ maxWidth: '360px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '10px' }}>{t('gig.notAvailableTitle')}</h1>
        <p style={{ color: colors.muted, fontSize: '14px', lineHeight: 1.6, marginBottom: '20px' }}>{t('gig.notAvailableBody')}</p>
        <button onClick={() => navigate('/dashboard')} style={btnPrimary}><ArrowLeft size={14} /> {t('common.backToDashboard')}</button>
      </div>
    </div>
  )

  const { gig, members, assets, posts, invites, schedule, activity } = data
  const nameOf = uid => profiles[uid]?.full_name || t('common.unknown')
  const phoneOf = uid => profiles[uid]?.phone || ''
  const myMembership = members.find(m => m.user_id === user.id)
  // Mirrors private.can_manage_gig / can_contribute_gig in the database
  const isPM = myMembership?.role === 'pm' || gig.created_by === user.id || orgRole === 'admin'
  const canUpload = isPM || !!orgRole
  const reload = () => loadAll({ silent: true })

  return (
    <div style={{ minHeight: '100vh', color: '#fff' }}>
      <GigHeader gig={gig} crewCount={members.length} myMembership={myMembership} canEdit={isPM}
        tab={tab} setTab={setTab} counts={{ assets: assets.length, crew: members.length, feed: posts.length, schedule: schedule.length }}
        onBack={() => navigate('/dashboard')} onRefresh={() => loadAll()} onEdit={() => setShowEdit(true)}
        nav={<NotificationBell />} />

      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 16px' }}>
        {tab === 'overview' && (
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
          <AssetsTab gigId={id} assets={assets} canUpload={canUpload} onOpen={setVersionsAsset} onChanged={reload}
            showUpload={showUpload} setShowUpload={setShowUpload} />
        )}
        {tab === 'crew' && (
          <CrewTab gigId={id} gigDatesKey={`${gig.start_date}|${gig.end_date}`} members={members} invites={invites} isPM={isPM} userId={user.id} nameOf={nameOf} phoneOf={phoneOf}
            onChanged={reload} onLeft={() => navigate('/dashboard')} showInvite={showInvite} setShowInvite={setShowInvite} />
        )}
        {tab === 'feed' && <FeedTab gigId={id} posts={posts} userId={user.id} isPM={isPM} nameOf={nameOf} onChanged={reload} />}
        {tab === 'activity' && <ActivityTab entries={activity} nameOf={nameOf} />}
      </main>

      {versionsAsset && <AssetVersionsModal asset={versionsAsset} nameOf={nameOf} onClose={() => setVersionsAsset(null)} />}
      {showEdit && (
        <EditGigModal gig={gig} onClose={() => setShowEdit(false)}
          onSaved={changes => setData(d => ({ ...d, gig: { ...d.gig, ...changes } }))} />
      )}
    </div>
  )
}
