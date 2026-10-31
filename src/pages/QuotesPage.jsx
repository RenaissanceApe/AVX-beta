import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Plus, Loader2, FileText, LayoutTemplate, Building2, Trash2, Search, Tags } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { selectAll } from '../lib/selectAll'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { useI18n } from '../i18n'
import { Modal, btn, btnPrimary, iconBtn, input, label, card, colors } from '../components/ui'
import EmptyState from '../components/EmptyState'
import { QUOTE_STATUSES, quoteNumber, formatMoney, cloneBody, emptyPhase, localISODate, addDays, quoteTotals } from '../lib/quotes'
import CompanyDetailsModal from '../components/quotes/CompanyDetailsModal'
import { PriceListTab } from '../components/quotes/PriceList'
import { QuoteStatusBadge } from '../components/quotes/parts'
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
  const view = ['templates', 'prices'].includes(params.get('tab')) ? params.get('tab') : 'quotes'
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
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)

  async function load() {
    const [orgRes, roleRes, quotesRes, templatesRes, pricesRes, clientsRes] = await Promise.all([
      supabase.from('organisations').select('*').eq('id', orgId).maybeSingle(),
      supabase.from('org_members').select('role').eq('org_id', orgId).eq('user_id', user.id).maybeSingle(),
      selectAll(() => supabase.from('quotes').select('id, number, title, status, client_name, client_company, issue_date, valid_until, total_net, currency, gig_id, updated_at')
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
  }
  useEffect(() => { load() }, [orgId]) // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return quotes.filter(x => (status === 'all' || x.status === status)
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
      <Loader2 size={26} color={colors.accentText} style={{ animation: 'spin 1s linear infinite' }} />
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
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 16px 0', display: 'flex', alignItems: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
        {/* Title takes its own line on phones; the buttons wrap below it instead of squeezing it */}
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <div style={{ fontSize: '12px', color: colors.muted, overflowWrap: 'anywhere' }}>{org.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><h1 style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.4px' }}>{t('quotes.title')}</h1><PageHelp page="quotes" /></div>
        </div>
        <button onClick={() => setShowCompany(true)} style={btn}><Building2 size={14} /> {t('quotes.company')}</button>
        <button onClick={() => setShowNew(true)} style={btnPrimary}><Plus size={15} /> {t('quotes.new')}</button>
      </div>

      <main style={{ maxWidth: '960px', margin: '0 auto', padding: '20px 16px 60px' }}>
        <div role="tablist" style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: `1px solid ${colors.border}`, overflowX: 'auto', overflowY: 'hidden' }}>
          {[['quotes', <FileText key="i" size={14} />, quotes.length], ['templates', <LayoutTemplate key="i" size={14} />, templates.length], ['prices', <Tags key="i" size={14} />, priceItems.length]].map(([key, icon, count]) => (
            <button key={key} role="tab" aria-selected={view === key} onClick={() => setView(key)} style={{
              padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 600,
              color: view === key ? colors.accentText : colors.muted, borderBottom: view === key ? `2px solid ${colors.accent}` : '2px solid transparent',
              display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              {icon} {t(`quotes.tab.${key}`)} <span style={{ fontSize: '11px', opacity: 0.7 }}>{count}</span>
            </button>
          ))}
        </div>

        {view === 'quotes' && (
          <>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
              <div style={{ position: 'relative', flex: '1 1 220px' }}>
                <Search size={14} color={colors.muted} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)' }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('quotes.search')} aria-label={t('quotes.search')}
                  style={{ ...input, paddingLeft: '32px' }} />
              </div>
              <select value={status} onChange={e => setStatus(e.target.value)} aria-label={t('quotes.status')} style={{ ...input, width: 'auto', cursor: 'pointer' }}>
                <option value="all">{t('quotes.allStatuses')}</option>
                {QUOTE_STATUSES.map(s => <option key={s} value={s}>{t(`quoteStatus.${s}`)}</option>)}
              </select>
            </div>

            {quotes.length === 0 ? (
              <EmptyState icon={<FileText size={28} />} title={t('quotes.emptyTitle')} body={t('quotes.emptyBody')}
                action={t('quotes.new')} onAction={() => setShowNew(true)} guide="of-build-quote" />
            ) : visible.length === 0 ? (
              <p style={{ color: colors.muted, fontSize: '14px', textAlign: 'center', padding: '40px' }}>{t('quotes.noMatch')}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {visible.map(q => (
                  <button key={q.id} onClick={() => navigate(`/quote/${q.id}`)} style={{
                    ...card, textAlign: 'left', cursor: 'pointer', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap',
                  }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: colors.soft }}>{quoteNumber(q, org.quote_number_prefix ?? 'Q')}</span>
                    <span style={{ flex: '1 1 200px', minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 700, fontSize: '15px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.title}</span>
                      <span style={{ display: 'block', fontSize: '12px', color: colors.muted }}>
                        {[q.client_company || q.client_name, q.issue_date && fmt(q.issue_date, 'd MMM yyyy')].filter(Boolean).join(' · ') || '—'}
                      </span>
                    </span>
                    <QuoteStatusBadge status={q.status} />
                    <span style={{ fontWeight: 700, fontSize: '15px', minWidth: '100px', textAlign: 'right' }}>{formatMoney(q.total_net, q.currency, lang)}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {view === 'prices' && <PriceListTab orgId={orgId} userId={user.id} items={priceItems} setItems={setPriceItems} />}

        {view === 'templates' && (
          templates.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <LayoutTemplate size={30} color={colors.accentText} />
              <h2 style={{ fontWeight: 700, margin: '12px 0 8px', fontSize: '17px' }}>{t('quotes.noTemplatesTitle')}</h2>
              <p style={{ color: colors.muted, fontSize: '13px', lineHeight: 1.6, maxWidth: '420px', margin: '0 auto' }}>{t('quotes.noTemplatesBody')}</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {templates.map(tpl => (
                <div key={tpl.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <LayoutTemplate size={16} color={colors.accentText} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{tpl.name}</div>
                    <div style={{ fontSize: '12px', color: colors.muted }}>
                      {[tpl.description, t('quotes.phaseCount', { count: tpl.body?.phases?.length || 0 })].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  {(role === 'admin' || tpl.created_by === user.id) && (
                    <button onClick={() => deleteTemplate(tpl)} aria-label={t('quotes.deleteTemplateNamed', { name: tpl.name })} title={t('common.delete')} style={iconBtn}>
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </main>

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
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '10px' }}>
          <div>
            <label style={label} htmlFor="nq-company">{t('quotes.clientCompany')}</label>
            <input id="nq-company" value={form.client_company} onChange={e => setForm(f => ({ ...f, client_company: e.target.value }))} maxLength={200} style={input} />
          </div>
          <div>
            <label style={label} htmlFor="nq-contact">{t('quotes.clientName')}</label>
            <input id="nq-contact" value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} maxLength={200} style={input} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
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
          {saving ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={16} />} {t('quotes.create')}
        </button>
      </form>
    </Modal>
  )
}
