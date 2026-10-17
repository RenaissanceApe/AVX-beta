import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Loader2, Printer, Copy, LayoutTemplate, Trash2, Plus, CalendarPlus, ExternalLink, CheckCircle, AlertTriangle, CloudOff, Download,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { useI18n } from '../i18n'
import { Modal, btn, btnPrimary, iconBtn, input, label, colors } from '../components/ui'
import PhaseEditor, { QUOTE_EDITOR_CSS } from '../components/quotes/PhaseEditor'
import QuoteDetails from '../components/quotes/QuoteDetails'
import QuoteSummary from '../components/quotes/QuoteSummary'
import { QuoteStatusBadge } from '../components/quotes/parts'
import {
  QUOTE_STATUSES, normalizeBody, quoteTotals, emptyPhase, cloneBody, quoteNumber, formatMoney, move, quoteDateRange, localISODate,
} from '../lib/quotes'

// Fields of the quotes table the editor may change (the database sets the rest)
const EDITABLE = [
  'title', 'status', 'language', 'currency', 'client_name', 'client_company', 'client_email', 'client_address', 'client_tax_id',
  'issue_date', 'valid_until', 'intro', 'terms', 'vat_rate', 'discount_pct', 'show_line_prices', 'gig_id',
  'payment_terms', 'manager_name',
]
const SAVE_DELAY = 1000

export default function QuoteEditorPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const { notify } = useToast()
  const { t, lang } = useI18n()
  const navigate = useNavigate()

  const [quote, setQuote] = useState(null)
  const [body, setBody] = useState({ phases: [] })
  const [role, setRole] = useState(null)
  const [gigs, setGigs] = useState([])
  const [templates, setTemplates] = useState([])
  const [prefix, setPrefix] = useState('Q')
  const [priceItems, setPriceItems] = useState([])
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
      const [roleRes, gigsRes, tplRes, orgRes, pricesRes] = await Promise.all([
        supabase.from('org_members').select('role').eq('org_id', q.org_id).eq('user_id', user.id).maybeSingle(),
        supabase.from('gigs').select('id, name, start_date').eq('org_id', q.org_id).order('start_date', { ascending: false, nullsFirst: false }),
        supabase.from('quote_templates').select('id, name, description, body').eq('org_id', q.org_id).order('name'),
        supabase.from('organisations').select('quote_number_prefix').eq('id', q.org_id).maybeSingle(),
        supabase.from('price_items').select('*').eq('org_id', q.org_id).order('name'),
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
      setPriceItems(pricesRes.data || [])
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
      <Loader2 size={26} color={colors.accent} style={{ animation: 'spin 1s linear infinite' }} />
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
    const { data, error } = await supabase.from('quotes').delete().eq('id', id).select('id')
    if (error || !data?.length) {
      blocked.current = false
      return notify(error ? userMessage(error) : t('error.permission'), 'error')
    }
    timer.current = null
    notify(t('quote.deleted'), 'success')
    navigate(`/org/${quote.org_id}/quotes`, { replace: true })
  }

  async function createGig() {
    const { start, end } = quoteDateRange(body)
    const { data, error } = await supabase.from('gigs').insert({
      org_id: quote.org_id, name: quote.title.slice(0, 200), start_date: start, end_date: end,
      status: quote.status === 'accepted' ? 'confirmed' : 'draft', created_by: user.id,
      description: [quote.client_company, quote.client_name].filter(Boolean).join(' · ') || null,
    }).select('id, name, start_date').single()
    if (error) {
      logger.error('quote', error, { step: 'createGig', quoteId: id })
      return notify(userMessage(error), 'error')
    }
    setGigs(list => [data, ...list])
    updateQuote({ gig_id: data.id })
    notify(t('quote.gigCreated', { name: data.name }), 'success')
  }

  const tabs = [
    { key: 'details', label: t('quote.tab.details') },
    ...body.phases.map((p, i) => ({ key: `phase:${p.id}`, label: p.name || t('quote.phaseN', { n: i + 1 }), amount: totals.phases[i]?.net, optional: p.optional })),
  ]

  return (
    <div style={{ minHeight: '100vh', color: '#fff', paddingBottom: '90px' }}>
      <style>{QUOTE_EDITOR_CSS}</style>
      <header className="q-header" style={{ borderBottom: `1px solid ${colors.border}`, background: colors.bg, zIndex: 40 }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '12px 16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={() => flushThen(() => navigate(`/org/${quote.org_id}/quotes`))} aria-label={t('quote.backToQuotes')} title={t('quote.backToQuotes')} style={iconBtn}><ArrowLeft size={18} /></button>
            <span style={{ fontFamily: 'monospace', color: colors.soft, fontSize: '13px' }}>{quoteNumber(quote, prefix)}</span>
            <input value={quote.title} onChange={e => updateQuote({ title: e.target.value })} aria-label={t('quotes.quoteTitle')} maxLength={200}
              style={{ ...input, flex: '1 1 220px', fontSize: '18px', fontWeight: 800, background: 'transparent', border: '1px solid transparent', padding: '6px 8px' }} />
            <select value={quote.status} onChange={e => updateQuote({ status: e.target.value })} aria-label={t('quotes.status')} style={{ ...input, width: 'auto', padding: '7px 10px', cursor: 'pointer' }}>
              {QUOTE_STATUSES.map(s => <option key={s} value={s}>{t(`quoteStatus.${s}`)}</option>)}
            </select>
            <SaveIndicator state={saveState} onRetry={save} />
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', padding: '8px 0 10px' }}>
            <button onClick={() => flushThen(() => navigate(`/quote/${id}/print`))} style={btn}><Printer size={14} /> {t('quote.preview')}</button>
            <button onClick={duplicateQuote} style={btnGhost}><Copy size={14} /> {t('quote.duplicate')}</button>
            <button onClick={() => setModal({ kind: 'saveTemplate', body, name: quote.title })} style={btnGhost}><LayoutTemplate size={14} /> {t('quote.saveAsTemplate')}</button>
            {linkedGig
              ? <button onClick={() => flushThen(() => navigate(`/gig/${linkedGig.id}`))} style={btnGhost}><ExternalLink size={14} /> {t('quote.openGig')}</button>
              : <button onClick={createGig} style={btnGhost}><CalendarPlus size={14} /> {t('quote.createGig')}</button>}
            {canDelete && <button onClick={deleteQuote} style={{ ...btnGhost, color: colors.danger, marginLeft: 'auto' }}><Trash2 size={14} /> {t('common.delete')}</button>}
          </div>
          {saveState === 'conflict' && (
            <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '10px 12px', marginBottom: '10px', borderRadius: '10px', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', color: '#FBBF24', fontSize: '13px' }}>
              <AlertTriangle size={15} /> <span style={{ flex: 1 }}>{t('quote.conflict')}</span>
              <button onClick={() => window.location.reload()} style={{ ...btn, color: '#FBBF24', borderColor: 'rgba(245,158,11,0.4)', background: 'transparent' }}>{t('quote.reload')}</button>
            </div>
          )}
          <div role="tablist" aria-label={t('quote.phases')} style={{ display: 'flex', alignItems: 'flex-end', overflowX: 'auto', scrollbarWidth: 'thin' }}>
            {tabs.map(tb => (
              <button key={tb.key} role="tab" aria-selected={tab === tb.key} onClick={() => setTab(tb.key)} style={tabStyle(tab === tb.key)}>
                <span style={{ fontStyle: tb.optional ? 'italic' : undefined }}>{tb.label}</span>
                {tb.amount !== undefined && <span style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: colors.muted }}>{formatMoney(tb.amount, quote.currency, lang)}</span>}
              </button>
            ))}
            <button onClick={addPhase} aria-label={t('quote.addPhase')} title={t('quote.addPhase')} style={{ ...tabStyle(false), color: colors.accent }}><Plus size={15} /></button>
            {templates.length > 0 && (
              <button onClick={() => setModal({ kind: 'insertTemplate' })} title={t('quote.insertTemplate')} style={{ ...tabStyle(false), color: colors.soft, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Download size={13} /> {t('quote.insertTemplateShort')}
              </button>
            )}
            <button role="tab" aria-selected={tab === 'summary'} onClick={() => setTab('summary')} style={{ ...tabStyle(tab === 'summary'), marginLeft: 'auto' }}>{t('quote.tab.summary')}</button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '20px 16px' }}>
        {tab === 'details' && <QuoteDetails quote={quote} gigs={gigs} onChange={updateQuote} />}
        {tab === 'summary' && <QuoteSummary quote={quote} body={body} totals={totals} onOpenPhase={i => setTab(`phase:${body.phases[i].id}`)} />}
        {phase && (
          <PhaseEditor key={phase.id} phase={phase} index={phaseIndex} count={body.phases.length} currency={quote.currency} priceItems={priceItems}
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

      <footer style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(8,12,20,0.96)', borderTop: `1px solid ${colors.border}`, zIndex: 40 }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', fontSize: '13px' }}>
          <QuoteStatusBadge status={quote.status} />
          {totals.optional > 0 && <span style={{ color: colors.muted }}>{t('quote.optionsNotIncluded')}: {formatMoney(totals.optional, quote.currency, lang)}</span>}
          <span style={{ marginLeft: 'auto', color: colors.soft }}>{t('quote.totalExVat')} <strong style={{ color: '#fff', fontSize: '15px' }}>{formatMoney(totals.net, quote.currency, lang)}</strong></span>
          <span style={{ color: colors.soft }}>{t('quote.totalIncVat')} <strong style={{ color: colors.accent, fontSize: '15px' }}>{formatMoney(totals.total, quote.currency, lang)}</strong></span>
        </div>
      </footer>

      {modal?.kind === 'saveTemplate' && (
        <SaveTemplateModal orgId={quote.org_id} userId={user.id} body={modal.body} defaultName={modal.name}
          onClose={() => setModal(null)} onSaved={tpl => { setTemplates(list => [...list, tpl].sort((a, b) => a.name.localeCompare(b.name))); setModal(null) }} />
      )}
      {modal?.kind === 'insertTemplate' && (
        <Modal title={t('quote.insertTemplate')} onClose={() => setModal(null)}>
          <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5, marginBottom: '12px' }}>{t('quote.insertTemplateIntro')}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {templates.map(tpl => (
              <button key={tpl.id} onClick={() => insertTemplate(tpl)} style={{ ...btnGhost, justifyContent: 'flex-start', padding: '10px 12px', textAlign: 'left' }}>
                <LayoutTemplate size={14} />
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', color: '#fff' }}>{tpl.name}</span>
                  <span style={{ display: 'block', fontSize: '12px', color: colors.muted, fontWeight: 400 }}>
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
  const map = {
    saved: [CheckCircle, colors.muted, t('quote.saved')],
    dirty: [Loader2, colors.muted, t('quote.unsaved')],
    saving: [Loader2, colors.muted, t('quote.saving')],
    error: [CloudOff, colors.danger, t('quote.saveFailed')],
    conflict: [AlertTriangle, '#FBBF24', t('quote.notSaved')],
  }
  const [Icon, color, text] = map[state]
  return (
    <span role="status" style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color, whiteSpace: 'nowrap' }}>
      <Icon size={13} style={state === 'saving' ? { animation: 'spin 1s linear infinite' } : undefined} /> {text}
      {state === 'error' && <button onClick={onRetry} style={{ ...iconBtn, color: colors.accent, fontSize: '12px', padding: '2px 4px' }}>{t('quote.retry')}</button>}
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
          {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <LayoutTemplate size={15} />} {t('quote.saveTemplate')}
        </button>
      </form>
    </Modal>
  )
}

const btnGhost = { ...btn, background: 'transparent', borderColor: 'rgba(255,255,255,0.1)', color: colors.soft }
const tabStyle = active => ({
  padding: '8px 14px', whiteSpace: 'nowrap', flexShrink: 0, border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left',
  fontSize: '14px', fontWeight: 600, color: active ? colors.accent : colors.soft,
  borderBottom: active ? `2px solid ${colors.accent}` : '2px solid transparent',
})
