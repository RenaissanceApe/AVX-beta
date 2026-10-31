import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Plus, Loader2, Building2, Truck, Search, Upload, Pencil, Archive, ArchiveRestore, Check, Users, FileText } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { selectAll } from '../lib/selectAll'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { track } from '../lib/usage'
import { useWorkspace } from '../lib/WorkspaceContext'
import { quoteNumber } from '../lib/quotes'
import { useCustomFields, mergeValues } from '../lib/customFields'
import { CustomFieldInputs } from '../components/CustomFields'
import { useI18n, t } from '../i18n'
import { Modal, btn, btnPrimary, iconBtn, input, label, card, colors, tint } from '../components/ui'
import EmptyState from '../components/EmptyState'
import AppShell from '../components/shell/AppShell'
import { PageHelp } from '../components/help/HelpParts'
import { QuoteStatusBadge } from '../components/quotes/parts'
import { SupplierModal } from '../components/inventory/SubrentalPanels'

const TABS = ['clients', 'suppliers']
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }
const small = { fontSize: '12px', color: colors.muted, lineHeight: 1.5 }
const Field = ({ id, text, children }) => <div><label style={label} htmlFor={id}>{text}</label>{children}</div>

// The contacts directory (docs/SWITCHING.md, S2): clients (quotes pick from them) and suppliers
// (subrentals pick from them), with search, archiving and import. Clients typed on older quotes
// can be added in one go.
//   /org/:orgId/contacts (?tab=suppliers)
export default function ContactsPage() {
  const { orgId } = useParams()
  const navigate = useNavigate()
  const { notify } = useToast()
  const { orgs, roleIn, loading, setWorkspace } = useWorkspace()
  const role = roleIn(orgId)
  const org = orgs.find(o => o.id === orgId)
  const canEdit = role === 'admin' || role === 'member'
  const [params, setParams] = useSearchParams()
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'clients'
  const setTab = key => {
    const next = new URLSearchParams(params)
    if (key === 'clients') next.delete('tab'); else next.set('tab', key)
    setParams(next, { replace: true })
  }
  const [lists, setLists] = useState(null) // { clients, suppliers, counts: quotes per client_id, null = typed in only }
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState(null) // contact or {} (new)
  const [filling, setFilling] = useState(false)
  useEffect(() => { setWorkspace(orgId) }, [orgId, setWorkspace])

  const load = useCallback(async () => {
    const [c, s, q] = await Promise.all([
      supabase.from('clients').select('*').eq('org_id', orgId).order('name'),
      supabase.from('suppliers').select('*').eq('org_id', orgId).order('name'),
      selectAll(() => supabase.rpc('client_quote_counts', { p_org: orgId }).order('client_id')),
    ])
    for (const [step, res] of Object.entries({ clients: c, suppliers: s, quotes: q })) if (res.error) logger.error('contacts', res.error, { step })
    setLists({ clients: c.data || [], suppliers: s.data || [], counts: q.data || [] })
  }, [orgId])
  useEffect(() => { if (canEdit) load() }, [canEdit, load])

  const quoteCount = useMemo(() => {
    const m = new Map()
    for (const r of lists?.counts || []) if (r.client_id) m.set(r.client_id, r.quotes)
    return m
  }, [lists])
  // Quotes with a client typed in but not linked to one in the directory
  const unlinked = (lists?.counts || []).find(r => !r.client_id)?.quotes || 0

  const all = useMemo(() => lists?.[tab] || [], [lists, tab])
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return all.filter(c => (showArchived || !c.archived_at)
      && (!q || [c.name, c.contact_name, c.email, c.phone, c.tax_id].some(v => (v || '').toLowerCase().includes(q))))
  }, [all, search, showArchived])

  async function archive(c) {
    const { error } = await supabase.from(tab).update({ archived_at: c.archived_at ? null : new Date().toISOString() }).eq('id', c.id)
    if (error) return notify(userMessage(error), 'error')
    notify(t(c.archived_at ? 'contacts.restored' : 'contacts.archived', { name: c.name }), 'success')
    load()
  }
  async function fillFromQuotes() {
    setFilling(true)
    const { data, error } = await supabase.rpc('clients_from_quotes', { p_org: orgId })
    setFilling(false)
    if (error) { logger.error('contacts', error, { step: 'fromQuotes' }); return notify(userMessage(error), 'error') }
    track('contacts:fromQuotes')
    notify(t('contacts.filled', { created: data.created, linked: data.linked }), 'success')
    load()
  }

  if (loading || (canEdit && !lists)) return <AppShell><div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}><Loader2 size={24} color={colors.accentText} style={{ animation: 'spin 1s linear infinite' }} /></div></AppShell>
  if (!canEdit) return (
    <AppShell>
      <div style={{ maxWidth: '360px', margin: '80px auto', textAlign: 'center', padding: '0 16px' }}>
        <p style={{ color: colors.muted, fontSize: '14px', lineHeight: 1.6, marginBottom: '20px' }}>{t('contacts.noAccess')}</p>
        <button onClick={() => navigate('/dashboard')} style={btnPrimary}><ArrowLeft size={14} /> {t('common.backToDashboard')}</button>
      </div>
    </AppShell>
  )

  const Icon = tab === 'clients' ? Building2 : Truck
  return (
    <AppShell>
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 16px 0', display: 'flex', alignItems: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <div style={{ fontSize: '12px', color: colors.muted, overflowWrap: 'anywhere' }}>{org?.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><h1 style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.4px' }}>{t('contacts.title')}</h1><PageHelp page="contacts" /></div>
        </div>
        <Link to={`/org/${orgId}/inventory/import?kind=${tab}`} style={{ ...btn, textDecoration: 'none' }}><Upload size={14} /> {t('contacts.import')}</Link>
        <button onClick={() => setEditing({})} style={btnPrimary}><Plus size={15} /> {t(`contacts.new.${tab}`)}</button>
      </div>

      <main style={{ maxWidth: '960px', margin: '0 auto', padding: '20px 16px 60px' }}>
        <div role="tablist" style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: `1px solid ${colors.border}`, overflowX: 'auto', overflowY: 'hidden' }}>
          {TABS.map(key => {
            const TabIcon = key === 'clients' ? Building2 : Truck
            return (
              <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} style={{
                padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 600,
                color: tab === key ? colors.accentText : colors.muted, borderBottom: tab === key ? `2px solid ${colors.accent}` : '2px solid transparent',
                display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', flexShrink: 0,
              }}>
                <TabIcon size={14} /> {t(`contacts.tab.${key}`)} <span style={{ fontSize: '11px', opacity: 0.7 }}>{lists[key].filter(c => !c.archived_at).length}</span>
              </button>
            )
          })}
        </div>

        {tab === 'clients' && unlinked > 0 && (
          <section style={{ ...card, display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px', borderColor: tint(colors.accent, 35) }}>
            <FileText size={18} color={colors.accentText} aria-hidden="true" style={{ flexShrink: 0 }} />
            <p style={{ flex: '1 1 260px', fontSize: '13px', lineHeight: 1.6 }}>{t('contacts.fromQuotesText', { count: unlinked })}</p>
            <button onClick={fillFromQuotes} disabled={filling} style={btn}>
              {filling ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Users size={14} />} {t('contacts.fromQuotes')}
            </button>
          </section>
        )}

        {all.length === 0 ? (
          <EmptyState icon={<Icon size={28} />} title={t(`contacts.emptyTitle.${tab}`)} body={t(`contacts.emptyBody.${tab}`)}
            action={t(`contacts.new.${tab}`)} onAction={() => setEditing({})} guide="of-contacts" />
        ) : (
          <>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
              <div style={{ position: 'relative', flex: '1 1 220px' }}>
                <Search size={14} color={colors.muted} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)' }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('contacts.search')} aria-label={t('contacts.search')} style={{ ...input, paddingLeft: '32px' }} />
              </div>
              {all.some(c => c.archived_at) && (
                <button onClick={() => setShowArchived(v => !v)} style={btn}>{showArchived ? t('inv.hideArchived') : t('inv.showArchived')}</button>
              )}
            </div>
            {visible.length === 0 ? <p style={{ color: colors.muted, fontSize: '14px', textAlign: 'center', padding: '32px' }}>{t('contacts.noMatch')}</p> : (
              <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {visible.map(c => (
                  <li key={c.id} style={{ ...card, padding: '9px 12px', display: 'flex', gap: '6px', alignItems: 'center', opacity: c.archived_at ? 0.6 : 1 }}>
                    <button onClick={() => setEditing(c)} style={{ flex: '1 1 auto', minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0, color: 'var(--text)', font: 'inherit', cursor: 'pointer' }}>
                      <span style={{ display: 'block', fontWeight: 600, fontSize: '14px', overflowWrap: 'anywhere' }}>
                        {c.name}
                        {c.partner_org_id && <span style={{ fontSize: '11px', color: 'var(--sky)', marginLeft: '6px' }}>{t('sub.onAvx')}</span>}
                        {c.archived_at && <span style={{ fontSize: '11px', color: colors.muted, marginLeft: '6px' }}>{t('contacts.archivedBadge')}</span>}
                      </span>
                      <span style={{ display: 'block', fontSize: '12px', color: colors.muted, overflowWrap: 'anywhere' }}>{[c.contact_name, c.phone, c.email].filter(Boolean).join(' · ') || '—'}</span>
                      {tab === 'clients' && quoteCount.get(c.id) > 0 && <span style={{ display: 'block', fontSize: '12px', color: colors.soft }}>{t('contacts.quoteCount', { count: quoteCount.get(c.id) })}</span>}
                    </button>
                    <button onClick={() => setEditing(c)} aria-label={`${t('common.edit')}: ${c.name}`} title={t('common.edit')} style={iconBtn}><Pencil size={14} /></button>
                    <button onClick={() => archive(c)} title={c.archived_at ? t('inv.restore') : t('inv.archive')} aria-label={`${c.archived_at ? t('inv.restore') : t('inv.archive')}: ${c.name}`} style={iconBtn}>
                      {c.archived_at ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {tab === 'suppliers' && <p style={{ ...small, marginTop: '14px' }}>{t('contacts.suppliersHint')} <Link to={`/org/${orgId}/inventory?tab=subrentals`} style={{ color: colors.accentText }}>{t('nav.subrentals')}</Link></p>}
      </main>

      {editing && tab === 'clients' && <ClientModal orgId={orgId} client={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={load} />}
      {editing && tab === 'suppliers' && <SupplierModal orgId={orgId} supplier={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={load} />}
      <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
    </AppShell>
  )
}

// A client: details, and the quotes made for them
export function ClientModal({ orgId, client, onClose, onSaved }) {
  const { notify } = useToast()
  const { fmt } = useI18n()
  const [form, setForm] = useState({
    name: client?.name || '', contact_name: client?.contact_name || '', email: client?.email || '', phone: client?.phone || '',
    tax_id: client?.tax_id || '', address: client?.address || '', notes: client?.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [quotes, setQuotes] = useState(null)
  const [prefix, setPrefix] = useState('Q')
  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }))
  const { fields } = useCustomFields(orgId, 'client')
  const [custom, setCustom] = useState({})

  useEffect(() => {
    if (!client) return
    Promise.all([
      supabase.from('quotes').select('id, number, title, status, issue_date').eq('client_id', client.id).order('number', { ascending: false }).limit(50),
      supabase.from('organisations').select('quote_number_prefix').eq('id', orgId).maybeSingle(),
    ]).then(([q, o]) => { setQuotes(q.data || []); setPrefix(o.data?.quote_number_prefix ?? 'Q') })
  }, [client, orgId])

  async function save(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    const row = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() || null]))
    if (Object.keys(custom).length) row.custom_values = mergeValues(client?.custom_values, fields, custom)
    const { error } = client
      ? await supabase.from('clients').update(row).eq('id', client.id)
      : await supabase.from('clients').insert({ ...row, org_id: orgId })
    setSaving(false)
    if (error) return notify(userMessage(error), 'error')
    if (!client) track('contacts:newClient')
    onSaved()
    onClose()
  }

  return (
    <Modal title={client ? client.name : t('contacts.new.clients')} onClose={onClose}>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <Field id="cl-name" text={`${t('contacts.clientName')} *`}><input id="cl-name" value={form.name} onChange={set('name')} maxLength={200} style={input} autoFocus required /></Field>
        <div style={grid}>
          <Field id="cl-contact" text={t('sub.contact')}><input id="cl-contact" value={form.contact_name} onChange={set('contact_name')} maxLength={120} style={input} /></Field>
          <Field id="cl-email" text={t('sub.email')}><input id="cl-email" type="email" value={form.email} onChange={set('email')} maxLength={200} style={input} /></Field>
          <Field id="cl-phone" text={t('sub.phone')}><input id="cl-phone" type="tel" value={form.phone} onChange={set('phone')} maxLength={60} style={input} /></Field>
          <Field id="cl-tax" text={t('contacts.taxId')}><input id="cl-tax" value={form.tax_id} onChange={set('tax_id')} maxLength={40} style={input} /></Field>
        </div>
        <Field id="cl-address" text={t('contacts.address')}><textarea id="cl-address" value={form.address} onChange={set('address')} rows={2} maxLength={500} style={{ ...input, resize: 'vertical' }} /></Field>
        <Field id="cl-notes" text={t('inv.note')}><input id="cl-notes" value={form.notes} onChange={set('notes')} maxLength={1000} style={input} /></Field>
        <CustomFieldInputs key={fields.length} fields={fields} values={client?.custom_values} idPrefix="cl" onChange={(id, v) => setCustom(c => ({ ...c, [id]: v }))} />
        {client && <p style={small}>{t('contacts.copyNote')}</p>}
        <button type="submit" disabled={saving || !form.name.trim()} style={{ ...btnPrimary, justifyContent: 'center' }}>
          {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={15} />} {t('common.save')}
        </button>
      </form>
      {client && (
        <section style={{ marginTop: '18px' }} aria-labelledby="cl-quotes">
          <h2 id="cl-quotes" style={{ ...label, marginBottom: '6px' }}>{t('contacts.quotes')}</h2>
          {!quotes ? <Loader2 size={16} color={colors.accentText} style={{ animation: 'spin 1s linear infinite' }} />
            : quotes.length === 0 ? <p style={small}>{t('contacts.noQuotes')}</p> : (
              <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {quotes.map(q => (
                  <li key={q.id}>
                    <Link to={`/quote/${q.id}`} style={{ ...card, padding: '7px 10px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', textDecoration: 'none', color: 'var(--text)', fontSize: '13px' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', color: colors.soft }}>{quoteNumber(q, prefix)}</span>
                      <span style={{ flex: '1 1 140px', minWidth: 0, fontWeight: 600 }}>{q.title}</span>
                      {q.issue_date && <span style={small}>{fmt(q.issue_date, 'd MMM yyyy')}</span>}
                      <QuoteStatusBadge status={q.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
        </section>
      )}
    </Modal>
  )
}
