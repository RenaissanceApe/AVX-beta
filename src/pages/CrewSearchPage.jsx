import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Loader2, Search, MapPin, X, CalendarCheck, Megaphone, Handshake, Users, Flag, Lock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { track } from '../lib/usage'
import { useWorkspace } from '../lib/WorkspaceContext'
import { FUNCTIONS, LANGUAGES, languageName } from '../lib/crewProfile'
import { RADII, EMPTY_FILTERS, searchArgs, gigFilters, crewError, fromSaved } from '../lib/crewSearch'
import { useI18n } from '../i18n'
import { Modal, btn, btnPrimary, iconBtn, input, label, card, colors, tint } from '../components/ui'
import AppShell from '../components/shell/AppShell'
import { PageHelp } from '../components/help/HelpParts'
import CrewProfileCard from '../components/CrewProfileCard'
import PlaceFinder from '../components/PlaceFinder'
import ReportModal from '../components/ReportModal'
import SavedCrewSearches from '../components/SavedCrewSearches'
import { trustError } from '../lib/trust'

const hint = { fontSize: '12px', color: colors.muted, lineHeight: 1.5 }
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' }
const badge = (tone) => ({ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '999px', fontSize: '12px', fontWeight: 600,
  background: tint(tone, 14), color: tone })

// Find crew (docs/CREW_NETWORK.md, N2): an organisation's admins and members search the crew who
// switched their profile on (and chose to be seen by companies), by function, place and dates, and
// ask them about a gig or offer them a place. Opened from the menu or from a gig's Crew tab.
//   /org/:orgId/crew (?gig=…)
export default function CrewSearchPage() {
  const { orgId } = useParams()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { notify } = useToast()
  const { t, lang, fmt } = useI18n()
  const { orgs, roleIn, loading, setWorkspace } = useWorkspace()
  const role = roleIn(orgId)
  const org = orgs.find(o => o.id === orgId)
  const canSearch = role === 'admin' || role === 'member'
  const [gigs, setGigs] = useState([])
  const [gigId, setGigId] = useState(params.get('gig') || '')
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [result, setResult] = useState(null) // { results, total, more }
  const [reporting, setReporting] = useState(null)

  // A company that has worked with the person confirms (or withdraws) one of their certificates
  async function confirmCert(person, cert, on) {
    const { data, error } = await supabase.rpc('confirm_certificate', { p_org: orgId, p_user: person.user_id, p_cert: cert.id, p_confirm: on })
    if (error) { logger.error('crewSearch', error, { step: 'confirmCert' }); const k = trustError(error); return notify(k ? t(k) : userMessage(error), 'error') }
    setResult(r => ({ ...r, results: r.results.map(x => x.user_id !== person.user_id ? x
      : { ...x, certificates: x.certificates.map(c => c.id === cert.id ? data : c) }) }))
    notify(t(on ? 'trust.cert.confirmed' : 'trust.cert.unconfirmed', { name: cert.name }), 'success')
    track(on ? 'trust:confirmCert' : 'trust:unconfirmCert')
  }
  const [searching, setSearching] = useState(false)
  const [contact, setContact] = useState(null) // { person, kind }
  const [contacted, setContacted] = useState({}) // user_id -> kind
  useEffect(() => { setWorkspace(orgId) }, [orgId, setWorkspace])

  const gig = gigs.find(g => g.id === gigId) || null
  useEffect(() => {
    if (!canSearch) return
    const today = new Date().toISOString().slice(0, 10)
    supabase.from('gigs').select('id, name, venue, start_date, end_date, status').eq('org_id', orgId).neq('status', 'archived')
      .or(`end_date.gte.${today},and(end_date.is.null,start_date.gte.${today})`).order('start_date').limit(100)
      .then(({ data, error }) => {
        if (error) return logger.error('crewSearch', error, { step: 'gigs' })
        setGigs(data || [])
      })
  }, [canSearch, orgId])
  // A gig chosen (or opened from one): its dates become the dates searched
  useEffect(() => { if (gig) setFilters(f => ({ ...f, ...gigFilters(gig) })) }, [gig])

  const set = patch => setFilters(f => ({ ...f, ...patch }))

  async function search(e, offset = 0, f = filters) {
    e?.preventDefault()
    setSearching(true)
    const { data, error } = await supabase.rpc('search_crew', searchArgs(orgId, f, offset))
    setSearching(false)
    if (error) {
      logger.error('crewSearch', error, { step: 'search' })
      const key = crewError(error)
      return notify(key ? t(key) : userMessage(error), 'error')
    }
    setResult(r => offset && r ? { ...data, results: [...r.results, ...data.results] } : data)
    track('crew:search')
  }

  // A saved search: its filters (keeping the dates chosen), then search
  function applySaved(saved) {
    const next = fromSaved(saved.filters, filters)
    setFilters(next)
    search(null, 0, next)
  }

  if (loading) return <AppShell><div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}><Loader2 size={24} color={colors.accentText} style={{ animation: 'spin 1s linear infinite' }} /></div></AppShell>
  if (!canSearch) return (
    <AppShell>
      <div style={{ maxWidth: '360px', margin: '80px auto', textAlign: 'center', padding: '0 16px' }}>
        <p style={{ color: colors.muted, fontSize: '14px', lineHeight: 1.6, marginBottom: '20px' }}>{t('crewSearch.noAccess')}</p>
        <button onClick={() => navigate('/dashboard')} style={btnPrimary}><ArrowLeft size={14} /> {t('common.backToDashboard')}</button>
      </div>
    </AppShell>
  )

  return (
    <AppShell>
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 16px 48px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <div style={{ fontSize: '12px', color: colors.muted, overflowWrap: 'anywhere' }}>{org?.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.4px' }}>{t('crewSearch.title')}</h1>
            <PageHelp page="crew-search" />
          </div>
          <p style={{ ...hint, fontSize: '13px', marginTop: '4px' }}>{t('crewSearch.intro')}</p>
        </div>

        <SavedCrewSearches orgId={orgId} filters={filters} onApply={applySaved} openId={params.get('search')} />
        <form onSubmit={search} noValidate style={{ ...card, padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }} aria-label={t('crewSearch.filters')}>
          <div>
            <label style={label} htmlFor="cs-gig">{t('crewSearch.forGig')}</label>
            <select id="cs-gig" value={gigId} onChange={e => setGigId(e.target.value)} style={{ ...input, cursor: 'pointer' }}>
              <option value="">{t('crewSearch.noGig')}</option>
              {gigs.map(g => <option key={g.id} value={g.id}>{g.name}{g.start_date ? ` · ${fmt(g.start_date, 'd MMM')}` : ''}</option>)}
            </select>
            <p style={{ ...hint, marginTop: '6px' }}>{gig ? t('crewSearch.forGigHint') : t('crewSearch.noGigHint')}</p>
          </div>
          <div style={grid}>
            <div>
              <label style={label} htmlFor="cs-fn">{t('crewSearch.function')}</label>
              <select id="cs-fn" value={filters.fn} onChange={e => set({ fn: e.target.value })} style={{ ...input, cursor: 'pointer' }}>
                <option value="">{t('crewSearch.anyFunction')}</option>
                {FUNCTIONS.map(f => ({ f, n: t(`crewFn.${f}`) })).sort((a, b) => a.n.localeCompare(b.n, lang)).map(({ f, n }) => <option key={f} value={f}>{n}</option>)}
              </select>
            </div>
            <div>
              <label style={label} htmlFor="cs-text">{t('crewSearch.words')}</label>
              <input id="cs-text" value={filters.text} onChange={e => set({ text: e.target.value })} placeholder={t('crewSearch.wordsPlaceholder')} style={input} />
            </div>
            <div>
              <label style={label} htmlFor="cs-lang">{t('crewSearch.language')}</label>
              <select id="cs-lang" value={filters.language} onChange={e => set({ language: e.target.value })} style={{ ...input, cursor: 'pointer' }}>
                <option value="">{t('crewSearch.anyLanguage')}</option>
                {LANGUAGES.map(l => ({ l, n: languageName(l, lang) })).sort((a, b) => a.n.localeCompare(b.n, lang)).map(({ l, n }) => <option key={l} value={l}>{n}</option>)}
              </select>
            </div>
            <div>
              <label style={label} htmlFor="cs-cert">{t('crewSearch.certificate')}</label>
              <input id="cs-cert" value={filters.certificate} onChange={e => set({ certificate: e.target.value })} placeholder="IPAF" style={input} />
            </div>
          </div>
          <div style={grid}>
            <div style={{ gridColumn: '1 / -1' }}>
              {filters.place ? (
                <div>
                  <span style={label}>{t('crewSearch.near')}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 600 }}><MapPin size={14} aria-hidden="true" /> {filters.place.label}</span>
                    <button type="button" onClick={() => set({ place: null })} aria-label={t('crewSearch.clearPlace')} style={iconBtn}><X size={15} /></button>
                    <label style={{ ...hint, display: 'flex', alignItems: 'center', gap: '6px' }} htmlFor="cs-km">{t('crewSearch.within')}
                      <select id="cs-km" value={filters.km} onChange={e => set({ km: Number(e.target.value) })} style={{ ...input, width: 'auto', padding: '6px 8px', cursor: 'pointer' }}>
                        {RADII.map(r => <option key={r} value={r}>{t('crewProfile.travelKm', { km: r })}</option>)}
                      </select>
                    </label>
                  </div>
                  <p style={{ ...hint, marginTop: '6px' }}>{t('crewSearch.nearHint')}</p>
                </div>
              ) : (
                <PlaceFinder key={gig?.id || 'none'} id="cs-place" label={t('crewSearch.near')} hint={t('crewSearch.placeHint')} initialQuery={gig?.venue || ''}
                  onChoose={p => set({ place: p })} />
              )}
            </div>
            <div>
              <label style={label} htmlFor="cs-from">{t('crewSearch.from')}</label>
              <input id="cs-from" type="date" value={filters.from} onChange={e => set({ from: e.target.value })} style={input} />
            </div>
            <div>
              <label style={label} htmlFor="cs-to">{t('crewSearch.to')}</label>
              <input id="cs-to" type="date" value={filters.to} min={filters.from || undefined} onChange={e => set({ to: e.target.value })} style={input} />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: filters.from ? 'pointer' : 'default', opacity: filters.from ? 1 : 0.6 }}>
            <input type="checkbox" disabled={!filters.from} checked={filters.onlyFree && !!filters.from} onChange={e => set({ onlyFree: e.target.checked })} style={{ accentColor: 'var(--accent)' }} />
            {t('crewSearch.onlyFree')}
          </label>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="submit" disabled={searching} style={btnPrimary}>
              {searching ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={15} />} {t('crewSearch.search')}
            </button>
            <button type="button" onClick={() => { setFilters({ ...EMPTY_FILTERS, ...(gig ? gigFilters(gig) : {}) }); setResult(null) }} style={{ ...btn, background: 'transparent' }}>{t('crewSearch.reset')}</button>
          </div>
        </form>

        {result && (
          <section aria-labelledby="cs-results" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h2 id="cs-results" role="status" style={{ fontSize: '15px', fontWeight: 700 }}>{t('crewSearch.found', { count: result.total })}</h2>
            {result.total === 0 && <p style={hint}>{t('crewSearch.none')}</p>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: '12px' }}>
              {result.results.map(p => (
                <CrewProfileCard key={p.user_id} profile={p} name={p.name} orgId={orgId} onConfirm={p.worked_with > 0 ? (c, on) => confirmCert(p, c, on) : null}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '12px' }}>
                    {p.km != null && <span style={badge(colors.soft)}><MapPin size={12} aria-hidden="true" /> {t('crewSearch.kmAway', { km: p.km })}</span>}
                    {p.free === true && <span style={badge(colors.accentText)}><CalendarCheck size={12} aria-hidden="true" /> {t('crewSearch.free')}</span>}
                    {p.free === false && <span style={badge('var(--warn)')}>{t('crewSearch.busy')}</span>}
                    {p.worked_with > 0 && <span style={badge('var(--sky)')}><Users size={12} aria-hidden="true" /> {t('crewSearch.workedWith', { count: p.worked_with })}</span>}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
                    {p.contact_from === 'known' && !p.worked_with && !contacted[p.user_id] ? (
                      <span style={{ ...hint, display: 'inline-flex', gap: '6px', alignItems: 'center' }}><Lock size={13} aria-hidden="true" /> {t('trust.contact.onlyKnownShort')}</span>
                    ) : contacted[p.user_id] ? (
                      <span role="status" style={{ ...hint, color: colors.accentText }}>{t(`crewSearch.sent.${contacted[p.user_id]}`)}</span>
                    ) : (
                      <>
                        <button type="button" disabled={!gig} onClick={() => setContact({ person: p, kind: 'availability' })} style={btn}
                          aria-label={t('crewSearch.askNamed', { name: p.name || '' })}><CalendarCheck size={14} /> {t('crewSearch.ask')}</button>
                        <button type="button" disabled={!gig} onClick={() => setContact({ person: p, kind: 'offer' })} style={btn}
                          aria-label={t('crewSearch.offerNamed', { name: p.name || '' })}><Megaphone size={14} /> {t('crewSearch.offer')}</button>
                      </>
                    )}
                  </div>
                  {!gig && !contacted[p.user_id] && <p style={{ ...hint, marginTop: '6px' }}>{t('crewSearch.chooseGig')}</p>}
                  <button type="button" onClick={() => setReporting(p)} aria-label={t('trust.report.profileNamed', { name: p.name || '' })}
                    style={{ background: 'none', border: 'none', padding: 0, marginTop: '10px', font: 'inherit', fontSize: '12px', color: colors.muted, cursor: 'pointer', display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
                    <Flag size={12} aria-hidden="true" /> {t('trust.report.action')}
                  </button>
                </CrewProfileCard>
              ))}
            </div>
            {result.more && (
              <div><button type="button" onClick={e => search(e, result.results.length)} disabled={searching} style={btn}>
                {searching ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : null} {t('crewSearch.more')}
              </button></div>
            )}
            <p style={hint}>{t('crewSearch.privacy')}</p>
          </section>
        )}
      </div>
      {reporting && (
        <ReportModal kind="profile" target={reporting.user_id} name={reporting.name} blockUser={reporting.user_id}
          onClose={() => setReporting(null)}
          onReported={() => { setResult(r => ({ ...r, total: r.total - 1, results: r.results.filter(x => x.user_id !== reporting.user_id) })); setReporting(null) }} />
      )}
      {contact && gig && (
        <ContactModal gig={gig} person={contact.person} kind={contact.kind} defaultTitle={filters.fn ? t(`crewFn.${filters.fn}`) : ''}
          onClose={() => setContact(null)}
          onSent={() => { setContacted(c => ({ ...c, [contact.person.user_id]: contact.kind })); setContact(null) }} />
      )}
    </AppShell>
  )
}

function ContactModal({ gig, person, kind, defaultTitle, onClose, onSent }) {
  const { t, fmt } = useI18n()
  const { notify } = useToast()
  const [title, setTitle] = useState(defaultTitle)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const dates = gig.start_date ? (gig.end_date && gig.end_date !== gig.start_date ? `${fmt(gig.start_date, 'd MMM')} – ${fmt(gig.end_date, 'd MMM yyyy')}` : fmt(gig.start_date, 'd MMM yyyy')) : ''

  async function send(e) {
    e.preventDefault()
    if (kind === 'offer' && !title.trim()) return
    setSending(true)
    const { error } = await supabase.rpc('contact_crew', { p_gig: gig.id, p_user: person.user_id, p_kind: kind, p_title: kind === 'offer' ? title.trim() : null, p_message: message.trim() || null })
    setSending(false)
    if (error) {
      logger.error('crewSearch', error, { step: 'contact', kind })
      const key = crewError(error)
      return notify(key ? t(key) : userMessage(error), 'error')
    }
    notify(t(`crewSearch.sentToast.${kind}`, { name: person.name || '' }), 'success')
    track(`crew:contact:${kind}`)
    onSent()
  }

  return (
    <Modal title={kind === 'offer' ? t('crewSearch.offerTitle', { name: person.name || '' }) : t('crewSearch.askTitle', { name: person.name || '' })} onClose={onClose}>
      <form onSubmit={send} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <p style={{ fontSize: '14px', lineHeight: 1.5 }}><strong>{gig.name}</strong>{dates && <> · {dates}</>}{gig.venue && <> · {gig.venue}</>}</p>
        {kind === 'offer' && (
          <div>
            <label style={label} htmlFor="cs-offer-title">{t('crewSearch.offerAs')} *</label>
            <input id="cs-offer-title" value={title} onChange={e => setTitle(e.target.value)} maxLength={120} required style={input} />
          </div>
        )}
        <div>
          <label style={label} htmlFor="cs-message">{t('crewSearch.message')}</label>
          <textarea id="cs-message" rows={3} value={message} onChange={e => setMessage(e.target.value)} maxLength={500}
            placeholder={kind === 'offer' ? t('crewSearch.offerPlaceholder') : t('crewSearch.askPlaceholder')} style={{ ...input, resize: 'vertical' }} />
        </div>
        <p style={hint}>{kind === 'offer' ? t('crewSearch.offerHint') : t('crewSearch.askHint')}</p>
        <button type="submit" disabled={sending || (kind === 'offer' && !title.trim())} style={{ ...btnPrimary, justifyContent: 'center' }}>
          {sending ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : kind === 'offer' ? <Handshake size={15} /> : <CalendarCheck size={15} />}
          {' '}{kind === 'offer' ? t('crewSearch.sendOffer') : t('crewSearch.sendAsk')}
        </button>
        <Link to={`/gig/${gig.id}`} style={{ ...hint, color: colors.accentText }}>{t('crewSearch.openGig')}</Link>
      </form>
    </Modal>
  )
}
