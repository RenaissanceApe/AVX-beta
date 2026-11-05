// Expenses (step 9b): recurring costs (for everyone who sees money) and the organisation's
// categories and VAT setting (admins).
import { useCallback, useEffect, useState } from 'react'
import { Plus, Pencil, Loader2, Repeat, Save, Archive, ArchiveRestore } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { localToday } from '../../lib/gigs'
import { formatMoney } from '../../lib/quotes'
import { KINDS, EVERY, PAID_HOW, DEFAULT_VAT, categoryName, upcomingDates, vatOf } from '../../lib/expenses'
import { useI18n, fmt } from '../../i18n'
import EmptyState from '../EmptyState'
import { HintLabel } from '../help/HelpParts'
import { Modal, btn, btnPrimary, btnDanger, iconBtn, input, card, colors } from '../ui'

const section = { ...card, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }
const h2 = { fontSize: '15px', fontWeight: 800, margin: 0 }
const field = { minWidth: 0, fontSize: '12px', color: colors.soft, display: 'flex', flexDirection: 'column', gap: '4px' }
const full = { gridColumn: '1 / -1' }
const li = { display: 'flex', gap: '4px 10px', alignItems: 'center', flexWrap: 'wrap', padding: '9px 0', borderTop: `1px solid ${colors.border}`, fontSize: '14px' }

// ── Recurring costs ──────────────────────────────────────────────────────────
function RecurringForm({ orgId, rec, categories, suppliers, onClose, onSaved }) {
  const { t, lang } = useI18n()
  const { notify } = useToast()
  const [f, setF] = useState({
    description: rec?.description || '', supplier_id: rec?.supplier_id || '', supplier_name: rec?.supplier_name || '',
    category_id: rec?.category_id || '', amount_net: rec ? String(rec.amount_net) : '', vat_rate: String(rec?.vat_rate ?? DEFAULT_VAT),
    currency: rec?.currency || 'EUR', paid_how: rec?.paid_how || '', notes: rec?.notes || '', every: rec?.every || 'month',
    starts_on: rec?.starts_on || localToday(), ends_on: rec?.ends_on || '',
  })
  const [saving, setSaving] = useState(false)
  const set = c => setF(x => ({ ...x, ...c }))
  const net = Number(String(f.amount_net).replace(',', '.'))

  async function submit(e) {
    e.preventDefault()
    if (!f.description.trim() || !Number.isFinite(net)) { notify(t('expenses.needAmount'), 'error'); return }
    setSaving(true)
    const row = {
      description: f.description.trim(), supplier_id: f.supplier_id || null, supplier_name: f.supplier_id ? null : f.supplier_name.trim() || null,
      category_id: f.category_id || null, amount_net: net, vat_rate: Number(String(f.vat_rate).replace(',', '.')) || 0,
      currency: f.currency || 'EUR', paid_how: f.paid_how || null, notes: f.notes.trim() || null, ends_on: f.ends_on || null,
    }
    try {
      const { error } = rec
        ? await supabase.from('expense_recurrences').update(row).eq('id', rec.id)
        : await supabase.from('expense_recurrences').insert({ ...row, org_id: orgId, every: f.every, starts_on: f.starts_on })
      if (error) throw error
      if (!rec && f.starts_on <= localToday()) await supabase.rpc('draft_recurring_expenses_now', { p_org: orgId })
      track(rec ? 'expense:recurring_edit' : 'expense:recurring_add')
      notify(t('expenses.saved'), 'success')
      onSaved()
      onClose()
    } catch (error) {
      logger.error('expenses', error, { step: 'recurring' })
      notify(userMessage(error), 'error')
      setSaving(false)
    }
  }

  return (
    <Modal title={rec ? t('expenses.recurringEdit') : t('expenses.recurringAdd')} onClose={onClose} maxWidth={520}>
      <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '10px' }}>
        <label style={{ ...field, ...full }}>{t('expenses.description')}
          <input required value={f.description} onChange={e => set({ description: e.target.value })} maxLength={300} placeholder={t('expenses.recurringPlaceholder')} style={input} />
        </label>
        {suppliers.length > 0 && (
          <label style={field}>{t('expenses.supplier')}
            <select value={f.supplier_id} onChange={e => set({ supplier_id: e.target.value })} style={input}>
              <option value="">{t('expenses.supplierTyped')}</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}
        {!f.supplier_id && (
          <label style={{ ...field, ...(suppliers.length ? {} : full) }}>{suppliers.length ? t('expenses.supplierName') : t('expenses.supplier')}
            <input value={f.supplier_name} onChange={e => set({ supplier_name: e.target.value })} maxLength={200} style={input} />
          </label>
        )}
        <label style={{ ...field, ...full }}>{t('expenses.category')}
          <select value={f.category_id} onChange={e => set({ category_id: e.target.value })} style={input}>
            <option value="">{t('expenses.noCategory')}</option>
            {categories.filter(c => !c.archived_at).map(c => <option key={c.id} value={c.id}>{categoryName(c, t)}</option>)}
          </select>
        </label>
        <label style={field}>{t('expenses.net')}
          <input inputMode="decimal" required value={f.amount_net} onChange={e => set({ amount_net: e.target.value })} style={input} />
        </label>
        <label style={field}>{t('expenses.vatRate')}
          <input inputMode="decimal" value={f.vat_rate} onChange={e => set({ vat_rate: e.target.value })} style={input} />
        </label>
        <div style={{ ...field, minWidth: 0 }}>
          <HintLabel htmlFor="rec-every" hint="expense-recurring">{t('expenses.every')}</HintLabel>
          <select id="rec-every" value={f.every} disabled={!!rec} onChange={e => set({ every: e.target.value })} style={input}>
            {EVERY.map(x => <option key={x} value={x}>{t(`expenses.everyOpt.${x}`)}</option>)}
          </select>
        </div>
        <label style={field}>{t('expenses.paidHowLabel')}
          <select value={f.paid_how} onChange={e => set({ paid_how: e.target.value })} style={input}>
            <option value="">—</option>
            {PAID_HOW.map(p => <option key={p} value={p}>{t(`expenses.paidHow.${p}`)}</option>)}
          </select>
        </label>
        <label style={field}>{t('expenses.startsOn')}
          <input type="date" required disabled={!!rec} value={f.starts_on} onChange={e => set({ starts_on: e.target.value })} style={input} />
        </label>
        <label style={field}>{t('expenses.endsOn')}
          <input type="date" value={f.ends_on} min={f.starts_on} onChange={e => set({ ends_on: e.target.value })} style={input} />
        </label>
        {Number.isFinite(net) && (
          <p style={{ ...full, fontSize: '13px', margin: 0, color: colors.muted }}>
            {t('expenses.recurringPreview', {
              amount: formatMoney(net + vatOf(net, f.vat_rate), f.currency || 'EUR', lang),
              dates: upcomingDates({ starts_on: rec?.starts_on || f.starts_on, every: f.every, drafted: rec?.drafted || 0, ends_on: f.ends_on || null }, 3).map(d => fmt(d, 'd MMM yyyy')).join(', ') || '—',
            })}
          </p>
        )}
        <button type="submit" disabled={saving} style={{ ...btnPrimary, ...full, justifyContent: 'center' }}>
          {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />} {t('expenses.save')}
        </button>
      </form>
    </Modal>
  )
}

export function RecurringPanel({ orgId, categories, version, onChanged }) {
  const { t, lang } = useI18n()
  const { notify } = useToast()
  const [list, setList] = useState(null)
  const [suppliers, setSuppliers] = useState([])
  const [editing, setEditing] = useState(null) // rec | 'new'

  const load = useCallback(async () => {
    const [r, s] = await Promise.all([
      supabase.from('expense_recurrences').select('*').eq('org_id', orgId).is('removed_at', null).order('next_on').limit(200),
      supabase.from('suppliers').select('id, name').eq('org_id', orgId).is('archived_at', null).order('name').limit(1000),
    ])
    if (r.error) logger.error('expenses', r.error, { step: 'recurring' })
    setList(r.data || [])
    setSuppliers(s.data || [])
  }, [orgId])
  useEffect(() => { load() }, [load, version])

  async function stop(rec) {
    const { error } = await supabase.from('expense_recurrences').update({ removed_at: new Date().toISOString() }).eq('id', rec.id)
    if (error) { logger.error('expenses', error, { step: 'recurring_stop' }); notify(userMessage(error), 'error'); return }
    notify(t('expenses.recurringStopped'), 'success')
    load()
  }

  return (
    <section style={section} aria-labelledby="exp-recurring">
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <h2 id="exp-recurring" style={{ ...h2, flex: '1 1 160px' }}>{t('expenses.recurring')}</h2>
        <button type="button" onClick={() => setEditing('new')} style={btn}><Plus size={14} /> {t('expenses.recurringAdd')}</button>
      </div>
      <p style={{ fontSize: '13px', color: colors.muted, margin: 0, lineHeight: 1.5 }}>{t('expenses.recurringIntro')}</p>
      {!list ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}><Loader2 size={20} color={colors.accentText} style={{ animation: 'spin 1s linear infinite' }} /></div>
      ) : list.length === 0 ? (
        <EmptyState compact icon={<Repeat size={26} />} title={t('expenses.recurringNone')} body={t('expenses.recurringNoneBody')}
          action={t('expenses.recurringAdd')} onAction={() => setEditing('new')} />
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {list.map(r => (
            <li key={r.id} style={li}>
              <span style={{ flex: '1 1 180px', minWidth: 0 }}>
                <span style={{ fontWeight: 600 }}>{r.description}</span>
                <span style={{ display: 'block', fontSize: '12px', color: colors.muted }}>
                  {t(`expenses.everyOpt.${r.every}`)} · {t('expenses.nextOn', { date: fmt(r.next_on, 'd MMM yyyy') })}
                  {r.ends_on && ` · ${t('expenses.untilDate', { date: fmt(r.ends_on, 'd MMM yyyy') })}`}
                  {' · '}{categoryName(categories.find(c => c.id === r.category_id), t)}
                </span>
              </span>
              <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(Number(r.amount_net) + vatOf(r.amount_net, r.vat_rate), r.currency, lang)}</span>
              <button type="button" onClick={() => setEditing(r)} aria-label={t('expenses.recurringEditFor', { name: r.description })} style={iconBtn}><Pencil size={14} /></button>
              <button type="button" onClick={() => stop(r)} style={{ ...btnDanger, padding: '6px 10px' }}>{t('expenses.recurringStop')}</button>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <RecurringForm orgId={orgId} rec={editing === 'new' ? null : editing} categories={categories} suppliers={suppliers}
          onClose={() => setEditing(null)} onSaved={() => { load(); onChanged?.() }} />
      )}
    </section>
  )
}

// ── Categories and VAT (admins) ──────────────────────────────────────────────
function CategoryForm({ orgId, cat, onClose, onSaved }) {
  const { t } = useI18n()
  const { notify } = useToast()
  const [f, setF] = useState({ name: cat ? categoryName(cat, t) : '', kind: cat?.kind || 'direct', spread_months: String(cat?.spread_months || 60), vat_recoverable: cat ? cat.vat_recoverable : true })
  const [saving, setSaving] = useState(false)
  const set = c => setF(x => ({ ...x, ...c }))
  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    const renamed = !cat || f.name.trim() !== categoryName(cat, t)
    const row = { kind: f.kind, spread_months: f.kind === 'capital' ? Math.max(1, Math.min(600, parseInt(f.spread_months, 10) || 60)) : null, vat_recoverable: f.vat_recoverable,
      ...(renamed ? { name: f.name.trim() } : {}) }
    const { error } = cat
      ? await supabase.from('expense_categories').update(row).eq('id', cat.id)
      : await supabase.from('expense_categories').insert({ ...row, org_id: orgId, sort: 500 })
    if (error) { logger.error('expenses', error, { step: 'category' }); notify(userMessage(error), 'error'); setSaving(false); return }
    notify(t('expenses.saved'), 'success')
    onSaved()
    onClose()
  }
  return (
    <Modal title={cat ? t('expenses.categoryEdit') : t('expenses.categoryAdd')} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <label style={field}>{t('expenses.categoryName')}
          <input required value={f.name} onChange={e => set({ name: e.target.value })} maxLength={80} style={input} />
        </label>
        <div style={{ minWidth: 0 }}>
          <HintLabel htmlFor="cat-kind" hint="expense-kind">{t('expenses.kindLabel')}</HintLabel>
          <select id="cat-kind" value={f.kind} onChange={e => set({ kind: e.target.value })} style={input}>
            {KINDS.map(k => <option key={k} value={k}>{t(`expenses.kind.${k}`)}</option>)}
          </select>
        </div>
        {f.kind === 'capital' && (
          <label style={field}>{t('expenses.spreadMonths')}
            <input type="number" min={1} max={600} value={f.spread_months} onChange={e => set({ spread_months: e.target.value })} style={input} />
          </label>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
          <input type="checkbox" checked={!f.vat_recoverable} onChange={e => set({ vat_recoverable: !e.target.checked })} /> {t('expenses.vatNotRecoverable')}
        </label>
        <button type="submit" disabled={saving || !f.name.trim()} style={{ ...btnPrimary, justifyContent: 'center' }}><Save size={14} /> {t('expenses.save')}</button>
      </form>
    </Modal>
  )
}

export function CategorySettings({ orgId, categories, onChanged }) {
  const { t } = useI18n()
  const { notify } = useToast()
  const [recovers, setRecovers] = useState(null)
  const [editing, setEditing] = useState(null)
  useEffect(() => {
    supabase.from('org_finance_settings').select('recovers_vat').eq('org_id', orgId).maybeSingle()
      .then(({ data }) => setRecovers(data ? data.recovers_vat : true))
  }, [orgId])

  async function saveRecovers(value) {
    setRecovers(value)
    // Update the row, or make it the first time (an upsert would also write org_id, which can't be updated)
    const upd = await supabase.from('org_finance_settings').update({ recovers_vat: value }).eq('org_id', orgId).select('org_id')
    const { error } = upd.error || upd.data?.length ? upd
      : await supabase.from('org_finance_settings').insert({ org_id: orgId, recovers_vat: value })
    if (error) { logger.error('expenses', error, { step: 'vat_setting' }); notify(userMessage(error), 'error'); return }
    notify(t('expenses.saved'), 'success')
    onChanged?.()
  }
  async function archive(c, on) {
    const { error } = await supabase.from('expense_categories').update({ archived_at: on ? new Date().toISOString() : null }).eq('id', c.id)
    if (error) { logger.error('expenses', error, { step: 'archive' }); notify(userMessage(error), 'error'); return }
    onChanged?.()
  }

  return (
    <section style={section} aria-labelledby="exp-categories">
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <h2 id="exp-categories" style={{ ...h2, flex: '1 1 160px' }}>{t('expenses.categories')}</h2>
        <button type="button" onClick={() => setEditing('new')} style={btn}><Plus size={14} /> {t('expenses.categoryAdd')}</button>
      </div>
      {recovers !== null && (
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '14px', lineHeight: 1.5 }}>
          <input type="checkbox" checked={recovers} onChange={e => saveRecovers(e.target.checked)} style={{ marginTop: '4px' }} />
          <span>{t('expenses.recoversVat')}<span style={{ display: 'block', fontSize: '12px', color: colors.muted }}>{t('expenses.recoversVatHelp')}</span></span>
        </label>
      )}
      {KINDS.map(kind => (
        <div key={kind}>
          <h3 style={{ fontSize: '13px', fontWeight: 700, color: colors.muted, margin: '6px 0 0' }}>{t(`expenses.kind.${kind}`)}</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {categories.filter(c => c.kind === kind).map(c => (
              <li key={c.id} style={{ ...li, opacity: c.archived_at ? 0.6 : 1 }}>
                <span style={{ flex: '1 1 160px', minWidth: 0 }}>
                  {categoryName(c, t)}
                  <span style={{ fontSize: '12px', color: colors.muted }}>
                    {c.spread_months ? ` · ${t('expenses.spreadOver', { count: c.spread_months })}` : ''}
                    {!c.vat_recoverable ? ` · ${t('expenses.vatIsCost')}` : ''}
                    {c.archived_at ? ` · ${t('expenses.archived')}` : ''}
                  </span>
                </span>
                <button type="button" onClick={() => setEditing(c)} aria-label={t('expenses.categoryEditFor', { name: categoryName(c, t) })} style={iconBtn}><Pencil size={14} /></button>
                <button type="button" onClick={() => archive(c, !c.archived_at)} aria-label={t(c.archived_at ? 'expenses.restoreFor' : 'expenses.archiveFor', { name: categoryName(c, t) })} style={iconBtn}>
                  {c.archived_at ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {editing && <CategoryForm orgId={orgId} cat={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => onChanged?.()} />}
    </section>
  )
}
