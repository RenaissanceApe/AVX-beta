import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Plus, Calendar, MapPin, ChevronRight, Building2, Loader2, X, ArrowRight, Search, List, CalendarDays, Briefcase, AlertTriangle,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useWorkspace } from '../lib/WorkspaceContext'
import { logger, userMessage } from '../lib/logger'
import { MY_WORK, homePath } from '../lib/nav'
import OrgMembersModal from '../components/OrgMembersModal'
import OrgSettingsModal from '../components/OrgSettingsModal'
import GigCalendar from '../components/GigCalendar'
import AppShell, { RoleChip } from '../components/shell/AppShell'
import { GIG_FILTERS, filterGigs, countByBucket, myWorkGigs } from '../lib/gigs'
import { clashingGigIds } from '../lib/clashes'
import AvailabilityRequests from '../components/AvailabilityRequests'
import { useI18n, t, fmt } from '../i18n'
import OfflineBanner from '../components/OfflineBanner'
import { OwnClashWarning } from '../components/gig/Booking'
import { saveSnapshot, loadSnapshot, isNetworkError } from '../lib/offline'
import { PageHelp } from '../components/help/HelpParts'
import EmptyState from '../components/EmptyState'
import FirstSteps from '../components/FirstSteps'
import SimpleHome from '../components/SimpleHome'
import { useSimpleMode } from '../lib/simpleMode'
import { useGigLabels, GIG_LABELS_EMBED } from '../lib/gigLabels'
import { GigLabels } from '../components/gig/parts'
import GigLabelFields from '../components/gig/GigLabelFields'

// Home of a workspace:
//   /me           My work: every gig you're on, at any company, with your role on each
//   /org/:orgId   An organisation's gigs; ?panel=members|settings and ?new=gig open dialogs
// Both take ?view=calendar.
export default function Dashboard() {
  const { orgId } = useParams()
  const { user, profile } = useAuth()
  const { orgs, loading: loadingOrgs, setWorkspace, refresh, roleIn } = useWorkspace()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  useI18n() // re-render on language change
  const mode = orgId ? 'org' : 'me'
  const org = orgId ? orgs.find(o => o.id === orgId) : null
  const role = orgId ? roleIn(orgId) : null

  const [gigs, setGigs] = useState([])
  const [loadingGigs, setLoadingGigs] = useState(true)
  const [savedAt, setSavedAt] = useState(null)
  const [clashIds, setClashIds] = useState(() => new Set()) // My work: gigs that overlap another booking
  const [gigFilter, setGigFilter] = useState('upcoming')
  const [gigSearch, setGigSearch] = useState('')
  const { simple } = useSimpleMode()
  const [showAll, setShowAll] = useState(false) // simple mode: the full list instead of the next gig
  const view = params.get('view') === 'calendar' ? 'calendar' : 'list'
  const panel = params.get('panel')
  const setParam = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value); else next.delete(key)
    setParams(next, { replace: key === 'view' })
  }

  // The address decides the workspace (so links and the back button work)
  useEffect(() => {
    if (loadingOrgs) return
    if (mode === 'me') setWorkspace(MY_WORK)
    else if (org) setWorkspace(org.id)
  }, [mode, org, loadingOrgs, setWorkspace])

  const load = useCallback(async () => {
    if (!user) return
    setLoadingGigs(true)
    const key = mode === 'me' ? 'me.gigs' : `dashboard.gigs.${orgId}`
    let rows, error
    if (mode === 'me') {
      const [mine, companies, bookings] = await Promise.all([
        supabase.from('gig_members').select(`role, function_title, call_time, gigs(*, ${GIG_LABELS_EMBED})`).eq('user_id', user.id),
        supabase.rpc('my_gig_companies'),
        supabase.from('reservations').select('id, gig_id, period, status')
          .eq('resource_type', 'person').eq('resource_id', user.id).neq('status', 'cancelled'),
      ])
      error = mine.error
      const names = Object.fromEntries((companies.data || []).map(c => [c.org_id, c.name]))
      rows = myWorkGigs(mine.data, names)
      if (bookings.error) logger.error('dashboard', bookings.error, { step: 'bookings' })
      setClashIds(clashingGigIds(bookings.data))
    } else {
      const res = await supabase.from('gigs').select(`*, ${GIG_LABELS_EMBED}`).eq('org_id', orgId).order('start_date', { ascending: true, nullsFirst: false })
      error = res.error
      rows = res.data || []
    }
    if (error && isNetworkError(error)) {
      const snap = loadSnapshot(key)
      setGigs(snap?.data || [])
      setSavedAt(snap?.savedAt ?? null)
    } else {
      if (error) logger.error('dashboard', error, { step: 'gigs', mode })
      setGigs(rows)
      setSavedAt(null)
      if (!error) saveSnapshot(key, rows)
    }
    setLoadingGigs(false)
  }, [user, mode, orgId])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    window.addEventListener('online', load)
    return () => window.removeEventListener('online', load)
  }, [load])

  const firstName = (profile?.full_name || user?.email?.split('@')[0] || t('common.you')).split(' ')[0]
  const canCreateGig = role === 'admin' || role === 'member'
  const notMember = mode === 'org' && !loadingOrgs && !org

  return (
    <AppShell>
      <OfflineBanner savedAt={savedAt} />
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '28px 20px' }}>
        {notMember ? (
          <EmptyState icon={<Building2 size={32} color="var(--accent-text)" />} title={t('home.noAccessTitle')} body={t('home.noAccessBody')}
            action={t('nav.myWork')} onAction={() => navigate('/me')} />
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '24px' }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '0 0 4px 0' }}>{t('dash.welcome', { name: firstName })}</p>
                <h1 style={{ fontSize: '26px', fontWeight: 800, margin: 0, letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  {mode === 'me' ? t('nav.myWork') : org?.name || '…'}
                  {role && <RoleChip role={role} />}
                  <PageHelp page="home" />
                </h1>
                <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '6px 0 0' }}>
                  {mode === 'me' ? t('home.myWorkIntro') : role ? t(`nav.roleDesc.${role}`) : ''}
                </p>
              </div>
              {mode === 'org' && canCreateGig && (
                <button onClick={() => setParam('new', 'gig')} style={btnPrimary}><Plus size={15} /> {t('dash.newGig')}</button>
              )}
            </div>

            {!loadingGigs && !loadingOrgs && (mode === 'me' || (org && role === 'admin')) && <FirstSteps mode={mode} org={org} gigCount={gigs.length} />}
            {mode === 'me' && <AvailabilityRequests />}

            {(loadingGigs || loadingOrgs) ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
                <Loader2 size={24} color="var(--accent-text)" style={{ animation: 'spin 1s linear infinite' }} />
              </div>
            ) : gigs.length === 0 ? (
              mode === 'me' ? (
                orgs.length === 0 ? (
                  <EmptyState icon={<Building2 size={32} color="var(--accent-text)" />} title={t('dash.emptyOrgTitle')} body={t('dash.emptyOrgBody')}
                    action={t('dash.createOrg')} onAction={() => navigate('/orgs?new=1')} />
                ) : (
                  <EmptyState icon={<Briefcase size={32} color="var(--accent-text)" />} title={t('home.noAssignedTitle')} body={t('home.noAssignedBody')}
                    action={t('home.openOrg', { org: orgs[0].name })} onAction={() => { setWorkspace(orgs[0].id); navigate(homePath(orgs[0].id)) }} guide="crew-unavailable" />
                )
              ) : (
                <EmptyState icon={<Calendar size={32} color="var(--accent-text)" />} title={t('dash.emptyGigsTitle')} body={t('dash.emptyGigsBody')}
                  action={canCreateGig ? t('dash.createFirstGig') : null} onAction={() => setParam('new', 'gig')} guide={canCreateGig ? 'pm-create-gig' : null} />
              )
            ) : (
              mode === 'me' && simple && !showAll ? <SimpleHome gigs={gigs} onShowAll={() => setShowAll(true)} /> :
              <GigList gigs={gigs} view={view} setView={v => setParam('view', v === 'calendar' ? 'calendar' : null)}
                filter={gigFilter} setFilter={setGigFilter} search={gigSearch} setSearch={setGigSearch}
                showCompany={mode === 'me'} clashIds={mode === 'me' ? clashIds : null} onOpen={gig => navigate(`/gig/${gig.id}`)} />
            )}
          </>
        )}
      </div>

      {mode === 'org' && org && panel === 'members' && (
        <OrgMembersModal org={org} onClose={() => setParam('panel', null)} onChanged={refresh} />
      )}
      {mode === 'org' && org && panel === 'settings' && role === 'admin' && (
        <OrgSettingsModal org={org} onClose={() => setParam('panel', null)} onChanged={refresh}
          onDeleted={async () => { await refresh(); setWorkspace(MY_WORK); navigate('/me', { replace: true }) }} />
      )}
      {mode === 'org' && org && params.get('new') === 'gig' && canCreateGig && (
        <NewGigModal orgId={org.id} onClose={() => setParam('new', null)} onCreated={gig => navigate(`/gig/${gig.id}`)} />
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } } @keyframes fadeIn { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }`}</style>
    </AppShell>
  )
}

function NewGigModal({ orgId, onClose, onCreated }) {
  const { user } = useAuth()
  const [form, setForm] = useState({ name: '', venue: '', start_date: '', end_date: '', description: '', status: 'confirmed', custom_status_id: null, gig_type_id: null })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const labels = useGigLabels(orgId)
  // With its own statuses, start on the organisation's first one meaning "confirmed"
  useEffect(() => {
    const first = labels.statuses.find(s => s.base_status === 'confirmed') || labels.statuses[0]
    if (first) setForm(f => (f.custom_status_id ? f : { ...f, custom_status_id: first.id, status: first.base_status }))
  }, [labels.statuses])

  async function create() {
    if (!form.name.trim()) return
    setSaving(true)
    setError('')
    // Empty date inputs must be sent as null, not ''; the creator becomes the gig's PM (trigger)
    const { data, error: err } = await supabase.from('gigs').insert({
      ...form, name: form.name.trim(), start_date: form.start_date || null, end_date: form.end_date || null,
      org_id: orgId, created_by: user.id,
    }).select('id').single()
    setSaving(false)
    if (err) {
      logger.error('dashboard', err, { step: 'createGig' })
      return setError(userMessage(err))
    }
    onCreated(data)
  }

  return (
    <Modal title={t('dash.newGig')} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <FieldLabel label={`${t('gigForm.name')} *`}>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder={t('gigForm.namePlaceholder')} style={modalInput} autoFocus />
        </FieldLabel>
        <FieldLabel label={t('gigForm.venue')}>
          <input value={form.venue} onChange={e => setForm(f => ({ ...f, venue: e.target.value }))}
            placeholder={t('gigForm.venuePlaceholder')} style={modalInput} />
        </FieldLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '12px' }}>
          <FieldLabel label={t('gigForm.start')}>
            <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} style={modalInput} />
          </FieldLabel>
          <FieldLabel label={t('gigForm.end')}>
            <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} style={modalInput} />
          </FieldLabel>
        </div>
        <OwnClashWarning startDate={form.start_date} endDate={form.end_date} />
        <GigLabelFields idPrefix="ng" labels={labels} value={form} onChange={patch => setForm(f => ({ ...f, ...patch }))} />
        <FieldLabel label={t('gigForm.description')}>
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder={t('gigForm.descriptionPlaceholder')} rows={3} style={{ ...modalInput, resize: 'vertical', lineHeight: '1.5' }} />
        </FieldLabel>
        {error && (
          <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'color-mix(in srgb, var(--danger) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--danger) 20%, transparent)', color: 'var(--danger)', fontSize: '13px', lineHeight: '1.5' }}>
            {error}
          </div>
        )}
        <button onClick={create} disabled={saving || !form.name.trim()} style={btnModal}>
          {saving ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <ArrowRight size={16} />}
          {t('dash.createGig')}
        </button>
      </div>
    </Modal>
  )
}

function GigList({ gigs, view, setView, filter, setFilter, search, setSearch, onOpen, showCompany, clashIds }) {
  const [labelFilter, setLabelFilter] = useState({ status: '', type: '' })
  // The organisations' own statuses and types on these gigs, to filter by
  const options = useMemo(() => {
    const statuses = new Map(), types = new Map()
    for (const g of gigs) {
      if (g.custom_status?.id) statuses.set(g.custom_status.id, g.custom_status.name)
      if (g.gig_type?.id) types.set(g.gig_type.id, g.gig_type.name)
    }
    return { statuses: [...statuses], types: [...types] }
  }, [gigs])
  const byLabel = g => (!labelFilter.status || g.custom_status_id === labelFilter.status) && (!labelFilter.type || g.gig_type_id === labelFilter.type)
  const counts = countByBucket(gigs.filter(byLabel))
  const visible = filterGigs(gigs, filter, search).filter(byLabel)
  const filterSelect = { padding: '7px 10px', borderRadius: '10px', fontSize: '13px', color: 'var(--text)', maxWidth: '100%',
    background: 'color-mix(in srgb, var(--shade) 30%, transparent)', border: '1px solid color-mix(in srgb, var(--fg) min(100%, calc(7% * var(--line-k))), transparent)' }
  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '14px' }}>
        <div role="group" aria-label="View" style={{ display: 'flex', gap: '2px', background: 'color-mix(in srgb, var(--shade) 30%, transparent)', borderRadius: '10px', padding: '3px' }}>
          {[['list', <List key="i" size={15} />, t('dash.viewList')], ['calendar', <CalendarDays key="i" size={15} />, t('dash.viewCalendar')]].map(([v, icon, labelText]) => (
            <button key={v} onClick={() => setView(v)} aria-pressed={view === v} aria-label={labelText} title={labelText} style={{
              padding: '6px 9px', borderRadius: '7px', border: 'none', cursor: 'pointer', display: 'flex',
              background: view === v ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent', color: view === v ? 'var(--accent-text)' : 'var(--muted)'
            }}>{icon}</button>
          ))}
        </div>
        {view === 'list' && <div role="tablist" aria-label="Filter gigs" style={{ display: 'flex', gap: '4px', background: 'color-mix(in srgb, var(--shade) 30%, transparent)', borderRadius: '10px', padding: '3px', overflowX: 'auto', overflowY: 'hidden' }}>
          {GIG_FILTERS.map(f => (
            <button key={f.value} role="tab" aria-selected={filter === f.value} onClick={() => setFilter(f.value)} style={{
              padding: '6px 12px', borderRadius: '7px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap',
              background: filter === f.value ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
              color: filter === f.value ? 'var(--accent-text)' : 'var(--muted)'
            }}>
              {t(`gigFilter.${f.value}`)} <span style={{ opacity: 0.7 }}>{counts[f.value]}</span>
            </button>
          ))}
        </div>}
        <label style={{ flex: '1 1 180px', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px',
          background: 'color-mix(in srgb, var(--shade) 30%, transparent)', border: '1px solid color-mix(in srgb, var(--fg) min(100%, calc(7% * var(--line-k))), transparent)', borderRadius: '10px' }}>
          <Search size={14} color="var(--muted)" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('dash.searchPlaceholder')} aria-label={t('dash.searchPlaceholder')}
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontSize: '14px', minWidth: 0 }} />
        </label>
        {options.statuses.length > 0 && (
          <select value={labelFilter.status} onChange={e => setLabelFilter(f => ({ ...f, status: e.target.value }))} aria-label={t('dash.filterStatus')} style={filterSelect}>
            <option value="">{t('dash.allStatuses')}</option>
            {options.statuses.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        )}
        {options.types.length > 0 && (
          <select value={labelFilter.type} onChange={e => setLabelFilter(f => ({ ...f, type: e.target.value }))} aria-label={t('dash.filterType')} style={filterSelect}>
            <option value="">{t('dash.allTypes')}</option>
            {options.types.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        )}
      </div>
      {view === 'calendar' ? (
        <GigCalendar gigs={filterGigs(gigs, 'all', search).filter(g => g.status !== 'archived' && byLabel(g))} clashIds={clashIds} onOpen={onOpen} />
      ) : visible.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: '14px', textAlign: 'center', padding: '40px 0' }}>
          {search ? t('dash.noMatch') : t(`dash.noGigs.${filter}`)}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {visible.map(gig => <GigCard key={gig.id} gig={gig} showCompany={showCompany} clash={!!clashIds?.has(gig.id)} onOpen={() => onOpen(gig)} />)}
        </div>
      )}
    </div>
  )
}

function GigCard({ gig, onOpen, showCompany, clash }) {
  return (
    <button onClick={onOpen} className="gig-card"
      style={{
        width: '100%', textAlign: 'left', color: 'var(--text)', font: 'inherit',
        background: 'color-mix(in srgb, var(--fg) min(100%, calc(3% * var(--line-k))), transparent)', border: '1px solid color-mix(in srgb, var(--fg) min(100%, calc(7% * var(--line-k))), transparent)',
        borderRadius: '14px', padding: '16px 18px', cursor: 'pointer', transition: 'all 0.2s',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px'
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent) 25%, transparent)'; e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 4%, transparent)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--fg) min(100%, calc(7% * var(--line-k))), transparent)'; e.currentTarget.style.background = 'color-mix(in srgb, var(--fg) min(100%, calc(3% * var(--line-k))), transparent)' }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: '16px' }}>{gig.name}</span>
          <GigLabels gig={gig} />
          {clash && (
            <span title={t('clash.doubleBookingHint')} style={{
              fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '20px', color: 'var(--warn)', background: 'color-mix(in srgb, var(--warn) 12%, transparent)',
              display: 'inline-flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase', letterSpacing: '0.05em',
            }}><AlertTriangle size={11} /> {t('clash.doubleBooking')}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '6px 16px', flexWrap: 'wrap', fontSize: '13px', color: 'var(--muted)' }}>
          {showCompany && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--soft)' }}>
              <Building2 size={12} /> {gig.company || t('home.otherCompany')}
              <span style={{ color: 'var(--accent-text)', fontWeight: 600 }}>· {gig.myFunction || t(`gigRoleLong.${gig.myGigRole || 'crew'}`)}</span>
            </span>
          )}
          {gig.venue && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={12} /> {gig.venue}</span>}
          {gig.start_date && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Calendar size={12} />
              {fmt(gig.start_date, 'dd MMM yyyy')}
              {gig.end_date && gig.end_date !== gig.start_date && ` → ${fmt(gig.end_date, 'dd MMM')}`}
            </span>
          )}
        </div>
      </div>
      <ChevronRight size={18} color="var(--muted)" />
    </button>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'calc(24px + var(--safe-top)) 24px 24px'
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} style={{
        background: 'var(--panel)', border: '1px solid color-mix(in srgb, var(--fg) min(100%, calc(10% * var(--line-k))), transparent)', borderRadius: '18px', padding: '28px', width: '100%', maxWidth: '480px',
        animation: 'fadeIn 0.2s ease', maxHeight: 'calc(100vh - 32px - var(--safe-top))', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>{title}</h2>
          <button onClick={onClose} aria-label={t('common.close')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '4px', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// The label wraps its field, so tapping the words focuses it and screen readers name it
function FieldLabel({ label, children }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>{label}</span>
      {children}
    </label>
  )
}

const btnPrimary = {
  display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '10px 18px', borderRadius: '10px', border: 'none', cursor: 'pointer',
  background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', color: 'var(--on-accent)', fontWeight: 700, fontSize: '14px',
  fontFamily: 'var(--font-ui)', boxShadow: '0 4px 16px color-mix(in srgb, var(--accent) 25%, transparent)', transition: 'all 0.2s'
}
const btnModal = { ...btnPrimary, width: '100%', justifyContent: 'center', padding: '13px', fontSize: '15px', marginTop: '4px' }
const modalInput = {
  width: '100%', padding: '10px 13px', background: 'color-mix(in srgb, var(--shade) 40%, transparent)', border: '1px solid color-mix(in srgb, var(--fg) min(100%, calc(9% * var(--line-k))), transparent)',
  borderRadius: '9px', color: 'var(--text)', fontSize: '14px', outline: 'none',
}
