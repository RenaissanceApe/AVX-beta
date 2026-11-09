import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Plus, Receipt, Download, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { useWorkspace } from '../lib/WorkspaceContext'
import { localToday } from '../lib/gigs'
import { formatMoney } from '../lib/quotes'
import {
  EXPENSE_SELECT, KINDS, monthBounds, byCategory, categoryName, costOf, monthlyShare, isOverdue, toReimburse, downloadExpensesCsv, loadCategories,
} from '../lib/expenses'
import { useI18n, fmt } from '../i18n'
import { btnPrimary, input, colors, AvxLoader, PageHeader, Section, Stack, space } from '../components/ui'
import { FilterTabs, pageWrap } from '../components/ListParts'
import AppShell from '../components/shell/AppShell'
import EmptyState from '../components/EmptyState'
import { PageHelp } from '../components/help/HelpParts'
import ExpenseForm from '../components/expenses/ExpenseForm'
import { ExpenseRow, ClaimActions, Totals } from '../components/expenses/ExpenseParts'
import { RecurringPanel, CategorySettings } from '../components/expenses/ExpenseSettings'
import CrewToPay from '../components/expenses/CrewToPay'

const VIEWS = ['month', 'unpaid', 'crew', 'claims', 'recurring', 'categories']
const DETAILS_KEY = 'avx.expenses.details'
const readDetails = () => { try { return localStorage.getItem(DETAILS_KEY) === '1' } catch { return false } }
const writeDetails = v => { try { localStorage.setItem(DETAILS_KEY, v ? '1' : '0') } catch { /* private window */ } }

// Expenses (step 9b) at /org/:orgId/expenses, for the organisation's admins and members: this month
// with totals by kind and category, what is unpaid and due, claims to approve and reimburse,
// recurring costs, and (admins) the categories and VAT setting. CSV for the accountant.
export default function ExpensesPage() {
  const { orgId } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { t, lang } = useI18n()
  const { roleIn, loading, setWorkspace, orgs } = useWorkspace()
  const role = roleIn(orgId)
  const canSee = role === 'admin' || role === 'member'
  const isAdmin = role === 'admin'
  const view = VIEWS.includes(params.get('view')) && (params.get('view') !== 'categories' || isAdmin) ? params.get('view') : 'month'
  // Reports → Money opens a category's list with ?month=YYYY-MM&category=<id>
  const [month, setMonth] = useState(() => (/^\d{4}-\d{2}$/.test(params.get('month') || '') ? params.get('month') : fmt(new Date(), 'yyyy-MM')))
  const [list, setList] = useState(null)
  const [categories, setCategories] = useState([])
  const [recovers, setRecovers] = useState(true)
  const [names, setNames] = useState({})
  const [filter, setFilter] = useState(() => ({ category: params.get('category') || '', kind: '', search: '' }))
  const [details, setDetails] = useState(readDetails)
  const [editing, setEditing] = useState(null) // expense | 'new'
  const [version, setVersion] = useState(0)
  const today = localToday()
  useEffect(() => { setWorkspace(orgId) }, [orgId, setWorkspace])
  const changed = () => setVersion(v => v + 1)
  const orgName = orgs.find(o => o.id === orgId)?.name || ''

  useEffect(() => {
    if (!canSee) return
    loadCategories(orgId).then(setCategories).catch(error => logger.error('expenses', error, { step: 'categories' }))
    supabase.from('org_finance_settings').select('recovers_vat').eq('org_id', orgId).maybeSingle()
      .then(({ data }) => setRecovers(data ? data.recovers_vat : true))
  }, [canSee, orgId, version])

  const load = useCallback(async () => {
    if (!canSee || view === 'recurring' || view === 'categories' || view === 'crew') return
    setList(null)
    let q = supabase.from('expenses').select(EXPENSE_SELECT).eq('org_id', orgId).is('removed_at', null)
    if (view === 'month') {
      const [from, to] = monthBounds(month)
      q = q.gte('spent_on', from).lte('spent_on', to).in('status', ['confirmed', 'draft']).order('spent_on').order('created_at')
    } else if (view === 'unpaid') {
      q = q.eq('status', 'confirmed').is('paid_on', null).order('due_on', { ascending: true, nullsFirst: false }).order('spent_on')
    } else {
      q = q.not('claimed_by', 'is', null).in('status', ['claimed', 'returned']).order('spent_on')
    }
    const { data, error } = await q.limit(1000)
    if (error) logger.error('expenses', error, { step: 'list', view })
    const rows = data || []
    setList(rows)
    const ids = [...new Set(rows.map(e => e.claimed_by).filter(Boolean))]
    if (ids.length) {
      const { data: people } = await supabase.from('profiles').select('id, full_name').in('id', ids)
      setNames(Object.fromEntries((people || []).map(p => [p.id, p.full_name])))
    }
  }, [canSee, view, orgId, month])
  useEffect(() => { load() }, [load, version])

  const cats = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])
  const shown = useMemo(() => (list || []).filter(e => {
    if (filter.category && e.category_id !== filter.category) return false
    if (filter.kind && cats.get(e.category_id)?.kind !== filter.kind) return false
    if (filter.search) {
      const s = filter.search.toLowerCase()
      if (![e.description, e.supplier?.name, e.supplier_name, e.invoice_number, e.gig?.name].some(x => x && x.toLowerCase().includes(s))) return false
    }
    return true
  }), [list, filter, cats])
  const confirmed = shown.filter(e => e.status === 'confirmed')
  const drafts = shown.filter(e => e.status === 'draft')

  // This month by kind: cost (excl. VAT, plus VAT that isn't recovered); capital spread over its months
  const kindSums = useMemo(() => KINDS.map(kind => {
    const rows = confirmed.filter(e => cats.get(e.category_id)?.kind === kind && e.currency === 'EUR')
    const cost = rows.reduce((s, e) => s + costOf(e, cats.get(e.category_id), recovers), 0)
    const monthCost = kind === 'capital'
      ? rows.reduce((s, e) => s + monthlyShare(costOf(e, cats.get(e.category_id), recovers), cats.get(e.category_id)?.spread_months || 1), 0)
      : cost
    return { kind, cost: Math.round(cost * 100) / 100, monthCost: Math.round(monthCost * 100) / 100, count: rows.length }
  }), [confirmed, cats, recovers])
  const uncategorised = confirmed.filter(e => !e.category_id).length

  const setView = v => setParams(v === 'month' ? {} : { view: v }, { replace: true })
  const toggleDetails = () => { setDetails(d => { writeDetails(!d); return !d }) }
  const csv = () => downloadExpensesCsv(shown.filter(e => e.status === 'confirmed'), { categories, t, names },
    `${t('expenses.csvName')} ${orgName} ${view === 'month' ? month : today}`)

  const title = t('expenses.pageTitle')
  if (loading) return <AppShell><div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}><AvxLoader size={24} color={colors.accentText} /></div></AppShell>
  if (!canSee) return (
    <AppShell>
      <div style={{ maxWidth: '360px', margin: '80px auto', textAlign: 'center', padding: '0 16px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>{title}</h1>
        <p style={{ color: colors.muted, fontSize: '14px', lineHeight: 1.6, marginBottom: '20px' }}>{t('expenses.noAccess')}</p>
        <button type="button" onClick={() => navigate('/dashboard')} style={btnPrimary}><ArrowLeft size={14} /> {t('common.backToDashboard')}</button>
      </div>
    </AppShell>
  )

  const unpaidGroups = view === 'unpaid' ? [
    ['reimburse', shown.filter(toReimburse)],
    ['overdue', shown.filter(e => !toReimburse(e) && isOverdue(e, today))],
    ['due', shown.filter(e => !toReimburse(e) && !isOverdue(e, today))],
  ] : []

  return (
    <AppShell>
      <div style={pageWrap}>
        <PageHeader title={title} help={<PageHelp page="org-expenses" />}
          primary={<button type="button" onClick={() => setEditing('new')} style={btnPrimary}><Plus size={16} aria-hidden="true" /> {t('expenses.add')}</button>}
          secondary={view === 'month' || view === 'unpaid' ? [{ label: t('expenses.csv'), icon: <Download size={15} aria-hidden="true" />, onClick: csv, disabled: !confirmed.length }] : []} />

        <FilterTabs tabs label={t('expenses.views')} value={view} onChange={setView} style={{ marginBottom: space[5] }}
          items={VIEWS.filter(v => v !== 'categories' || isAdmin).map(v => ({ key: v, label: t(`expenses.view.${v}`) }))} />

        {view === 'crew' && <CrewToPay orgId={orgId} isAdmin={isAdmin} />}
        {view === 'recurring' && <RecurringPanel orgId={orgId} categories={categories} version={version} onChanged={changed} />}
        {view === 'categories' && <CategorySettings orgId={orgId} categories={categories} onChanged={changed} />}

        {(view === 'month' || view === 'unpaid' || view === 'claims') && (
          <Section id="exp-list" title={view === 'month' ? fmt(`${month}-01`, 'MMMM yyyy') : t(`expenses.view.${view}`)}
            aside={view === 'unpaid' ? (
              /* K3: unpaid expenses and recurring costs in the cash position */
              <Link to={`/org/${orgId}/reports?tab=money&view=cash`} style={{ fontSize: '13px', color: colors.accentText }}>{t('expenses.cashLink')}</Link>
            ) : view === 'month' ? (
              <input id="exp-month" type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} aria-label={t('hours.month')} style={{ ...input, width: 'auto' }} />
            ) : null}>
          <Stack gap={4}>
            {view === 'month' && list && (
              <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: `${space[1]} ${space[3]}`, fontSize: '14px', margin: 0 }}>
                <dt style={{ fontWeight: 700, minWidth: 0 }}>{t('expenses.monthTotal')}</dt>
                <dd style={{ margin: 0, fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap' }}><Totals list={confirmed} lang={lang} what="net" /></dd>
                {kindSums.filter(k => k.count).map(k => (
                  <FragmentRow key={k.kind} term={t(`expenses.kind.${k.kind}`)}
                    value={<>{formatMoney(k.cost, 'EUR', lang)}{k.kind === 'capital' && <span style={{ display: 'block', fontSize: '13px', color: colors.muted }}>{t('expenses.thisMonthShare', { amount: formatMoney(k.monthCost, 'EUR', lang) })}</span>}</>} />
                ))}
                {details && <FragmentRow term={t('expenses.vatTotal')} value={<Totals list={confirmed} lang={lang} what="vat" />} />}
                {details && <FragmentRow term={t('expenses.withVat')} value={<Totals list={confirmed} lang={lang} what="total" />} />}
              </dl>
            )}
            {view === 'month' && uncategorised > 0 && <p style={{ fontSize: '13px', color: colors.warn, margin: 0 }}>{t('expenses.uncategorised', { count: uncategorised })}</p>}
            {view === 'month' && !recovers && <p style={{ fontSize: '13px', color: colors.muted, margin: 0 }}>{t('expenses.vatCountsAsCost')}</p>}

            <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: '1 1 100%', minWidth: 0 }}>
                <Search size={14} color={colors.muted} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} aria-hidden="true" />
                <input value={filter.search} onChange={e => setFilter(f => ({ ...f, search: e.target.value }))} placeholder={t('expenses.search')} aria-label={t('expenses.search')} style={{ ...input, paddingLeft: '32px' }} />
              </div>
              <select value={filter.kind} onChange={e => setFilter(f => ({ ...f, kind: e.target.value, category: '' }))} aria-label={t('expenses.kindLabel')} style={{ ...input, width: 'auto', minWidth: 0, maxWidth: '100%', flex: '1 1 130px' }}>
                <option value="">{t('expenses.allKinds')}</option>
                {KINDS.map(k => <option key={k} value={k}>{t(`expenses.kind.${k}`)}</option>)}
              </select>
              <select value={filter.category} onChange={e => setFilter(f => ({ ...f, category: e.target.value }))} aria-label={t('expenses.category')} style={{ ...input, width: 'auto', minWidth: 0, maxWidth: '100%', flex: '1 1 150px' }}>
                <option value="">{t('expenses.allCategories')}</option>
                {categories.filter(c => !filter.kind || c.kind === filter.kind).map(c => <option key={c.id} value={c.id}>{categoryName(c, t)}</option>)}
              </select>
              <label style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: '13px', minHeight: '36px' }}>
                <input type="checkbox" checked={details} onChange={toggleDetails} /> {t('expenses.showDetails')}
              </label>
            </div>

            {!list ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: space[5] }}><AvxLoader size={22} color={colors.accentText} /></div>
            ) : shown.length === 0 ? (
              <EmptyState compact icon={<Receipt size={26} />} title={t(`expenses.empty.${view}`)} body={t(`expenses.emptyBody.${view}`)}
                guide="office-expenses" {...(view === 'month' ? { action: t('expenses.add'), onAction: () => setEditing('new') } : {})} />
            ) : view === 'unpaid' ? (
              unpaidGroups.filter(([, rows]) => rows.length).map(([key, rows]) => (
                <div key={key}>
                  <h3 style={{ fontSize: '13px', fontWeight: 700, margin: `0 0 ${space[1]}`, display: 'flex', justifyContent: 'space-between', gap: space[2], color: key === 'overdue' ? colors.danger : colors.text }}>
                    <span>{t(`expenses.unpaidGroup.${key}`, { count: rows.length })}</span><Totals list={rows} lang={lang} />
                  </h3>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {rows.map(e => <ExpenseRow key={e.id} e={e} categories={categories} names={names} today={today} details={details} onOpen={() => setEditing(e)} />)}
                  </ul>
                </div>
              ))
            ) : (
              <>
                {drafts.length > 0 && <p style={{ fontSize: '13px', color: colors.warn, margin: 0 }}>{t('expenses.draftsWaiting', { count: drafts.length })}</p>}
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {shown.map(e => (
                    <ExpenseRow key={e.id} e={e} categories={categories} names={names} today={today} details={details || view === 'claims'} onOpen={() => setEditing(e)}>
                      {view === 'claims' && e.status === 'claimed' && <ClaimActions e={e} onDone={changed} />}
                    </ExpenseRow>
                  ))}
                </ul>
              </>
            )}
            {view === 'month' && details && list && confirmed.length > 0 && (
              <div>
                <h3 style={{ fontSize: '13px', fontWeight: 700, margin: `0 0 ${space[1]}` }}>{t('expenses.byCategory')}</h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {byCategory(confirmed, categories).map(g => (
                    <li key={`${g.id}|${g.currency}`} style={{ display: 'flex', gap: space[2], padding: `${space[2]} 0`, borderTop: `1px solid ${colors.border}`, fontSize: '13px' }}>
                      <span style={{ flex: 1, minWidth: 0 }}>{categoryName(g.category, t)} <span style={{ color: colors.muted }}>· {g.count}</span></span>
                      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{formatMoney(g.net, g.currency, lang)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Stack>
          </Section>
        )}
      </div>
      {editing && (
        <ExpenseForm orgId={orgId} expense={editing === 'new' ? null : editing} preset={{ spent_on: view === 'month' && !month.startsWith(today.slice(0, 7)) ? `${month}-01` : undefined }}
          onClose={() => setEditing(null)} onSaved={changed} />
      )}
    </AppShell>
  )
}

function FragmentRow({ term, value }) {
  return (
    <>
      <dt style={{ color: colors.muted }}>{term}</dt>
      <dd style={{ margin: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{value}</dd>
    </>
  )
}
