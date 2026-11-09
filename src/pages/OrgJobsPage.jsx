import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, ChevronDown, ChevronRight, Star, XCircle, Megaphone, Users, AlertTriangle, BadgeCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { track } from '../lib/usage'
import { useWorkspace } from '../lib/WorkspaceContext'
import { jobError, money } from '../lib/jobs'
import { trustError } from '../lib/trust'
import { useI18n } from '../i18n'
import { Modal, btn, btnPrimary, colors, AvxLoader, PageHeader, MoreMenu, Stack, space } from '../components/ui'
import { pageWrap, rowList } from '../components/ListParts'
import AppShell from '../components/shell/AppShell'
import { PageHelp } from '../components/help/HelpParts'
import JobCard from '../components/jobs/JobCard'
import PostJobModal from '../components/jobs/PostJobModal'
import CrewProfileCard from '../components/CrewProfileCard'
import { FeeFields, useFeeForm } from '../components/gig/FeeFields'
import { offerFee } from '../lib/crewRates'

const hint = { fontSize: '13px', color: colors.muted, lineHeight: 1.5, margin: 0 }
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
      supabase.from('gigs').select('id, org_id, name, venue, start_date, end_date').eq('org_id', orgId).not('status', 'in', '(archived,cancelled)')
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

  if (loading || (canUse && !posts)) return <AppShell><div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}><AvxLoader size={24} color={colors.accentText} /></div></AppShell>
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
      <div style={pageWrap}>
        <PageHeader title={t('jobs.orgTitle')} help={<PageHelp page="org-jobs" />}
          primary={<button type="button" onClick={() => setPosting(true)} style={btnPrimary}><Plus size={16} aria-hidden="true" /> {t('jobs.postButton')}</button>} />
        <Stack gap={3} style={{ marginBottom: space[5] }}>
          {org?.posting_suspended_at && (
            <p role="alert" style={{ margin: 0, display: 'flex', gap: space[3], alignItems: 'flex-start', fontSize: '14px', lineHeight: 1.5 }}>
              <AlertTriangle size={16} color={colors.warn} style={{ flexShrink: 0, marginTop: '3px' }} aria-hidden="true" /> {t('trust.postingSuspended')}
            </p>
          )}
          {org && !org.verified_at && !org.posting_suspended_at && (
            <p style={hint}>{t('trust.verify.capHint')} {role === 'admin' && <Link to={`/org/${orgId}?panel=settings`} style={{ color: colors.accentText }}>{t('trust.verify.open')}</Link>}</p>
          )}
          {org?.verified_at && <p style={{ ...hint, display: 'flex', gap: space[2], alignItems: 'center', color: 'var(--sky)' }}><BadgeCheck size={14} aria-hidden="true" /> {t('trust.verify.isVerified', { name: org.verified_name || org.name })}</p>}
          {posts.length === 0 && <p style={hint}>{t('jobs.noPosts')}</p>}
        </Stack>
        <ul style={rowList}>
          {posts.map(p => {
            const status = p.status === 'open' && p.ends_on < today ? 'closed' : p.status
            // Two things in view per post (DESIGN.md rule 5): the applicants and ⋯ for the rest
            const more = [
              ...(p.status === 'open' ? [{ label: t('jobs.markFilled'), onClick: () => setStatus(p, 'filled') }, { label: t('jobs.close'), onClick: () => setStatus(p, 'closed') }] : []),
              ...(p.status !== 'open' && p.ends_on >= today ? [{ label: t('jobs.reopen'), onClick: () => setStatus(p, 'open') }] : []),
            ]
            return (
              <JobCard key={p.id} job={p}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[2], alignItems: 'center', marginTop: space[3] }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: tone[status] }}>{t(`jobs.postStatus.${status}`)}</span>
                  {p.gigs?.name && <Link to={`/gig/${p.gig_id}?tab=crew`} style={{ ...hint, color: colors.accentText }}>{p.gigs.name}</Link>}
                  <span style={{ flex: 1 }} />
                  <button type="button" aria-expanded={open === p.id} onClick={() => setOpen(open === p.id ? null : p.id)} style={btn}>
                    {open === p.id ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />} <Users size={15} aria-hidden="true" /> {t('jobs.applicants')}
                  </button>
                  <MoreMenu items={more} label={t('jobs.moreFor', { title: p.title })} />
                </div>
                {open === p.id && <Applicants post={p} orgId={orgId} />}
              </JobCard>
            )
          })}
        </ul>
      </div>
      {posting && <PostJobModal gigs={gigs} onClose={() => setPosting(false)} onPosted={() => { setPosting(false); load() }} />}
    </AppShell>
  )
}

function Applicants({ post, orgId }) {
  const { t, lang } = useI18n()
  const { notify } = useToast()
  const [list, setList] = useState(null)
  const [busy, setBusy] = useState(null)
  const [offering, setOffering] = useState(null) // the application being offered the place

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('job_applicants', { p_post: post.id })
    if (error) { logger.error('jobs', error, { step: 'applicants' }); return notify(userMessage(error), 'error') }
    setList(data || [])
  }, [post.id, notify])
  useEffect(() => { load() }, [load])

  async function answer(a, action, fee = null) {
    let message = null
    if (action === 'decline') {
      message = window.prompt(t('jobs.declinePrompt', { name: a.name || '' }), t('jobs.declineDefault'))
      if (message === null) return
    }
    setBusy(a.id)
    const args = { p_application: a.id, p_action: action, p_message: message }
    const { error } = await supabase.rpc('answer_application', fee ? { ...args, p_fee_unit: fee.unit, p_fee_rate: fee.rate, p_fee_quantity: fee.quantity } : args)
    setBusy(null)
    if (error) { logger.error('jobs', error, { step: 'answer', action }); const k = jobError(error); return notify(k ? t(k) : userMessage(error), 'error') }
    notify(t(`jobs.answered.${action}`, { name: a.name || '' }), 'success')
    track(`jobs:${action}${fee ? ':fee' : ''}`)
    setOffering(null)
    load()
  }

  async function confirmCert(a, cert, on) {
    const { data, error } = await supabase.rpc('confirm_certificate', { p_org: orgId, p_user: a.user_id, p_cert: cert.id, p_confirm: on })
    if (error) { logger.error('jobs', error, { step: 'confirmCert' }); const k = trustError(error); return notify(k ? t(k) : userMessage(error), 'error') }
    setList(l => l.map(x => x.id !== a.id ? x : { ...x, profile: { ...x.profile, certificates: x.profile.certificates.map(c => c.id === cert.id ? data : c) } }))
    notify(t(on ? 'trust.cert.confirmed' : 'trust.cert.unconfirmed', { name: cert.name }), 'success')
  }

  if (!list) return <div style={{ padding: space[3] }}><AvxLoader size={18} /></div>
  if (!list.length) return <p style={{ ...hint, marginTop: space[3] }}>{t('jobs.noApplicants')}</p>
  return (
    <>
    <ul style={{ listStyle: 'none', padding: 0, margin: `${space[3]} 0 0`, display: 'flex', flexDirection: 'column', gap: space[3] }} aria-label={t('jobs.applicants')}>
      {list.map(a => {
        const closed = ['declined', 'accepted', 'withdrawn'].includes(a.status)
        return (
          <li key={a.id}>
            <CrewProfileCard profile={a.profile || {}} name={a.name} orgId={orgId} onConfirm={a.worked_with && a.profile ? (c, on) => confirmCert(a, c, on) : null}>
              <div style={{ marginTop: space[3], paddingTop: space[3], borderTop: `1px solid ${colors.line}` }}>
                <div style={{ fontSize: '13px', fontWeight: 700 }}>
                  {t(`jobs.appStatus.${a.status}`)}
                  {a.day_rate != null && <> · {t('jobs.theirRate', { rate: money(Number(a.day_rate), a.currency || post.currency, lang) })}</>}
                </div>
                {a.message && <p style={{ fontSize: '13px', color: colors.soft, lineHeight: 1.5, margin: `${space[1]} 0 0`, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>“{a.message}”</p>}
              </div>
              {!closed && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[2], marginTop: space[3] }}>
                  {a.status === 'applied' && <button type="button" disabled={busy === a.id} onClick={() => answer(a, 'shortlist')} style={btn} aria-label={t('jobs.shortlistNamed', { name: a.name || '' })}><Star size={15} aria-hidden="true" /> {t('jobs.shortlist')}</button>}
                  {a.status !== 'offered' && <button type="button" disabled={busy === a.id} onClick={() => setOffering(a)} style={btn} aria-label={t('jobs.offerNamed', { name: a.name || '' })}><Megaphone size={15} aria-hidden="true" /> {t('jobs.offer')}</button>}
                  <button type="button" disabled={busy === a.id} onClick={() => answer(a, 'decline')} style={{ ...btn, background: 'transparent' }} aria-label={t('jobs.declineNamed', { name: a.name || '' })}><XCircle size={15} aria-hidden="true" /> {t('jobs.decline')}</button>
                </div>
              )}
            </CrewProfileCard>
          </li>
        )
      })}
    </ul>
    {offering && <OfferModal post={post} application={offering} busy={busy === offering.id} onClose={() => setOffering(null)} onOffer={fee => answer(offering, 'offer', fee)} />}
    </>
  )
}

// Offering the place to an applicant, with the fee it starts from: their day rate, else the post's pay
function OfferModal({ post, application: a, busy, onClose, onOffer }) {
  const { t, lang } = useI18n()
  const start = offerFee(post, a)
  const fee = useFeeForm(start)
  const from = !start ? 'none' : a.day_rate != null && start.unit === 'day' ? 'rate' : start.quantity == null ? 'hours' : 'post'
  return (
    <Modal title={t('jobs.offerTitle', { name: a.name || '' })} onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); if (!fee.bad) onOffer(fee.fee) }} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <p style={{ fontSize: '14px', lineHeight: 1.5 }}>{t('jobs.offerConfirm', { name: a.name || '', title: post.title })}</p>
        <FeeFields id="jo" state={fee} canReset={!!start} resetLabel={t('jobs.offerFeeReset')}
          note={t(`jobs.offerFeeFrom.${from}`, { rate: a.day_rate != null ? money(Number(a.day_rate), a.currency || post.currency, lang) : '' })} />
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button type="submit" disabled={busy || fee.bad} style={btnPrimary}>
            {busy ? <AvxLoader size={15} /> : <Megaphone size={15} />} {t('jobs.offer')}
          </button>
          <button type="button" onClick={onClose} style={{ ...btn, background: 'transparent' }}>{t('common.cancel')}</button>
        </div>
      </form>
    </Modal>
  )
}
