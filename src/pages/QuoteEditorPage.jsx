import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Printer, Copy, LayoutTemplate, Trash2, Plus, CalendarPlus, ExternalLink, AlertTriangle, Download,
  History, Send, ListChecks, Package, Ban, RotateCcw,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { selectAll } from '../lib/selectAll'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { useI18n } from '../i18n'
import { Modal, btn, btnPrimary, iconBtn, input, label, colors, AvxLoader, MoreMenu, space, usePhone } from '../components/ui'
import PhaseEditor, { QUOTE_EDITOR_CSS } from '../components/quotes/PhaseEditor'
import QuoteDetails from '../components/quotes/QuoteDetails'
import QuoteInvoices from '../components/invoices/QuoteInvoices'
import QuoteSummary from '../components/quotes/QuoteSummary'
import { QuoteStatusBadge } from '../components/quotes/parts'
import { VersionsModal, SendQuoteModal } from '../components/quotes/QuoteSharing'
import GigPlanModal from '../components/quotes/GigPlanModal'
import LostReasonModal from '../components/quotes/LostReasonModal'
import QuoteAvailabilityModal from '../components/quotes/QuoteAvailability'
import { useWorkspace } from '../lib/WorkspaceContext'
import { useRateCard } from '../lib/useCrewRates'
import ContextThread from '../components/messages/ContextThread'
import { PageHelp } from '../components/help/HelpParts'
import {
  QUOTE_STATUSES, normalizeBody, quoteTotals, setAllVatRates, emptyPhase, cloneBody, quoteNumber, formatMoney, move, quoteDateRange, localISODate, snapshotFields,
} from '../lib/quotes'

// Fields of the quotes table the editor may change (the database sets the rest)
const EDITABLE = [
  'title', 'status', 'language', 'currency', 'client_name', 'client_company', 'client_email', 'client_address', 'client_tax_id',
  'issue_date', 'valid_until', 'intro', 'terms', 'vat_rate', 'discount_pct', 'show_line_prices', 'gig_id',
  'payment_terms', 'manager_name', 'client_id', 'lost_reason', 'lost_note',
]
const SAVE_DELAY = 1000

export default function QuoteEditorPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const { orgs } = useWorkspace()
  const { notify } = useToast()
  const { t, lang } = useI18n()
  const phone = usePhone()
  const navigate = useNavigate()

  const [quote, setQuote] = useState(null)
  // The crew rate card: only admins and members can read it, so for anyone else no costs show
  const rateCard = useRateCard(quote?.org_id)
  const [body, setBody] = useState({ phases: [] })
  const [role, setRole] = useState(null)
  const [gigs, setGigs] = useState([])
  const [templates, setTemplates] = useState([])
  const [prefix, setPrefix] = useState('Q')
  const [dueDays, setDueDays] = useState(30)
  const [priceItems, setPriceItems] = useState([])
  const [clients, setClients] = useState([])
  const [notFound, setNotFound] = useState(false)
  const [tab, setTab] = useState('details')
  const [saveState, setSaveState] = useState('saved') // saved | dirty | saving | error | conflict
  const [modal, setModal] = useState(null) // { kind: 'saveTemplate', body } | { kind: 'insertTemplate' }

  // Refs so the save loop always sends the latest edits and never overlaps itself
  const latest = useRef({ quote: null, body: null })
  const version = useRef(0)
  const editSeq = useRef(0)
  const saving = useRef(false)
  const timer = useRef(null)
  const blocked = useRef(false) // after a conflict nothing more is saved

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: q, error } = await supabase.from('quotes').select('*').eq('id', id).maybeSingle()
      if (cancelled) return
      if (error || !q) {
        if (error) logger.error('quote', error, { step: 'load', quoteId: id })
        return setNotFound(true)
      }
      const [roleRes, gigsRes, tplRes, orgRes, pricesRes, clientsRes] = await Promise.all([
        supabase.from('org_members').select('role').eq('org_id', q.org_id).eq('user_id', user.id).maybeSingle(),
        selectAll(() => supabase.from('gigs').select('id, name, start_date, org_id').eq('org_id', q.org_id).order('start_date', { ascending: false, nullsFirst: false }).order('id')),
        supabase.from('quote_templates').select('id, name, description, body').eq('org_id', q.org_id).order('name'),
        supabase.from('organisations').select('quote_number_prefix, invoice_due_days').eq('id', q.org_id).maybeSingle(),
        selectAll(() => supabase.from('price_items').select('*').eq('org_id', q.org_id).is('archived_at', null).order('name').order('id')),
        selectAll(() => supabase.from('clients').select('id, org_id, name, contact_name, email, address, tax_id, archived_at').eq('org_id', q.org_id).order('name').order('id')),
      ])
      if (cancelled) return
      const b = normalizeBody(q.body)
      version.current = q.version
      latest.current = { quote: q, body: b }
      setQuote(q)
      setBody(b)
      setRole(roleRes.data?.role ?? null)
      setGigs(gigsRes.data || [])
      setTemplates(tplRes.data || [])
      setPrefix(orgRes.data?.quote_number_prefix ?? 'Q')
      setDueDays(orgRes.data?.invoice_due_days ?? 30)
      setPriceItems(pricesRes.data || [])
      setClients(clientsRes.data || [])
      setTab(b.phases[0] ? `phase:${b.phases[0].id}` : 'details')
    }
    load()
    return () => { cancelled = true }
  }, [id, user.id])

  const save = useCallback(async () => {
    clearTimeout(timer.current)
    if (blocked.current || !latest.current.quote) return
    if (saving.current) { timer.current = setTimeout(save, 300); return }
    saving.current = true
    const seq = editSeq.current
    const { quote: q, body: b } = latest.current
    const clean = normalizeBody(b)
    const payload = Object.fromEntries(EDITABLE.map(k => [k, q[k]]))
    Object.assign(payload, {
      title: (q.title || '').trim() || t('quotes.untitled'),
      issue_date: q.issue_date || localISODate(),
      valid_until: q.valid_until || null,
      vat_rate: Number(q.vat_rate) || 0,
      discount_pct: Math.min(100, Math.max(0, Number(q.discount_pct) || 0)),
      body: clean,
      total_net: quoteTotals({ ...q, body: clean }).net,
    })
    setSaveState('saving')
    const { data, error } = await supabase.from('quotes').update(payload).eq('id', id).eq('version', version.current).select('version')
    saving.current = false
    if (error) {
      logger.error('quote', error, { step: 'save', quoteId: id })
      setSaveState('error')
      notify(userMessage(error), 'error')
      return
    }
    if (!data?.length) {
      blocked.current = true
      setSaveState('conflict')
      return
    }
    version.current = data[0].version
    setSaveState(editSeq.current === seq ? 'saved' : 'dirty')
    if (editSeq.current !== seq) timer.current = setTimeout(save, SAVE_DELAY)
  }, [id, notify, t])

  function markDirty() {
    editSeq.current += 1
    setSaveState(s => (s === 'conflict' ? s : 'dirty'))
    clearTimeout(timer.current)
    timer.current = setTimeout(save, SAVE_DELAY)
  }
  function updateQuote(changes) {
    setQuote(q => {
      const next = { ...q, ...changes }
      latest.current.quote = next
      return next
    })
    markDirty()
  }
  // Declined asks why (optional); any other status drops the reason, as the database does
  function changeStatus(status) {
    if (status === 'declined') {
      updateQuote({ status })
      setModal({ kind: 'lost' })
    } else updateQuote({ status, lost_reason: null, lost_note: null })
  }
  function updateBody(next) {
    latest.current.body = next
    setBody(next)
    markDirty()
  }

  // Unsaved changes: warn before closing the tab, and save when leaving the page
  useEffect(() => {
    const onBeforeUnload = e => {
      if (saveState === 'dirty' || saveState === 'saving') { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [saveState])
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); save() } }, [save])

  async function flushThen(fn) {
    if (saveState === 'dirty' || saveState === 'saving') await save()
    fn()
  }
  // For versions and sending: save pending edits, then hand over the quote as it is now
  async function prepare() {
    if (timer.current || saving.current) await save()
    return { quote: latest.current.quote, body: latest.current.body }
  }

  const totals = useMemo(() => (quote ? quoteTotals({ ...quote, body }) : null), [quote, body])

  if (notFound) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center' }}>
      <div style={{ maxWidth: '360px' }}>
        <p style={{ color: colors.muted, fontSize: '14px', lineHeight: 1.6, marginBottom: '20px' }}>{t('quote.notFound')}</p>
        <button onClick={() => navigate('/dashboard')} style={btnPrimary}><ArrowLeft size={14} /> {t('common.backToDashboard')}</button>
      </div>
    </div>
  )
  if (!quote) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <AvxLoader size={26} color={colors.accentText} />
    </div>
  )

  const phaseIndex = tab.startsWith('phase:') ? body.phases.findIndex(p => `phase:${p.id}` === tab) : -1
  const phase = phaseIndex >= 0 ? body.phases[phaseIndex] : null
  const canDelete = role === 'admin' || quote.created_by === user.id
  const linkedGig = gigs.find(g => g.id === quote.gig_id)

  function addPhase() {
    const p = emptyPhase(t('quote.phaseN', { n: body.phases.length + 1 }))
    updateBody({ phases: [...body.phases, p] })
    setTab(`phase:${p.id}`)
  }
  function updatePhase(next) {
    updateBody({ phases: body.phases.map((p, i) => (i === phaseIndex ? next : p)) })
  }
  function removePhase() {
    if (!window.confirm(t('quote.confirmRemovePhase', { name: phase.name || t('quote.phaseN', { n: phaseIndex + 1 }) }))) return
    const phases = body.phases.filter((_, i) => i !== phaseIndex)
    updateBody({ phases })
    setTab(phases[Math.max(0, phaseIndex - 1)] ? `phase:${phases[Math.max(0, phaseIndex - 1)].id}` : 'details')
  }
  function duplicatePhase() {
    const [copy] = cloneBody({ phases: [phase] }, { keepDates: true }).phases
    copy.name = t('quote.copyOf', { name: phase.name || t('quote.phaseN', { n: phaseIndex + 1 }) })
    const phases = [...body.phases.slice(0, phaseIndex + 1), copy, ...body.phases.slice(phaseIndex + 1)]
    updateBody({ phases })
    setTab(`phase:${copy.id}`)
  }
  function insertTemplate(tpl) {
    const added = cloneBody(tpl.body).phases
    if (!added.length) return
    updateBody({ phases: [...body.phases, ...added] })
    setTab(`phase:${added[0].id}`)
    setModal(null)
    notify(t('quote.templateInserted', { name: tpl.name, count: added.length }), 'success')
  }

  // The client typed on this quote, added to the contacts directory and linked
  async function saveClientToContacts() {
    const trimmed = v => (v || '').trim() || null
    const company = trimmed(quote.client_company)
    const { data, error } = await supabase.from('clients').insert({
      org_id: quote.org_id, name: (company || trimmed(quote.client_name)).slice(0, 200),
      contact_name: company ? trimmed(quote.client_name)?.slice(0, 120) || null : null,
      email: trimmed(quote.client_email), address: trimmed(quote.client_address), tax_id: trimmed(quote.client_tax_id),
    }).select('id, org_id, name, contact_name, email, address, tax_id, archived_at').single()
    if (error) return notify(userMessage(error), 'error')
    setClients(list => [...list, data].sort((a, b) => a.name.localeCompare(b.name)))
    updateQuote({ client_id: data.id })
    notify(t('contacts.savedToContacts', { name: data.name }), 'success')
  }

  async function duplicateQuote() {
    await flushThen(async () => {
      const copy = Object.fromEntries(EDITABLE.map(k => [k, quote[k]]))
      const { data, error } = await supabase.from('quotes').insert({
        ...copy, org_id: quote.org_id, status: 'draft', gig_id: quote.gig_id, title: t('quote.copyOf', { name: quote.title }).slice(0, 200),
        issue_date: localISODate(), valid_until: null, body: cloneBody(body, { keepDates: true }), total_net: totals.net,
      }).select('id').single()
      if (error) return notify(userMessage(error), 'error')
      notify(t('quote.duplicated'), 'success')
      navigate(`/quote/${data.id}`)
    })
  }

  async function deleteQuote() {
    if (!window.confirm(t('quote.confirmDelete', { number: quoteNumber(quote, prefix), title: quote.title }))) return
    clearTimeout(timer.current)
    blocked.current = true
    // Goes to Recently deleted for 15 days (quote bin, issue 124); restore_quote brings it back
    const { error } = await supabase.rpc('remove_quote', { p_quote: id })
    if (error) {
      blocked.current = false
      return notify(userMessage(error), 'error')
    }
    timer.current = null
    notify(t('quote.deleted'), 'success', {
      action: {
        label: t('quote.undo'),
        onClick: async () => {
          const { error: undoError } = await supabase.rpc('restore_quote', { p_quote: id })
          if (undoError) return notify(userMessage(undoError), 'error')
          navigate(`/quote/${id}`)
        },
      },
    })
    navigate(`/org/${quote.org_id}/quotes`, { replace: true })
  }

  // A sent or accepted quote is cancelled instead of deleted (owner's decision on issue 124).
  // Nothing else changes: its gig, crew, equipment and invoices stay as they are.
  function cancelQuote() {
    if (!window.confirm(t('quote.confirmCancel', { number: quoteNumber(quote, prefix), title: quote.title }))) return
    flushThen(async () => {
      const { data, error } = await supabase.rpc('cancel_quote', { p_quote: id })
      if (error) return notify(userMessage(error), 'error')
      version.current = data
      setQuote(q => {
        const next = { ...q, status: 'cancelled', lost_reason: null, lost_note: null }
        latest.current.quote = next
        return next
      })
      notify(t('quote.cancelledDone'), 'success')
    })
  }

  // A declined quote goes back to draft to be changed and sent again (owner's decision on issue 124);
  // its versions and the client's answer stay as the record
  function reviseQuote() {
    flushThen(async () => {
      const { data, error } = await supabase.rpc('revise_quote', { p_quote: id })
      if (error) return notify(userMessage(error), 'error')
      version.current = data
      setQuote(q => {
        const next = { ...q, status: 'draft', lost_reason: null, lost_note: null }
        latest.current.quote = next
        return next
      })
      notify(t('quote.revisedDone'), 'success')
    })
  }

  async function createGig() {
    const { start, end } = quoteDateRange(body)
    const { data, error } = await supabase.from('gigs').insert({
      org_id: quote.org_id, name: quote.title.slice(0, 200), start_date: start, end_date: end,
      status: quote.status === 'accepted' ? 'confirmed' : 'draft', created_by: user.id,
      description: [quote.client_company, quote.client_name].filter(Boolean).join(' · ') || null, client_id: quote.client_id || null,
    }).select('id, name, start_date, org_id').single()
    if (error) {
      logger.error('quote', error, { step: 'createGig', quoteId: id })
      return notify(userMessage(error), 'error')
    }
    setGigs(list => [data, ...list])
    updateQuote({ gig_id: data.id })
    notify(t('quote.gigCreated', { name: data.name }), 'success')
    setModal({ kind: 'plan', gig: data })
  }

  function restoreVersion(snapshot) {
    const fields = snapshotFields(snapshot)
    updateQuote(fields)
    const b = normalizeBody(snapshot.body)
    updateBody(b)
    setTab(b.phases[0] ? `phase:${b.phases[0].id}` : 'details')
  }

  const tabs = [
    { key: 'details', label: t('quote.tab.details') },
    ...body.phases.map((p, i) => ({ key: `phase:${p.id}`, label: p.name || t('quote.phaseN', { n: i + 1 }), amount: totals.phases[i]?.net, optional: p.optional })),
  ]

  const preview = { label: t('quote.preview'), icon: <Printer size={14} aria-hidden="true" />, onClick: () => flushThen(() => navigate(`/quote/${id}/print`)) }
  const gigAction = linkedGig
    ? { label: t('quote.openGig'), icon: <ExternalLink size={14} aria-hidden="true" />, onClick: () => flushThen(() => navigate(`/gig/${linkedGig.id}`)) }
    : { label: t('quote.createGig'), icon: <CalendarPlus size={14} aria-hidden="true" />, onClick: createGig }
  const secondary = phone ? [] : [preview, gigAction]
  const moreActions = [
    ...(phone ? [preview, gigAction] : []),
    ...(linkedGig ? [{ label: t('plan.button'), icon: <ListChecks size={15} aria-hidden="true" />, onClick: () => setModal({ kind: 'plan', gig: linkedGig }) }] : []),
    { label: t('quoteAvail.button'), icon: <Package size={15} aria-hidden="true" />, onClick: () => setModal({ kind: 'availability' }) },
    { label: t('quoteVersions.button'), icon: <History size={15} aria-hidden="true" />, onClick: () => setModal({ kind: 'versions' }) },
    { label: t('quote.duplicate'), icon: <Copy size={15} aria-hidden="true" />, onClick: duplicateQuote },
    { label: t('quote.saveAsTemplate'), icon: <LayoutTemplate size={15} aria-hidden="true" />, onClick: () => setModal({ kind: 'saveTemplate', body, name: quote.title }) },
    // Draft and declined quotes are deleted (to Recently deleted); sent and accepted ones are cancelled
    ...(quote.status === 'declined' ? [{ label: t('quote.revise'), icon: <RotateCcw size={15} aria-hidden="true" />, onClick: reviseQuote }] : []),
    ...(canDelete && ['draft', 'declined'].includes(quote.status) ? [{ label: t('common.delete'), icon: <Trash2 size={15} aria-hidden="true" color={colors.danger} />, onClick: deleteQuote }] : []),
    ...(canDelete && ['sent', 'accepted'].includes(quote.status) ? [{ label: t('quote.cancel'), icon: <Ban size={15} aria-hidden="true" color={colors.danger} />, onClick: cancelQuote }] : []),
  ]

  return (
    <div style={{ minHeight: '100vh', color: 'var(--text)', paddingBottom: '90px' }}>
      <style>{QUOTE_EDITOR_CSS}</style>
      <header className="q-header" style={{ borderBottom: `1px solid ${colors.border}`, background: colors.bg, zIndex: 40 }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: `${space[3]} var(--gutter) 0` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
            <button onClick={() => flushThen(() => navigate(`/org/${quote.org_id}/quotes`))} aria-label={t('quote.backToQuotes')} title={t('quote.backToQuotes')} style={iconBtn}><ArrowLeft size={18} /></button>
            <span style={{ fontFamily: 'var(--font-mono)', color: colors.soft, fontSize: '13px' }}>{quoteNumber(quote, prefix)}</span>
            <input value={quote.title} onChange={e => updateQuote({ title: e.target.value })} aria-label={t('quotes.quoteTitle')} maxLength={200}
              style={{ ...input, flex: '1 1 220px', fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: 700, background: 'transparent', border: '1px solid transparent', padding: '6px 8px' }} />
            <select value={quote.status} onChange={e => changeStatus(e.target.value)} aria-label={t('quotes.status')} style={{ ...input, width: 'auto', padding: '7px 10px', cursor: 'pointer' }}>
              {/* "Cancelled" is set only by ⋯ → Cancel quote; it shows here only on a cancelled quote */}
              {QUOTE_STATUSES.filter(s => s !== 'cancelled' || quote.status === 'cancelled').map(s => <option key={s} value={s}>{t(`quoteStatus.${s}`)}</option>)}
            </select>
            {quote.status === 'declined' && (
              <button onClick={() => setModal({ kind: 'lost' })} style={{ ...btnGhost, padding: '7px 10px' }}>
                {quote.lost_reason ? t('lost.shown', { reason: t(`lost.reasons.${quote.lost_reason}`) }) : t('lost.add')}
              </button>
            )}
            <SaveIndicator state={saveState} onRetry={save} />
            <PageHelp page="quote" />
          </div>
          {/* One primary (Send), up to two secondary (Preview, the gig) and the rest in ⋯ (DESIGN.md rule 5);
              on phone the secondary ones join the ⋯ menu */}
          <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center', padding: `${space[2]} 0 ${space[3]}` }}>
            {secondary.map(a => (
              <button key={a.label} onClick={a.onClick} style={btn}>{a.icon} {a.label}</button>
            ))}
            <button onClick={() => setModal({ kind: 'send' })} style={btnPrimary}><Send size={14} /> {t('send.button')}</button>
            <MoreMenu items={moreActions} />
          </div>
          {saveState === 'conflict' && (
            <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap', padding: `${space[3]} ${space[3]}`, marginBottom: space[3], background: 'var(--warn-soft)', border: '1px solid var(--warn)', color: 'var(--text)', fontSize: '13px' }}>
              <AlertTriangle size={15} color="var(--warn)" aria-hidden="true" /> <span style={{ flex: 1 }}>{t('quote.conflict')}</span>
              <button onClick={() => window.location.reload()} style={btn}>{t('quote.reload')}</button>
            </div>
          )}
          {/* The tabs (phases, details, summary) and, between them on screen, the add buttons, which
              aren't tabs: the tab list takes no box of its own and `order` places the buttons */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: space[1], overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'thin', marginBottom: '-1px' }}>
            <div role="tablist" aria-label={t('quote.phases')} style={{ display: 'contents' }}>
            {tabs.map(tb => (
              <button key={tb.key} role="tab" aria-selected={tab === tb.key} onClick={() => setTab(tb.key)} style={tabStyle(tab === tb.key, tb.optional)}>
                <span>{tb.label}</span>
                {(tb.amount !== undefined || tb.optional) && (
                  <span style={{ display: 'block', fontSize: '11px', fontWeight: 400, letterSpacing: 0, textTransform: 'none', color: colors.muted }}>
                    {tb.optional ? `${t('quote.optional')} · ` : ''}{tb.amount !== undefined ? formatMoney(tb.amount, quote.currency, lang) : ''}
                  </span>
                )}
              </button>
            ))}
              <button role="tab" aria-selected={tab === 'summary'} onClick={() => setTab('summary')} style={{ ...tabStyle(tab === 'summary'), marginLeft: 'auto', order: 2 }}>{t('quote.tab.summary')}</button>
            </div>
            <button onClick={addPhase} aria-label={t('quote.addPhase')} title={t('quote.addPhase')} style={{ ...tabStyle(false), color: 'var(--text)', order: 1, alignSelf: 'stretch', display: 'flex', alignItems: 'center' }}><Plus size={15} /></button>
            {templates.length > 0 && (
              <button onClick={() => setModal({ kind: 'insertTemplate' })} title={t('quote.insertTemplate')} style={{ ...tabStyle(false), order: 1, color: colors.soft, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Download size={13} /> {t('quote.insertTemplateShort')}
              </button>
            )}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: `${space[5]} var(--gutter)` }}>
        {tab === 'details' && <QuoteDetails quote={quote} gigs={gigs} clients={clients} onChange={updateQuote} onSaveClient={saveClientToContacts}
          onApplyVat={() => { if (window.confirm(t('quote.applyVatConfirm', { pct: quote.vat_rate }))) updateBody(setAllVatRates(body, quote.vat_rate)) }} />}
        {tab === 'summary' && <QuoteSummary quote={quote} body={body} totals={totals} rates={rateCard.rates} onOpenPhase={i => setTab(`phase:${body.phases[i].id}`)} />}
        {tab === 'summary' && <QuoteInvoices quote={quote} body={body} prefix={prefix} clients={clients} dueDays={dueDays} />}
        {tab === 'summary' && <div style={{ marginTop: space.section }}><ContextThread type="quote" id={quote.id} /></div>}
        {phase && (
          <PhaseEditor key={phase.id} phase={phase} index={phaseIndex} count={body.phases.length} currency={quote.currency} vatRate={quote.vat_rate} priceItems={priceItems} rates={rateCard.rates}
            onChange={updatePhase}
            onMove={delta => updateBody({ phases: move(body.phases, phaseIndex, delta) })}
            onDuplicate={duplicatePhase}
            onRemove={removePhase}
            onSaveTemplate={() => setModal({ kind: 'saveTemplate', body: { phases: [phase] }, name: phase.name })} />
        )}
        {tab.startsWith('phase:') && !phase && body.phases.length === 0 && (
          <div style={{ textAlign: 'center', padding: '50px 20px' }}>
            <button onClick={addPhase} style={btnPrimary}><Plus size={15} /> {t('quote.addPhase')}</button>
          </div>
        )}
      </main>

      <footer style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--chrome)', borderTop: `1px solid ${colors.border}`, zIndex: 40 }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: `${space[3]} var(--gutter)`, display: 'flex', alignItems: 'center', gap: space[4], flexWrap: 'wrap', fontSize: '13px' }}>
          <QuoteStatusBadge status={quote.status} />
          {totals.optional > 0 && <span style={{ color: colors.muted }}>{t('quote.optionsNotIncluded')}: <span style={{ fontFamily: 'var(--font-mono)' }}>{formatMoney(totals.optional, quote.currency, lang)}</span></span>}
          <span style={{ marginLeft: 'auto', color: colors.soft }}>{t('quote.totalExVat')} <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)', fontSize: '14px', fontWeight: 400 }}>{formatMoney(totals.net, quote.currency, lang)}</strong></span>
          <span style={{ color: colors.soft }}>{t('quote.totalIncVat')} <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)', fontSize: '16px' }}>{formatMoney(totals.total, quote.currency, lang)}</strong></span>
        </div>
      </footer>

      {modal?.kind === 'saveTemplate' && (
        <SaveTemplateModal orgId={quote.org_id} userId={user.id} body={modal.body} defaultName={modal.name}
          onClose={() => setModal(null)} onSaved={tpl => { setTemplates(list => [...list, tpl].sort((a, b) => a.name.localeCompare(b.name))); setModal(null) }} />
      )}
      {modal?.kind === 'lost' && (
        <LostReasonModal reason={quote.lost_reason} note={quote.lost_note} onClose={() => setModal(null)}
          onSave={changes => { updateQuote(changes); setModal(null) }} />
      )}
      {modal?.kind === 'versions' && (
        <VersionsModal quoteId={id} prepare={prepare} currency={quote.currency} onRestore={restoreVersion} onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'send' && (
        <SendQuoteModal quoteId={id} prepare={prepare} defaultEmail={quote.client_email}
          onSent={() => { if (latest.current.quote.status === 'draft') updateQuote({ status: 'sent' }) }}
          onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'availability' && (
        <QuoteAvailabilityModal quote={quote} body={body} org={orgs.find(o => o.id === quote.org_id) || {}} onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'plan' && (
        <GigPlanModal quoteId={id} body={body} gig={modal.gig} userId={user.id} onClose={() => setModal(null)}
          onDone={() => { setModal(null); flushThen(() => navigate(`/gig/${modal.gig.id}`)) }} />
      )}
      {modal?.kind === 'insertTemplate' && (
        <Modal title={t('quote.insertTemplate')} onClose={() => setModal(null)}>
          <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5, marginBottom: '12px' }}>{t('quote.insertTemplateIntro')}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
            {templates.map(tpl => (
              <button key={tpl.id} onClick={() => insertTemplate(tpl)} style={{ ...btnGhost, justifyContent: 'flex-start', padding: '10px 12px', textAlign: 'left' }}>
                <LayoutTemplate size={14} />
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', color: 'var(--text)' }}>{tpl.name}</span>
                  <span style={{ display: 'block', fontSize: '13px', color: colors.muted, fontWeight: 400 }}>
                    {[tpl.description, t('quotes.phaseCount', { count: tpl.body?.phases?.length || 0 })].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}

function SaveIndicator({ state, onRetry }) {
  const { t } = useI18n()
  // A square + the word (DESIGN.md "QuoteEditor"): accent-text saved, warn unsaved, blinking while saving
  const map = {
    saved: ['var(--accent-text)', t('quote.saved')],
    dirty: ['var(--warn)', t('quote.unsaved')],
    saving: ['var(--muted)', t('quote.saving')],
    error: ['var(--danger)', t('quote.saveFailed')],
    conflict: ['var(--warn)', t('quote.notSaved')],
  }
  const [color, text] = map[state]
  return (
    <span role="status" style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: '13px', color: state === 'error' ? colors.danger : colors.soft, whiteSpace: 'nowrap' }}>
      <span aria-hidden="true" style={{ width: '8px', height: '8px', background: color, flexShrink: 0, animation: state === 'saving' ? 'blink 0.6s steps(1, end) infinite' : undefined }} /> {text}
      {state === 'error' && <button onClick={onRetry} style={{ ...iconBtn, color: colors.accentText, fontSize: '13px', padding: '2px 4px' }}>{t('quote.retry')}</button>}
    </span>
  )
}

function SaveTemplateModal({ orgId, userId, body, defaultName, onClose, onSaved }) {
  const { t } = useI18n()
  const { notify } = useToast()
  const [name, setName] = useState(defaultName || '')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    const { data, error } = await supabase.from('quote_templates').insert({
      org_id: orgId, name: name.trim(), description: description.trim() || null, body: cloneBody(body), created_by: userId,
    }).select('id, name, description, body').single()
    setSaving(false)
    if (error) {
      logger.error('quote', error, { step: 'saveTemplate' })
      return notify(userMessage(error), 'error')
    }
    notify(t('quote.templateSaved', { name: data.name }), 'success')
    onSaved(data)
  }

  return (
    <Modal title={t('quote.saveAsTemplate')} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5 }}>{t('quote.saveTemplateIntro', { count: body.phases.length })}</p>
        <div>
          <label style={label} htmlFor="tpl-name">{t('quote.templateName')} *</label>
          <input id="tpl-name" value={name} onChange={e => setName(e.target.value)} maxLength={120} style={input} autoFocus required />
        </div>
        <div>
          <label style={label} htmlFor="tpl-desc">{t('quote.templateDescription')}</label>
          <input id="tpl-desc" value={description} onChange={e => setDescription(e.target.value)} maxLength={500} style={input} />
        </div>
        <button type="submit" disabled={saving || !name.trim()} style={{ ...btnPrimary, justifyContent: 'center' }}>
          {saving ? <AvxLoader size={15} /> : <LayoutTemplate size={15} />} {t('quote.saveTemplate')}
        </button>
      </form>
    </Modal>
  )
}

const btnGhost = { ...btn, background: 'transparent', borderColor: 'var(--line-strong)', color: colors.soft }
// Square phase tabs: fill ground, a 2px accent top edge when selected, dashed when optional (not in the total)
const tabStyle = (active, optional) => ({
  padding: `${space[2]} ${space[4]}`, whiteSpace: 'nowrap', flexShrink: 0, cursor: 'pointer', textAlign: 'left',
  fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
  color: active ? 'var(--text)' : colors.muted, background: active ? 'var(--panel)' : 'var(--fill)',
  border: `1px ${optional ? 'dashed' : 'solid'} ${active ? 'var(--line-strong)' : 'var(--line)'}`, borderBottom: active ? '1px solid var(--panel)' : '1px solid var(--line)',
  borderTop: active ? `2px solid ${colors.accent}` : `1px ${optional ? 'dashed' : 'solid'} var(--line)`,
})
