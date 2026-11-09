import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Plus, FileText, LayoutTemplate, Building2, Trash2, Search, Tags } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { selectAll } from '../lib/selectAll'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { useI18n } from '../i18n'
import { Modal, btnPrimary, iconBtn, input, label, colors, AvxLoader, PageHeader, space } from '../components/ui'
import { FilterTabs, pageWrap, rowList, row, rowButton, rowName, rowMeta } from '../components/ListParts'
import EmptyState from '../components/EmptyState'
import { invoiceSummary } from '../lib/invoiceApi'
import { needsFollowUp, dayIn, FOLLOW_UP_DAYS } from '../lib/analytics/sales'
import { todayIn } from '../lib/analytics/periods'
import { QUOTE_STATUSES, quoteNumber, formatMoney, cloneBody, emptyPhase, localISODate, addDays, quoteTotals } from '../lib/quotes'
import CompanyDetailsModal from '../components/quotes/CompanyDetailsModal'
import { PriceListTab } from '../components/quotes/PriceList'
import { QuoteStatusBadge } from '../components/quotes/parts'
import QuoteBin from '../components/quotes/QuoteBin'
import AppShell from '../components/shell/AppShell'
import { useWorkspace } from '../lib/WorkspaceContext'
import { PageHelp } from '../components/help/HelpParts'

// Quotes of one organisation, plus its quote templates, price list and company details.
// Tabs and the company dialog have addresses (?tab=templates|prices, ?company=1) so the
// menus can link straight to them. Only admins and members get here (the database
// enforces the same rule).
export default function QuotesPage() {
  const { orgId } = useParams()
  const { user } = useAuth()
  const { notify } = useToast()
  const { t, fmt, lang } = useI18n()
  const navigate = useNavigate()
  const [org, setOrg] = useState(null)
  const [role, setRole] = useState(null)
  const [quotes, setQuotes] = useState([])
  const [templates, setTemplates] = useState([])
  const [priceItems, setPriceItems] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [params, setParams] = useSearchParams()
  const { setWorkspace } = useWorkspace()
  const view = ['templates', 'prices', 'bin'].includes(params.get('tab')) ? params.get('tab') : 'quotes'
  const setView = key => {
    const next = new URLSearchParams(params)
    if (key === 'quotes') next.delete('tab'); else next.set('tab', key)
    setParams(next, { replace: true })
  }
  const showCompany = params.get('company') === '1'
  const setShowCompany = open => {
    const next = new URLSearchParams(params)
    if (open) next.set('company', '1'); else next.delete('company')
    setParams(next)
  }
  useEffect(() => { setWorkspace(orgId) }, [orgId, setWorkspace])
  // K4: ?status=follow_up (from Reports → Sales and the Overview tile) opens the follow-up filter
  const [status, setStatus] = useState(() => (['follow_up', ...QUOTE_STATUSES].includes(params.get('status')) ? params.get('status') : 'all'))
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [invoiced, setInvoiced] = useState(new Map()) // quote id → invoiced excl. VAT (step 11)

  async function load() {
    const [orgRes, roleRes, quotesRes, templatesRes, pricesRes, clientsRes] = await Promise.all([
      supabase.from('organisations').select('*').eq('id', orgId).maybeSingle(),
      supabase.from('org_members').select('role').eq('org_id', orgId).eq('user_id', user.id).maybeSingle(),
      selectAll(() => supabase.from('quotes').select('id, number, title, status, client_name, client_company, issue_date, valid_until, sent_at, total_net, currency, gig_id, updated_at')
        .eq('org_id', orgId).order('number', { ascending: false }).order('id')),
      supabase.from('quote_templates').select('id, name, description, body, created_by, updated_at').eq('org_id', orgId).order('name'),
      selectAll(() => supabase.from('price_items').select('*').eq('org_id', orgId).is('archived_at', null).order('name').order('id')),
      selectAll(() => supabase.from('clients').select('id, name, contact_name, email, address, tax_id').eq('org_id', orgId).is('archived_at', null).order('name').order('id')),
    ])
    for (const [step, res] of Object.entries({ orgRes, quotesRes, templatesRes })) {
      if (res.error) logger.error('quotes', res.error, { step })
    }
    setOrg(orgRes.data)
    setRole(roleRes.data?.role ?? null)
    setQuotes(quotesRes.data || [])
    setTemplates(templatesRes.data || [])
    setPriceItems(pricesRes.data || [])
    setClients(clientsRes.data || [])
    setLoading(false)
    invoiceSummary(orgId, 'quote')
      .then(rows => setInvoiced(new Map(rows.filter(r => Number(r.invoiced_net) > 0).map(r => [r.ref_id, Number(r.invoiced_net)]))))
      .catch(error => logger.error('quotes', error, { step: 'invoiced' }))
  }
  useEffect(() => { load() }, [orgId]) // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const today = todayIn(org?.time_zone)
    const match = x => (status === 'all' || x.status === status
      || (status === 'follow_up' && needsFollowUp(x, today, { sentDay: dayIn(x.sent_at, org?.time_zone) })))
    return quotes.filter(x => match(x)
      && (!q || [x.title, x.client_name, x.client_company, quoteNumber(x, org?.quote_number_prefix ?? 'Q')].some(v => (v || '').toLowerCase().includes(q))))
  }, [quotes, status, search, org])

  async function deleteTemplate(tpl) {
    if (!window.confirm(t('quotes.confirmDeleteTemplate', { name: tpl.name }))) return
    const { error } = await supabase.from('quote_templates').delete().eq('id', tpl.id)
    if (error) return notify(userMessage(error), 'error')
    setTemplates(list => list.filter(x => x.id !== tpl.id))
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <AvxLoader size={26} color={colors.accentText} />
    </div>
  )
  if (!org || !['admin', 'member'].includes(role)) return (
    <AppShell>
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center' }}>
        <div style={{ maxWidth: '360px' }}>
          <p style={{ color: colors.muted, fontSize: '14px', lineHeight: 1.6, marginBottom: '20px' }}>{t('quotes.noAccess')}</p>
          <button onClick={() => navigate('/dashboard')} style={btnPrimary}><ArrowLeft size={14} /> {t('common.backToDashboard')}</button>
        </div>
      </div>
    </AppShell>
  )

  return (
    <AppShell>
      <div style={pageWrap}>
        <PageHeader title={t('quotes.title')} help={<PageHelp page="quotes" />}
          primary={<button onClick={() => setShowNew(true)} style={btnPrimary}><Plus size={16} aria-hidden="true" /> {t('quotes.new')}</button>}
          secondary={[{ label: t('quotes.company'), icon: <Building2 size={15} aria-hidden="true" />, onClick: () => setShowCompany(true) },
            { label: t('quotes.bin.title'), icon: <Trash2 size={15} aria-hidden="true" />, onClick: () => setView('bin') }]} />

        {view === 'bin' && <QuoteBin org={org} onBack={() => setView('quotes')} onRestored={load} />}

        {view !== 'bin' && <FilterTabs tabs label={t('quotes.title')} value={view} onChange={setView} style={{ marginBottom: space[5] }}
          items={[['quotes', <FileText key="i" size={15} aria-hidden="true" />, quotes.length], ['templates', <LayoutTemplate key="i" size={15} aria-hidden="true" />, templates.length],
            ['prices', <Tags key="i" size={15} aria-hidden="true" />, priceItems.length]].map(([key, icon, count]) => ({ key, label: t(`quotes.tab.${key}`), icon, count }))} />}

        {view === 'quotes' && (
          <>
            <div style={{ position: 'relative', marginBottom: space[3] }}>
              <Search size={14} color={colors.muted} aria-hidden="true" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('quotes.search')} aria-label={t('quotes.search')}
                style={{ ...input, paddingLeft: '32px' }} />
            </div>
            <FilterTabs label={t('quotes.status')} value={status} onChange={setStatus} style={{ marginBottom: space[4] }}
              items={[{ key: 'all', label: t('quotes.filter.all') }, ...QUOTE_STATUSES.map(s => ({ key: s, label: t(`quoteStatus.${s}`) })),
                { key: 'follow_up', label: t('quotes.filter.followUp', { days: FOLLOW_UP_DAYS }) }]} />

            {quotes.length === 0 ? (
              <EmptyState icon={<FileText size={28} />} title={t('quotes.emptyTitle')} body={t('quotes.emptyBody')}
                action={t('quotes.new')} onAction={() => setShowNew(true)} guide="of-build-quote" />
            ) : visible.length === 0 ? (
              <p style={{ color: colors.muted, fontSize: '14px', textAlign: 'center', padding: '40px' }}>{t('quotes.noMatch')}</p>
            ) : (
              <ul style={rowList}>
                {visible.map(q => (
                  <li key={q.id}>
                    <button onClick={() => navigate(`/quote/${q.id}`)} style={{ ...rowButton, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: colors.soft }}>{quoteNumber(q, org.quote_number_prefix ?? 'Q')}</span>
                      <span style={{ flex: '1 1 200px', minWidth: 0 }}>
                        <span style={rowName}>{q.title}</span>
                        <span style={rowMeta}>
                          {[q.client_company || q.client_name, q.issue_date && fmt(q.issue_date, 'd MMM yyyy')].filter(Boolean).join(' · ') || '—'}
                        </span>
                        {invoiced.has(q.id) && (
                          <span style={rowMeta}>
                            {t('invoice.invoicedOfQuote', { amount: formatMoney(invoiced.get(q.id), q.currency, lang) })}
                          </span>
                        )}
                      </span>
                      <QuoteStatusBadge status={q.status} />
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '14px', minWidth: '100px', textAlign: 'right' }}>{formatMoney(q.total_net, q.currency, lang)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {view === 'prices' && <PriceListTab orgId={orgId} userId={user.id} items={priceItems} setItems={setPriceItems} />}

        {view === 'templates' && (
          templates.length === 0 ? (
            <EmptyState icon={<LayoutTemplate size={28} />} title={t('quotes.noTemplatesTitle')} body={t('quotes.noTemplatesBody')} />
          ) : (
            <ul style={rowList}>
              {templates.map(tpl => (
                <li key={tpl.id} style={row}>
                  <LayoutTemplate size={16} color={colors.accentText} aria-hidden="true" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={rowName}>{tpl.name}</span>
                    <span style={rowMeta}>
                      {[tpl.description, t('quotes.phaseCount', { count: tpl.body?.phases?.length || 0 })].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  {(role === 'admin' || tpl.created_by === user.id) && (
                    <button onClick={() => deleteTemplate(tpl)} aria-label={t('quotes.deleteTemplateNamed', { name: tpl.name })} title={t('common.delete')} style={iconBtn}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )
        )}
      </div>

      {showNew && <NewQuoteModal org={org} templates={templates} clients={clients} onClose={() => setShowNew(false)} onCreated={id => navigate(`/quote/${id}`)} />}
      {showCompany && <CompanyDetailsModal org={org} canEdit={role === 'admin'} onClose={() => setShowCompany(false)} onSaved={next => setOrg(next)} />}
    </AppShell>
  )
}

function NewQuoteModal({ org, templates, clients = [], onClose, onCreated }) {
  const { t, lang } = useI18n()
  const { profile } = useAuth()
  const { notify } = useToast()
  const [form, setForm] = useState({ title: '', client_company: '', client_name: '', template: '', language: lang })
  const [client, setClient] = useState(null) // picked from contacts
  function pickClient(id) {
    const c = clients.find(x => x.id === id) || null
    setClient(c)
    if (c) setForm(f => ({ ...f, client_company: c.name, client_name: c.contact_name || '' }))
  }
  const [saving, setSaving] = useState(false)

  async function create(e) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    const tpl = templates.find(x => x.id === form.template)
    const body = tpl ? cloneBody(tpl.body) : { phases: [emptyPhase(t('quotes.defaultPhase'))] }
    const today = localISODate()
    const { data, error } = await supabase.from('quotes').insert({
      org_id: org.id,
      title: form.title.trim(),
      client_company: form.client_company.trim() || null,
      client_name: form.client_name.trim() || null,
      ...(client ? { client_id: client.id, client_email: client.email, client_address: client.address, client_tax_id: client.tax_id } : {}),
      language: form.language,
      manager_name: profile?.full_name || null,
      issue_date: today,
      valid_until: addDays(today, org.quote_validity_days || 30),
      vat_rate: org.default_vat_rate ?? 23,
      terms: org.quote_terms || null,
      body,
      total_net: quoteTotals({ body, vat_rate: org.default_vat_rate ?? 23, discount_pct: 0 }).net,
    }).select('id').single()
    setSaving(false)
    if (error) {
      logger.error('quotes', error, { step: 'create' })
      return notify(userMessage(error), 'error')
    }
    onCreated(data.id)
  }

  return (
    <Modal title={t('quotes.new')} onClose={onClose}>
      <form onSubmit={create} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div>
          <label style={label} htmlFor="nq-title">{t('quotes.quoteTitle')} *</label>
          <input id="nq-title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder={t('quotes.quoteTitlePlaceholder')} maxLength={200} style={input} autoFocus required />
        </div>
        {clients.length > 0 && (
          <div>
            <label style={label} htmlFor="nq-client">{t('contacts.pick')}</label>
            <select id="nq-client" value={client?.id || ''} onChange={e => pickClient(e.target.value)} style={{ ...input, cursor: 'pointer' }}>
              <option value="">{t('contacts.pickNone')}</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.contact_name ? ` · ${c.contact_name}` : ''}</option>)}
            </select>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '12px' }}>
          <div>
            <label style={label} htmlFor="nq-company">{t('quotes.clientCompany')}</label>
            <input id="nq-company" value={form.client_company} onChange={e => setForm(f => ({ ...f, client_company: e.target.value }))} maxLength={200} style={input} />
          </div>
          <div>
            <label style={label} htmlFor="nq-contact">{t('quotes.clientName')}</label>
            <input id="nq-contact" value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} maxLength={200} style={input} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
          <div>
            <label style={label} htmlFor="nq-template">{t('quotes.startFrom')}</label>
            <select id="nq-template" value={form.template} onChange={e => setForm(f => ({ ...f, template: e.target.value }))} style={{ ...input, cursor: 'pointer' }}>
              <option value="">{t('quotes.blankQuote')}</option>
              {templates.map(tpl => <option key={tpl.id} value={tpl.id}>{tpl.name}</option>)}
            </select>
          </div>
          <div>
            <label style={label} htmlFor="nq-lang">{t('quotes.language')}</label>
            <select id="nq-lang" value={form.language} onChange={e => setForm(f => ({ ...f, language: e.target.value }))} style={{ ...input, cursor: 'pointer' }}>
              <option value="pt">Português</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>
        <button type="submit" disabled={saving || !form.title.trim()} style={{ ...btnPrimary, justifyContent: 'center', padding: '12px' }}>
          {saving ? <AvxLoader size={16} /> : <Plus size={16} />} {t('quotes.create')}
        </button>
      </form>
    </Modal>
  )
}
