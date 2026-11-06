// The form for one expense (step 9b): a ledger entry for those who see money, or a claim by anyone
// on a gig (what they paid themselves, with the receipt). Also opened from a subrental, a repair, a
// crew fee or a stock purchase with the link and amount filled in.
import { useEffect, useMemo, useState } from 'react'
import { Save, Send, Paperclip, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { localToday } from '../../lib/gigs'
import { notifyConflict } from '../../lib/staleSave'
import { formatMoney } from '../../lib/quotes'
import {
  PAID_HOW, LINK_KINDS, DEFAULT_VAT, vatOf, netFromTotal, linkOf, expenseFromForm, categoryName, saveExpense, uploadReceipt,
  receiptProblem, removeExpense, newId,
} from '../../lib/expenses'
import { useI18n, fmt } from '../../i18n'
import { HintLabel } from '../help/HelpParts'
import { Modal, btn, btnPrimary, btnDanger, input, colors, AvxLoader } from '../ui'
import { ReceiptLink } from './ExpenseParts'

const field = { minWidth: 0, fontSize: '12px', color: colors.soft, display: 'flex', flexDirection: 'column', gap: '4px' }
const full = { gridColumn: '1 / -1' }

// Records that can be linked, per kind: [{ id, text }]
async function loadLinkable(kind, orgId, gigId) {
  if (kind === 'subrental') {
    const { data } = await supabase.from('subrentals').select('id, reference, starts_at, supplier:supplier_id(name)')
      .eq('org_id', orgId).neq('status', 'cancelled').order('starts_at', { ascending: false }).limit(200)
    return (data || []).map(s => ({ id: s.id, text: [s.supplier?.name, s.reference, fmt(s.starts_at, 'd MMM yyyy')].filter(Boolean).join(' · ') }))
  }
  if (kind === 'repair') {
    const { data } = await supabase.from('repairs').select('id, problem, created_at, item:item_id(name)')
      .eq('org_id', orgId).order('created_at', { ascending: false }).limit(200)
    return (data || []).map(r => ({ id: r.id, text: `${r.item?.name || '—'} · ${r.problem.slice(0, 40)} · ${fmt(r.created_at, 'd MMM')}` }))
  }
  if (kind === 'crew_fee') {
    if (!gigId) return []
    const { data } = await supabase.from('gig_crew_fees').select('user_id, unit, rate, quantity').eq('gig_id', gigId).not('rate', 'is', null)
    const ids = (data || []).map(f => f.user_id)
    const { data: people } = ids.length ? await supabase.from('profiles').select('id, full_name').in('id', ids) : { data: [] }
    const names = Object.fromEntries((people || []).map(p => [p.id, p.full_name]))
    return (data || []).map(f => ({ id: f.user_id, text: names[f.user_id] || '—' }))
  }
  if (kind === 'stock_movement') {
    const { data } = await supabase.from('stock_movements').select('id, quantity, created_at, item:item_id(name)')
      .eq('org_id', orgId).eq('kind', 'purchase').is('unit_id', null).order('created_at', { ascending: false }).limit(200)
    return (data || []).map(m => ({ id: m.id, text: `${m.quantity} × ${m.item?.name || '—'} · ${fmt(m.created_at, 'd MMM yyyy')}` }))
  }
  if (kind === 'stock_unit') {
    const { data } = await supabase.from('stock_units').select('id, code, purchase_date, item:item_id(name)')
      .eq('org_id', orgId).order('created_at', { ascending: false }).limit(300)
    return (data || []).map(u => ({ id: u.id, text: `${u.item?.name || '—'} · ${u.code}${u.purchase_date ? ` · ${fmt(u.purchase_date, 'd MMM yyyy')}` : ''}` }))
  }
  return []
}

export default function ExpenseForm({ orgId, expense = null, preset = {}, claim = false, onClose, onSaved }) {
  const { user } = useAuth()
  const { notify } = useToast()
  const { t, lang } = useI18n()
  const isClaim = claim || !!expense?.claimed_by
  const link = expense ? linkOf(expense) : preset.link_kind ? { kind: preset.link_kind, id: preset.link_id } : null
  const [form, setForm] = useState(() => ({
    spent_on: expense?.spent_on || preset.spent_on || localToday(), description: expense?.description || preset.description || '',
    supplier_id: expense?.supplier_id || preset.supplier_id || '', supplier_name: expense?.supplier_name || preset.supplier_name || '',
    category_id: expense?.category_id || preset.category_id || '', amount_net: expense ? String(expense.amount_net) : preset.amount_net != null ? String(preset.amount_net) : '',
    vat_rate: String(expense?.vat_rate ?? preset.vat_rate ?? DEFAULT_VAT), vat_amount: expense ? String(expense.vat_amount) : '',
    currency: expense?.currency || 'EUR', invoice_number: expense?.invoice_number || '', due_on: expense?.due_on || '',
    paid_on: expense?.paid_on || '', paid_how: expense?.paid_how || '', notes: expense?.notes || '',
    gig_id: expense?.gig_id || preset.gig_id || '', link_kind: link?.kind || '', link_id: link?.id ? String(link.id) : '', claim: isClaim,
  }))
  const [totalText, setTotalText] = useState('')
  const [file, setFile] = useState(null)
  const [suppliers, setSuppliers] = useState([])
  const [categories, setCategories] = useState([])
  const [gigs, setGigs] = useState(preset.gigs || [])
  const [linkable, setLinkable] = useState([])
  const [saving, setSaving] = useState(false)
  const set = changes => setForm(f => ({ ...f, ...changes }))
  const locked = !!preset.link_kind // opened from the record itself
  const status = expense?.status

  useEffect(() => {
    if (isClaim && !expense) return
    let live = true
    Promise.all([
      supabase.from('suppliers').select('id, name').eq('org_id', orgId).is('archived_at', null).order('name').limit(1000),
      supabase.from('expense_categories').select('*').eq('org_id', orgId).is('archived_at', null).order('sort'),
      preset.gigs ? { data: preset.gigs } : supabase.from('gigs').select('id, name, start_date').eq('org_id', orgId).order('start_date', { ascending: false }).limit(300),
    ]).then(([s, c, g]) => {
      if (!live) return
      setSuppliers(s.data || [])
      setCategories(c.data || [])
      setGigs(g.data || [])
      // Opened from a record: its usual category (e.g. hire-in for a subrental), until renamed away
      const usual = preset.category_starter && (c.data || []).find(x => x.starter_key === preset.category_starter)
      if (usual && !expense) setForm(f => (f.category_id ? f : { ...f, category_id: usual.id }))
    })
    return () => { live = false }
  }, [orgId, isClaim, expense, preset.gigs, preset.category_starter])

  useEffect(() => {
    if (!form.link_kind || isClaim) { setLinkable([]); return }
    let live = true
    loadLinkable(form.link_kind, orgId, form.gig_id).then(list => { if (live) setLinkable(list) })
    return () => { live = false }
  }, [form.link_kind, form.gig_id, orgId, isClaim])

  const vatAuto = vatOf(form.amount_net, form.vat_rate)
  const vat = form.vat_amount === '' ? vatAuto : Number(String(form.vat_amount).replace(',', '.')) || 0
  const total = Math.round(((Number(String(form.amount_net).replace(',', '.')) || 0) + vat) * 100) / 100
  const byKind = useMemo(() => ['direct', 'overhead', 'capital', 'tax_other'].map(k => [k, categories.filter(c => c.kind === k)]), [categories])

  function onTotal(value) {
    setTotalText(value)
    set({ amount_net: value === '' ? '' : String(netFromTotal(value, form.vat_rate)), vat_amount: '' })
  }

  async function submit(e) {
    e.preventDefault()
    const { row, error } = expenseFromForm(form)
    if (error) { notify(t(error), 'error'); return }
    if (file) {
      const problem = receiptProblem(file)
      if (problem) { notify(t(problem), 'error'); return }
    }
    if (isClaim) { // a claim links only to its gig and its owner can't mark it paid
      Object.assign(row, { subrental_id: null, repair_id: null, crew_fee_user_id: null, stock_movement_id: null, stock_unit_id: null })
      if (!expense || expense.claimed_by === user.id) { row.paid_on = expense?.paid_on || null; row.paid_how = expense?.paid_how || null }
    }
    setSaving(true)
    const id = expense?.id || newId()
    try {
      if (file) Object.assign(row, await uploadReceipt(orgId, id, file))
      if (expense?.status === 'draft' && form.confirm) row.status = 'confirmed'
      const res = await saveExpense({ orgId, id, row, updatedAt: expense?.updated_at, claim: isClaim && !expense, userId: user.id })
      if (res.conflict) { notifyConflict(res.conflict, notify, t); setSaving(false); return }
      track(isClaim ? (expense ? 'expense:claim_edit' : 'expense:claim') : expense ? 'expense:edit' : 'expense:add')
      notify(isClaim && !expense ? t('expenses.claimSent') : t('expenses.saved'), 'success')
      onSaved?.(res.row)
      onClose()
    } catch (error) {
      logger.error('expenses', error, { step: 'save' })
      notify(error?.code === '23505' ? t('expenses.alreadyLinked') : userMessage(error), 'error')
      setSaving(false)
    }
  }

  async function remove() {
    setSaving(true)
    try {
      await removeExpense(expense)
      notify(t('expenses.removed'), 'success')
      onSaved?.(null)
      onClose()
    } catch (error) {
      logger.error('expenses', error, { step: 'remove' })
      notify(userMessage(error), 'error')
      setSaving(false)
    }
  }

  const title = isClaim ? (expense ? t('expenses.editClaim') : t('expenses.newClaim')) : expense ? t('expenses.edit') : t('expenses.add')
  return (
    <Modal title={title} onClose={onClose} maxWidth={560}>
      <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '10px' }}>
        {isClaim && <p style={{ ...full, fontSize: '13px', color: colors.muted, margin: 0, lineHeight: 1.5 }}>{t('expenses.claimIntro')}</p>}
        {status === 'returned' && expense.review_note && (
          <p style={{ ...full, fontSize: '13px', color: colors.danger, margin: 0 }}>{t('expenses.returnedNote', { note: expense.review_note })}</p>
        )}
        <label style={field}>{t('expenses.date')}
          <input type="date" required value={form.spent_on} onChange={e => set({ spent_on: e.target.value })} style={input} />
        </label>
        <label style={field}>{t('expenses.invoiceNumber')}
          <input value={form.invoice_number} onChange={e => set({ invoice_number: e.target.value })} maxLength={80} style={input} />
        </label>
        <label style={{ ...field, ...full }}>{t('expenses.description')}
          <input required value={form.description} onChange={e => set({ description: e.target.value })} maxLength={300} placeholder={t('expenses.descriptionPlaceholder')} style={input} />
        </label>
        <div style={{ ...full, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '10px' }}>
          {suppliers.length > 0 && (
            <label style={field}>{t('expenses.supplier')}
              <select value={form.supplier_id} onChange={e => set({ supplier_id: e.target.value })} style={input}>
                <option value="">{t('expenses.supplierTyped')}</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          )}
          {!form.supplier_id && (
            <label style={{ ...field, ...(suppliers.length ? {} : full) }}>{suppliers.length ? t('expenses.supplierName') : t('expenses.supplier')}
              <input value={form.supplier_name} onChange={e => set({ supplier_name: e.target.value })} maxLength={200} style={input} />
            </label>
          )}
        </div>
        {categories.length > 0 && (
          <div style={{ ...full, minWidth: 0 }}>
            <HintLabel htmlFor="expense-category" hint="expense-category">{t('expenses.category')}</HintLabel>
            <select id="expense-category" value={form.category_id} onChange={e => set({ category_id: e.target.value })} style={input}>
              <option value="">{t('expenses.noCategory')}</option>
              {byKind.map(([kind, list]) => list.length > 0 && (
                <optgroup key={kind} label={t(`expenses.kind.${kind}`)}>
                  {list.map(c => <option key={c.id} value={c.id}>{categoryName(c, t)}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
        )}
        <label style={field}>{t('expenses.net')}
          <input inputMode="decimal" required value={form.amount_net} onChange={e => { setTotalText(''); set({ amount_net: e.target.value }) }} style={input} />
        </label>
        <label style={field}>{t('expenses.vatRate')}
          <input inputMode="decimal" value={form.vat_rate} onChange={e => { setTotalText(''); set({ vat_rate: e.target.value, vat_amount: '' }) }} style={input} />
        </label>
        <label style={field}>{t('expenses.vatAmount')}
          <input inputMode="decimal" value={form.vat_amount} placeholder={String(vatAuto)} onChange={e => set({ vat_amount: e.target.value })} style={input} />
        </label>
        <label style={field}>{t('expenses.totalWithVat')}
          <input inputMode="decimal" value={totalText !== '' ? totalText : form.amount_net !== '' ? String(total) : ''} onChange={e => onTotal(e.target.value)} style={input} />
        </label>
        <p style={{ ...full, fontSize: '12px', color: colors.muted, margin: 0 }}>{t('expenses.vatHelp')}</p>
        {!isClaim && (
          <>
            <label style={field}>{t('expenses.currency')}
              <input value={form.currency} onChange={e => set({ currency: e.target.value.toUpperCase().slice(0, 3) })} maxLength={3} style={input} />
            </label>
            <label style={field}>{t('expenses.dueOn')}
              <input type="date" value={form.due_on} onChange={e => set({ due_on: e.target.value })} style={input} />
            </label>
            <label style={field}>{t('expenses.paidOn')}
              <input type="date" value={form.paid_on} onChange={e => set({ paid_on: e.target.value })} style={input} />
            </label>
            <label style={field}>{t('expenses.paidHowLabel')}
              <select value={form.paid_how} onChange={e => set({ paid_how: e.target.value })} style={input}>
                <option value="">—</option>
                {PAID_HOW.map(p => <option key={p} value={p}>{t(`expenses.paidHow.${p}`)}</option>)}
              </select>
            </label>
          </>
        )}
        {isClaim && expense && expense.claimed_by !== user.id && expense.status === 'confirmed' && (
          <label style={{ ...field, ...full }}>{t('expenses.reimbursedOn')}
            <input type="date" value={form.paid_on} onChange={e => set({ paid_on: e.target.value })} style={input} />
          </label>
        )}
        {(gigs.length > 0 || form.gig_id) && (
          <label style={{ ...field, ...full }}>{t('expenses.gig')}
            <select value={form.gig_id} disabled={isClaim || locked} onChange={e => set({ gig_id: e.target.value, ...(form.link_kind === 'crew_fee' ? { link_id: '' } : {}) })} style={input}>
              {!isClaim && <option value="">{t('expenses.noGig')}</option>}
              {gigs.map(g => <option key={g.id} value={g.id}>{g.name}{g.start_date ? ` · ${fmt(g.start_date, 'd MMM yyyy')}` : ''}</option>)}
            </select>
          </label>
        )}
        {!isClaim && (
          <div style={{ ...full, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ minWidth: 0 }}>
              <HintLabel htmlFor="expense-link" hint="expense-link">{t('expenses.linkLabel')}</HintLabel>
              <select id="expense-link" value={form.link_kind} disabled={locked} onChange={e => set({ link_kind: e.target.value, link_id: '' })} style={input}>
                <option value="">{t('expenses.link.none')}</option>
                {LINK_KINDS.map(k => <option key={k} value={k}>{t(`expenses.link.${k}`)}</option>)}
              </select>
            </div>
            {form.link_kind && (
              <label style={field}>{t('expenses.linkWhich')}
                <select value={form.link_id} disabled={locked} required onChange={e => set({ link_id: e.target.value })} style={input}>
                  <option value="">{form.link_kind === 'crew_fee' && !form.gig_id ? t('expenses.pickGigFirst') : '—'}</option>
                  {locked && !linkable.some(l => String(l.id) === form.link_id) && <option value={form.link_id}>{preset.link_text || '…'}</option>}
                  {linkable.map(l => <option key={l.id} value={String(l.id)}>{l.text}</option>)}
                </select>
              </label>
            )}
          </div>
        )}
        <div style={{ ...full, display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ ...btn, cursor: 'pointer' }}>
            <Paperclip size={14} /> {file ? file.name.slice(0, 30) : expense?.receipt_path ? t('expenses.replaceReceipt') : t('expenses.addReceipt')}
            <input type="file" accept="image/*,application/pdf" onChange={e => setFile(e.target.files?.[0] || null)} style={{ display: 'none' }} />
          </label>
          {expense?.receipt_path && !file && <ReceiptLink path={expense.receipt_path} name={expense.receipt_name} />}
        </div>
        <textarea value={form.notes} onChange={e => set({ notes: e.target.value })} maxLength={1000} rows={2}
          placeholder={t('expenses.notes')} aria-label={t('expenses.notes')} style={{ ...input, ...full, resize: 'vertical' }} />
        {status === 'draft' && (
          <label style={{ ...full, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
            <input type="checkbox" checked={!!form.confirm} onChange={e => set({ confirm: e.target.checked })} /> {t('expenses.confirmDraft')}
          </label>
        )}
        <p style={{ ...full, fontSize: '14px', margin: 0 }}><strong>{t('expenses.totalIs', { amount: formatMoney(total, form.currency || 'EUR', lang) })}</strong></p>
        <div style={{ ...full, display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="submit" disabled={saving} style={{ ...btnPrimary, flex: '1 1 180px', justifyContent: 'center' }}>
            {saving ? <AvxLoader size={14} /> : isClaim && (!expense || status === 'returned') ? <Send size={14} /> : <Save size={14} />}
            {' '}{isClaim && !expense ? t('expenses.sendClaim') : isClaim && status === 'returned' ? t('expenses.sendAgain') : t('expenses.save')}
          </button>
          {expense && (
            <button type="button" disabled={saving} onClick={remove} style={btnDanger}><Trash2 size={14} /> {t('expenses.remove')}</button>
          )}
        </div>
      </form>
    </Modal>
  )
}
