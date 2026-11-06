import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Loader2, Plus, FileCheck, Search, Download } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { useWorkspace } from '../lib/WorkspaceContext'
import { formatMoney, quoteNumber, localISODate } from '../lib/quotes'
import { invoiceState, daysOverdue } from '../lib/invoices'
import { loadInvoices, loadPayments, invoicingStatus, invoicingProviders } from '../lib/invoiceApi'
import { leftToPay, isPartlyPaid, paymentsByInvoice } from '../lib/payments'
import { downloadInvoicesCsv } from '../lib/invoiceCsv'
import { useToast } from '../lib/ToastContext'
import { useI18n, fmt } from '../i18n'
import { btn, btnPrimary, input, card, colors, Modal } from '../components/ui'
import AppShell from '../components/shell/AppShell'
import EmptyState from '../components/EmptyState'
import { PageHelp } from '../components/help/HelpParts'
import InvoiceModal, { InvoiceBadge, invoiceTitle } from '../components/invoices/InvoiceModal'
import InvoicingPanel from '../components/invoices/InvoicingPanel'

const VIEWS = ['open', 'unpaid', 'paid', 'all']
const section = { ...card, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }

// Invoices (step 11) at /org/:orgId/invoices, for the organisation's admins and members. AVX
// prepares each invoice; the organisation's own certified invoicing program issues it, and its
// number is typed back here. Views: to send (drafts and those waiting in the program), unpaid
// (overdue first), paid, all. An organisation can connect one invoicing program (step 11b,
// InvoicingPanel) so drafts are sent there and numbers read back; "CSV" downloads the invoices shown
// for programs without a connector.
export default function InvoicesPage() {
  const { orgId } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { t, lang } = useI18n()
  const { roleIn, loading, setWorkspace } = useWorkspace()
  const role = roleIn(orgId)
  const canSee = role === 'admin' || role === 'member'
  const view = VIEWS.includes(params.get('view')) ? params.get('view') : 'open'
  const [list, setList] = useState(null)
  const [payments, setPayments] = useState({}) // { invoice_id: [payment] }
  const [org, setOrg] = useState(null)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(null) // { invoice } | { quote } | { creditOf }
  const [picking, setPicking] = useState(false)
  const [version, setVersion] = useState(0)
  const [program, setProgram] = useState(undefined) // undefined: loading; null: by hand
  const [providers, setProviders] = useState([])
  const { notify } = useToast()
  const today = localISODate()
  useEffect(() => { setWorkspace(orgId) }, [orgId, setWorkspace])
  const changed = () => setVersion(v => v + 1)

  useEffect(() => {
    if (!canSee) return
    supabase.from('organisations').select('id, name, invoice_due_days, quote_number_prefix').eq('id', orgId).single().then(({ data }) => setOrg(data))
  }, [canSee, orgId, version])

  useEffect(() => {
    if (!canSee) return
    invoicingStatus(orgId).then(setProgram).catch(error => { logger.error('invoices', error, { step: 'program_status' }); setProgram(null) })
  }, [canSee, orgId, version])
  useEffect(() => {
    if (role === 'admin') invoicingProviders().then(setProviders)
  }, [role])
  // Back from a program's sign-in page
  useEffect(() => {
    const back = params.get('invoicing')
    if (!back) return
    notify(t(back === 'connected' ? 'invoice.program.signedIn' : 'invoice.program.signInFailed'), back === 'connected' ? 'success' : 'error')
    const next = new URLSearchParams(params)
    next.delete('invoicing')
    setParams(next, { replace: true })
  }, [params, setParams, notify, t])

  const load = useCallback(async () => {
    if (!canSee) return
    try {
      const [invoices, ps] = await Promise.all([loadInvoices(orgId), loadPayments(orgId)])
      setPayments(paymentsByInvoice(ps))
      setList(invoices)
    } catch (error) { logger.error('invoices', error, { step: 'list' }); setList([]) }
  }, [canSee, orgId])
  useEffect(() => { load() }, [load, version])

  const credits = useMemo(() => (list || []).filter(i => i.kind === 'credit_note'), [list])
  const shown = useMemo(() => (list || []).filter(i => {
    const state = invoiceState(i, { today, credits })
    if (view === 'open' && !['draft', 'sent'].includes(i.status)) return false
    if (view === 'unpaid' && !(i.kind === 'invoice' && ['issued', 'overdue'].includes(state))) return false
    if (view === 'paid' && state !== 'paid') return false
    if (search) {
      const s = search.toLowerCase()
      if (![i.client_name, i.legal_number, String(i.number), i.quote?.title, i.gig?.name].some(x => x && x.toLowerCase().includes(s))) return false
    }
    return true
  }).sort((a, b) => (view === 'unpaid' ? String(a.due_date || '9').localeCompare(String(b.due_date || '9')) : 0)), [list, view, search, today, credits])

  const sums = useMemo(() => {
    const out = {}
    for (const i of list || []) {
      if (i.kind !== 'invoice') continue
      const state = invoiceState(i, { today, credits })
      const k = state === 'overdue' ? 'overdue' : i.status === 'issued' ? 'unpaid' : null
      if (!k) continue
      out[k] = out[k] || {}
      const left = leftToPay(i, { credits, payments: payments[i.id] })
      out[k][i.currency] = Math.round(((out[k][i.currency] || 0) + left) * 100) / 100
    }
    return out
  }, [list, today, credits, payments])

  const setView = v => setParams(v === 'open' ? {} : { view: v }, { replace: true })
  const title = t('invoice.pageTitle')
  if (loading) return <AppShell><div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}><Loader2 size={24} color={colors.accentText} style={{ animation: 'spin 1s linear infinite' }} /></div></AppShell>
  if (!canSee) return (
    <AppShell>
      <div style={{ maxWidth: '360px', margin: '80px auto', textAlign: 'center', padding: '0 16px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>{title}</h1>
        <p style={{ color: colors.muted, fontSize: '14px', lineHeight: 1.6, marginBottom: '20px' }}>{t('invoice.noAccess')}</p>
        <button type="button" onClick={() => navigate('/dashboard')} style={btnPrimary}><ArrowLeft size={14} /> {t('common.backToDashboard')}</button>
      </div>
    </AppShell>
  )

  const openInvoice = inv => setOpen({ invoice: inv })
  const siblingsOf = inv => (list || []).filter(i => i.credited_invoice_id === inv.id)

  return (
    <AppShell>
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '24px 16px 48px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '24px', fontWeight: 700 }}>{title}</h1>
              <PageHelp page="org-invoices" />
            </div>
            <p style={{ fontSize: '13px', color: colors.muted, marginTop: '2px' }}>{t('invoice.intro')}</p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => downloadInvoicesCsv(shown, list || [], `${t('invoice.csvFile')} ${today}`)} disabled={!shown.length} style={btn}>
              <Download size={14} /> {t('invoice.csv')}
            </button>
            <button type="button" onClick={() => setPicking(true)} style={btnPrimary}><Plus size={14} /> {t('invoice.newFromQuote')}</button>
          </div>
        </div>

        <InvoicingPanel orgId={orgId} status={program} providers={providers} isAdmin={role === 'admin'} onChanged={changed} />

        {(sums.unpaid || sums.overdue) && (
          <dl style={{ ...section, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '4px 12px', fontSize: '14px', margin: 0 }}>
            {['overdue', 'unpaid'].filter(k => sums[k]).map(k => (
              <FragmentRow key={k} term={t(`invoice.sum.${k}`)} danger={k === 'overdue'}
                value={Object.entries(sums[k]).map(([c, v]) => formatMoney(v, c, lang)).join(' · ')} />
            ))}
          </dl>
        )}

        <nav aria-label={t('invoice.views')} style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {VIEWS.map(v => (
            <button key={v} type="button" onClick={() => setView(v)} aria-current={view === v ? 'page' : undefined}
              style={{ ...btn, padding: '7px 12px', ...(view === v ? { background: colors.accent, color: colors.onAccent, borderColor: colors.accent } : {}) }}>
              {t(`invoice.view.${v}`)}
            </button>
          ))}
        </nav>

        <section style={section} aria-label={t(`invoice.view.${view}`)}>
          <div style={{ position: 'relative' }}>
            <Search size={14} color={colors.muted} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} aria-hidden="true" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('invoice.search')} aria-label={t('invoice.search')} style={{ ...input, paddingLeft: '30px' }} />
          </div>
          {!list ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}><Loader2 size={22} color={colors.accentText} style={{ animation: 'spin 1s linear infinite' }} /></div>
          ) : shown.length === 0 ? (
            <EmptyState compact icon={<FileCheck size={26} />} title={t(`invoice.empty.${view}`)} body={t('invoice.emptyBody')} guide="office-invoices"
              action={t('invoice.newFromQuote')} onAction={() => setPicking(true)} />
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {shown.map(i => {
                const late = daysOverdue(i, today)
                return (
                  <li key={i.id} style={{ borderTop: `1px solid ${colors.border}` }}>
                    <button type="button" onClick={() => openInvoice(i)} style={{ all: 'unset', boxSizing: 'border-box', width: '100%', cursor: 'pointer', display: 'flex', gap: '10px', alignItems: 'center', padding: '10px 2px', minHeight: '44px' }}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <strong style={{ fontSize: '14px' }}>{invoiceTitle(i, t)}</strong>
                          <InvoiceBadge invoice={i} credits={credits} />
                        </span>
                        <span style={{ display: 'block', fontSize: '12px', color: colors.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {[i.client_name, i.quote?.title, i.due_date && i.kind === 'invoice' && i.status !== 'paid' ? t(late ? 'invoice.lateBy' : 'invoice.dueOn', { date: fmt(i.due_date, 'd MMM'), count: late }) : null,
                            isPartlyPaid(i, { credits, payments: payments[i.id] }) ? t('payment.leftShort', { amount: formatMoney(leftToPay(i, { credits, payments: payments[i.id] }), i.currency, lang) }) : null,
                            i.paid_on ? t('invoice.paidOnShort', { date: fmt(i.paid_on, 'd MMM') }) : null].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: i.kind === 'credit_note' ? colors.muted : undefined }}>
                        {i.kind === 'credit_note' ? '−' : ''}{formatMoney(i.total, i.currency, lang)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      {picking && <QuotePicker orgId={orgId} prefix={org?.quote_number_prefix ?? 'Q'} onClose={() => setPicking(false)} onPick={q => { setPicking(false); setOpen({ quote: q }) }} />}
      {open && (
        <InvoiceModal key={open.invoice?.id || open.quote?.id || open.creditOf?.id} orgId={orgId} invoice={open.invoice || null} quote={open.quote || null}
          client={open.client || open.quote?.client || null} creditOf={open.creditOf || null} dueDays={org?.invoice_due_days ?? 30}
          siblings={open.quote ? (list || []).filter(i => i.quote_id === open.quote.id) : open.creditOf ? siblingsOf(open.creditOf) : []}
          onClose={() => setOpen(null)} onSaved={changed}
          onCredit={inv => setOpen({ creditOf: inv })} />
      )}
    </AppShell>
  )
}

// Accepted quotes to invoice, newest first
function QuotePicker({ orgId, prefix, onClose, onPick }) {
  const { t, lang } = useI18n()
  const [quotes, setQuotes] = useState(null)
  const [q, setQ] = useState('')
  useEffect(() => {
    supabase.from('quotes').select('id, org_id, number, title, status, language, currency, vat_rate, discount_pct, body, gig_id, client_id, client_name, client_company, client_email, client_address, client_tax_id, total_net, issue_date')
      .eq('org_id', orgId).eq('status', 'accepted').order('number', { ascending: false }).limit(300)
      .then(({ data, error }) => { if (error) logger.error('invoices', error, { step: 'quotes' }); setQuotes(data || []) })
  }, [orgId])
  const shown = (quotes || []).filter(x => !q || [x.title, x.client_company, x.client_name, quoteNumber(x, prefix)].some(v => (v || '').toLowerCase().includes(q.toLowerCase())))
  const pick = async quote => {
    let client = null
    if (quote.client_id) {
      const { data } = await supabase.from('clients').select('id, name, tax_id, address, email').eq('id', quote.client_id).maybeSingle()
      client = data
    }
    onPick({ ...quote, prefix, client })
  }
  return (
    <Modal title={t('invoice.pickQuote')} onClose={onClose}>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('invoice.searchQuotes')} aria-label={t('invoice.searchQuotes')} style={{ ...input, marginBottom: '10px' }} />
      {!quotes ? <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> : shown.length === 0 ? (
        <p style={{ fontSize: '13px', color: colors.muted }}>{t('invoice.noAcceptedQuotes')}</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {shown.map(x => (
            <li key={x.id} style={{ borderTop: `1px solid ${colors.border}` }}>
              <button type="button" onClick={() => pick(x)} style={{ all: 'unset', boxSizing: 'border-box', width: '100%', cursor: 'pointer', display: 'flex', gap: '8px', padding: '10px 2px', minHeight: '44px', alignItems: 'center' }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ fontSize: '14px' }}>{quoteNumber(x, prefix)} · {x.title}</strong>
                  <span style={{ display: 'block', fontSize: '12px', color: colors.muted }}>{x.client_company || x.client_name || '—'}</span>
                </span>
                <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: '13px' }}>{formatMoney(x.total_net, x.currency, lang)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

function FragmentRow({ term, value, danger }) {
  return (
    <>
      <dt style={{ color: danger ? colors.danger : colors.muted, fontWeight: danger ? 700 : 400 }}>{term}</dt>
      <dd style={{ margin: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{value}</dd>
    </>
  )
}
