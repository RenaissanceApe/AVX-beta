import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, Plus, ChevronDown, ChevronRight, Star, XCircle, Megaphone, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { track } from '../lib/usage'
import { useWorkspace } from '../lib/WorkspaceContext'
import { jobError, money } from '../lib/jobs'
import { useI18n } from '../i18n'
import { btn, btnPrimary, card, colors } from '../components/ui'
import AppShell from '../components/shell/AppShell'
import { PageHelp } from '../components/help/HelpParts'
import JobCard from '../components/jobs/JobCard'
import PostJobModal from '../components/jobs/PostJobModal'
import CrewProfileCard from '../components/CrewProfileCard'

const hint = { fontSize: '12px', color: colors.muted, lineHeight: 1.5 }
const tone = { open: colors.accentText, filled: 'var(--sky)', closed: colors.muted }

// An organisation's job posts and their applicants (docs/CREW_NETWORK.md, N3), for admins and
// members: shortlist, decline or offer the place; close a post or mark it filled.
//   /org/:orgId/jobs
export default function OrgJobsPage() {
  const { orgId } = useParams()
  const navigate = useNavigate()
  const { t } = useI18n()
  const { notify } = useToast()
  const { orgs, roleIn, loading, setWorkspace } = useWorkspace()
  const role = roleIn(orgId)
  const org = orgs.find(o => o.id === orgId)
  const canUse = role === 'admin' || role === 'member'
  const [posts, setPosts] = useState(null)
  const [gigs, setGigs] = useState([])
  const [posting, setPosting] = useState(false)
  const [open, setOpen] = useState(null) // post id
  useEffect(() => { setWorkspace(orgId) }, [orgId, setWorkspace])

  const load = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10)
    const [p, g] = await Promise.all([
      supabase.from('job_posts').select('*, gigs(name)').eq('org_id', orgId).order('created_at', { ascending: false }).limit(100),
      supabase.from('gigs').select('id, name, venue, start_date, end_date').eq('org_id', orgId).neq('status', 'archived')
        .or(`end_date.gte.${today},and(end_date.is.null,start_date.gte.${today})`).order('start_date').limit(100),
    ])
    if (p.error) logger.error('jobs', p.error, { step: 'posts' })
    if (g.error) logger.error('jobs', g.error, { step: 'gigs' })
    setPosts(p.data || [])
    setGigs(g.data || [])
  }, [orgId])
  useEffect(() => { if (canUse) load() }, [canUse, load])

  async function setStatus(post, status) {
    const { error } = await supabase.rpc('close_job', { p_post: post.id, p_status: status })
    if (error) { logger.error('jobs', error, { step: 'close' }); const k = jobError(error); return notify(k ? t(k) : userMessage(error), 'error') }
    notify(t(`jobs.statusSet.${status}`), 'success')
    load()
  }

  if (loading || (canUse && !posts)) return <AppShell><div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}><Loader2 size={24} color={colors.accentText} style={{ animation: 'spin 1s linear infinite' }} /></div></AppShell>
  if (!canUse) return (
    <AppShell>
      <div style={{ maxWidth: '360px', margin: '80px auto', textAlign: 'center', padding: '0 16px' }}>
        <p style={{ color: colors.muted, fontSize: '14px', lineHeight: 1.6, marginBottom: '20px' }}>{t('jobs.noAccess')}</p>
        <button onClick={() => navigate('/dashboard')} style={btnPrimary}><ArrowLeft size={14} /> {t('common.backToDashboard')}</button>
      </div>
    </AppShell>
  )

  const today = new Date().toISOString().slice(0, 10)
  return (
    <AppShell>
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 16px 48px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <div style={{ fontSize: '12px', color: colors.muted, overflowWrap: 'anywhere' }}>{org?.name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.4px' }}>{t('jobs.orgTitle')}</h1>
              <PageHelp page="org-jobs" />
            </div>
          </div>
          <button type="button" onClick={() => setPosting(true)} style={btnPrimary}><Plus size={15} /> {t('jobs.postButton')}</button>
        </div>
        <p style={{ ...hint, fontSize: '13px' }}>{t('jobs.orgIntro')}</p>
        {posts.length === 0 && <p style={hint}>{t('jobs.noPosts')}</p>}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {posts.map(p => {
            const status = p.status === 'open' && p.ends_on < today ? 'closed' : p.status
            return (
              <li key={p.id}>
                <JobCard job={p}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginTop: '12px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: tone[status] }}>{t(`jobs.postStatus.${status}`)}</span>
                    {p.gigs?.name && <Link to={`/gig/${p.gig_id}?tab=crew`} style={{ ...hint, color: colors.accentText }}>{p.gigs.name}</Link>}
                    <span style={{ flex: 1 }} />
                    {p.status === 'open' && <button type="button" onClick={() => setStatus(p, 'filled')} style={btn}>{t('jobs.markFilled')}</button>}
                    {p.status === 'open' && <button type="button" onClick={() => setStatus(p, 'closed')} style={{ ...btn, background: 'transparent' }}>{t('jobs.close')}</button>}
                    {p.status !== 'open' && p.ends_on >= today && <button type="button" onClick={() => setStatus(p, 'open')} style={{ ...btn, background: 'transparent' }}>{t('jobs.reopen')}</button>}
                  </div>
                  <button type="button" aria-expanded={open === p.id} onClick={() => setOpen(open === p.id ? null : p.id)} style={{ ...btn, marginTop: '10px', background: 'transparent' }}>
                    {open === p.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />} <Users size={14} /> {t('jobs.applicants')}
                  </button>
                  {open === p.id && <Applicants post={p} />}
                </JobCard>
              </li>
            )
          })}
        </ul>
      </div>
      {posting && <PostJobModal gigs={gigs} onClose={() => setPosting(false)} onPosted={() => { setPosting(false); load() }} />}
    </AppShell>
  )
}

function Applicants({ post }) {
  const { t, lang } = useI18n()
  const { notify } = useToast()
  const [list, setList] = useState(null)
  const [busy, setBusy] = useState(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('job_applicants', { p_post: post.id })
    if (error) { logger.error('jobs', error, { step: 'applicants' }); return notify(userMessage(error), 'error') }
    setList(data || [])
  }, [post.id, notify])
  useEffect(() => { load() }, [load])

  async function answer(a, action) {
    let message = null
    if (action === 'decline') {
      message = window.prompt(t('jobs.declinePrompt', { name: a.name || '' }), t('jobs.declineDefault'))
      if (message === null) return
    }
    if (action === 'offer' && !window.confirm(t('jobs.offerConfirm', { name: a.name || '', title: post.title }))) return
    setBusy(a.id)
    const { error } = await supabase.rpc('answer_application', { p_application: a.id, p_action: action, p_message: message })
    setBusy(null)
    if (error) { logger.error('jobs', error, { step: 'answer', action }); const k = jobError(error); return notify(k ? t(k) : userMessage(error), 'error') }
    notify(t(`jobs.answered.${action}`, { name: a.name || '' }), 'success')
    track(`jobs:${action}`)
    load()
  }

  if (!list) return <div style={{ padding: '12px' }}><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /></div>
  if (!list.length) return <p style={{ ...hint, marginTop: '8px' }}>{t('jobs.noApplicants')}</p>
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'flex', flexDirection: 'column', gap: '10px' }} aria-label={t('jobs.applicants')}>
      {list.map(a => {
        const closed = ['declined', 'accepted', 'withdrawn'].includes(a.status)
        return (
          <li key={a.id}>
            <CrewProfileCard profile={a.profile || {}} name={a.name}>
              <div style={{ ...card, padding: '10px 12px', marginTop: '10px', background: 'transparent' }}>
                <div style={{ fontSize: '13px', fontWeight: 700 }}>
                  {t(`jobs.appStatus.${a.status}`)}
                  {a.day_rate != null && <> · {t('jobs.theirRate', { rate: money(Number(a.day_rate), a.currency || post.currency, lang) })}</>}
                </div>
                {a.message && <p style={{ fontSize: '13px', color: colors.soft, lineHeight: 1.5, marginTop: '4px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>“{a.message}”</p>}
              </div>
              {!closed && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
                  {a.status === 'applied' && <button type="button" disabled={busy === a.id} onClick={() => answer(a, 'shortlist')} style={btn} aria-label={t('jobs.shortlistNamed', { name: a.name || '' })}><Star size={14} /> {t('jobs.shortlist')}</button>}
                  {a.status !== 'offered' && <button type="button" disabled={busy === a.id} onClick={() => answer(a, 'offer')} style={btnPrimary} aria-label={t('jobs.offerNamed', { name: a.name || '' })}><Megaphone size={14} /> {t('jobs.offer')}</button>}
                  <button type="button" disabled={busy === a.id} onClick={() => answer(a, 'decline')} style={{ ...btn, background: 'transparent' }} aria-label={t('jobs.declineNamed', { name: a.name || '' })}><XCircle size={14} /> {t('jobs.decline')}</button>
                </div>
              )}
            </CrewProfileCard>
          </li>
        )
      })}
    </ul>
  )
}
