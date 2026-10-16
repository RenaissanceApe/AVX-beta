import { useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Upload, Loader2, Search, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { useI18n } from '../../i18n'
import { Modal, btn, btnPrimary, iconBtn, input, label, card, colors } from '../ui'
import { PRICED_KINDS, UNITS, formatMoney, parsePriceImport, parsePrice } from '../../lib/quotes'

const matches = (item, q) => !q || [item.name, item.category, item.details].some(v => (v || '').toLowerCase().includes(q))
const byCategory = items => {
  const groups = new Map()
  for (const item of items) {
    const key = item.category || ''
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }
  return [...groups.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
}

// Price list tab on the Quotes page: reusable items with a default price.
export function PriceListTab({ orgId, userId, items, setItems }) {
  const { t, lang } = useI18n()
  const { notify } = useToast()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null) // item | 'new'
  const [importing, setImporting] = useState(false)
  const visible = useMemo(() => items.filter(i => matches(i, search.trim().toLowerCase())), [items, search])

  async function remove(item) {
    if (!window.confirm(t('prices.confirmDelete', { name: item.name }))) return
    const { error } = await supabase.from('price_items').delete().eq('id', item.id)
    if (error) return notify(userMessage(error), 'error')
    setItems(list => list.filter(i => i.id !== item.id))
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <Search size={14} color={colors.muted} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('prices.search')} aria-label={t('prices.search')} style={{ ...input, paddingLeft: '32px' }} />
        </div>
        <button onClick={() => setImporting(true)} style={{ ...btn, background: 'transparent', borderColor: 'rgba(255,255,255,0.12)', color: colors.soft }}><Upload size={14} /> {t('prices.import')}</button>
        <button onClick={() => setEditing('new')} style={btn}><Plus size={14} /> {t('prices.add')}</button>
      </div>

      {items.length === 0 ? (
        <p style={{ color: colors.muted, fontSize: '13px', textAlign: 'center', padding: '40px 20px', lineHeight: 1.6 }}>{t('prices.empty')}</p>
      ) : byCategory(visible).map(([category, list]) => (
        <section key={category || '—'} style={{ marginBottom: '16px' }}>
          <h3 style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: colors.muted, marginBottom: '6px' }}>{category || t('prices.noCategory')}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {list.map(item => (
              <div key={item.id} style={{ ...card, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 600, fontSize: '14px' }}>{item.name}</span>
                  <span style={{ fontSize: '12px', color: colors.muted }}>{t(`lineKind.${item.kind}`)}</span>
                </span>
                <span style={{ fontWeight: 700, fontSize: '14px', whiteSpace: 'nowrap' }}>
                  {formatMoney(item.unit_price, 'EUR', lang)} <span style={{ fontWeight: 400, color: colors.muted, fontSize: '12px' }}>/ {t(`unit.${item.unit}`, { count: 1 })}</span>
                </span>
                <button onClick={() => setEditing(item)} aria-label={t('prices.editNamed', { name: item.name })} title={t('common.edit')} style={iconBtn}><Pencil size={14} /></button>
                <button onClick={() => remove(item)} aria-label={t('prices.deleteNamed', { name: item.name })} title={t('common.delete')} style={iconBtn}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </section>
      ))}

      {editing && (
        <PriceItemModal orgId={orgId} userId={userId} item={editing === 'new' ? null : editing}
          categories={[...new Set(items.map(i => i.category).filter(Boolean))]}
          onClose={() => setEditing(null)}
          onSaved={saved => setItems(list => (list.some(i => i.id === saved.id) ? list.map(i => (i.id === saved.id ? saved : i)) : [...list, saved]).sort((a, b) => a.name.localeCompare(b.name)))} />
      )}
      {importing && (
        <ImportModal orgId={orgId} userId={userId} onClose={() => setImporting(false)}
          onImported={added => setItems(list => [...list, ...added].sort((a, b) => a.name.localeCompare(b.name)))} />
      )}
    </div>
  )
}

function PriceItemModal({ orgId, userId, item, categories, onClose, onSaved }) {
  const { t } = useI18n()
  const { notify } = useToast()
  const [form, setForm] = useState({
    name: item?.name || '', unit_price: item?.unit_price ?? '', category: item?.category || '',
    kind: item?.kind || 'rental', unit: item?.unit || 'unit', details: item?.details || '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function save(e) {
    e.preventDefault()
    const price = parsePrice(form.unit_price)
    if (!form.name.trim() || !Number.isFinite(price) || price < 0) return
    setSaving(true)
    const row = {
      name: form.name.trim(), unit_price: price, category: form.category.trim() || null,
      kind: form.kind, unit: form.unit, details: form.details.trim() || null, updated_at: new Date().toISOString(),
    }
    const query = item
      ? supabase.from('price_items').update(row).eq('id', item.id)
      : supabase.from('price_items').insert({ ...row, org_id: orgId, created_by: userId })
    const { data, error } = await query.select().single()
    setSaving(false)
    if (error) {
      logger.error('prices', error, { step: item ? 'update' : 'insert' })
      return notify(userMessage(error), 'error')
    }
    onSaved(data)
    onClose()
  }

  return (
    <Modal title={item ? t('prices.editTitle') : t('prices.add')} onClose={onClose}>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div>
          <label style={label} htmlFor="pi-name">{t('prices.name')} *</label>
          <input id="pi-name" value={form.name} onChange={e => set('name', e.target.value)} maxLength={200} style={input} autoFocus required />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <label style={label} htmlFor="pi-price">{t('prices.price')} *</label>
            <input id="pi-price" inputMode="decimal" value={form.unit_price} onChange={e => set('unit_price', e.target.value)} style={input} required />
          </div>
          <div>
            <label style={label} htmlFor="pi-unit">{t('quote.col.unit')}</label>
            <select id="pi-unit" value={form.unit} onChange={e => set('unit', e.target.value)} style={{ ...input, cursor: 'pointer' }}>
              {UNITS.map(u => <option key={u} value={u}>{t(`unit.${u}`, { count: 1 })}</option>)}
            </select>
          </div>
          <div>
            <label style={label} htmlFor="pi-kind">{t('quote.col.kind')}</label>
            <select id="pi-kind" value={form.kind} onChange={e => set('kind', e.target.value)} style={{ ...input, cursor: 'pointer' }}>
              {PRICED_KINDS.map(k => <option key={k} value={k}>{t(`lineKind.${k}`)}</option>)}
            </select>
          </div>
          <div>
            <label style={label} htmlFor="pi-cat">{t('prices.category')}</label>
            <input id="pi-cat" list="pi-categories" value={form.category} onChange={e => set('category', e.target.value)} maxLength={80} style={input} />
            <datalist id="pi-categories">{categories.map(c => <option key={c} value={c} />)}</datalist>
          </div>
        </div>
        <div>
          <label style={label} htmlFor="pi-details">{t('quote.lineDetails')}</label>
          <textarea id="pi-details" value={form.details} onChange={e => set('details', e.target.value)} rows={2} maxLength={1000} style={{ ...input, resize: 'vertical' }} />
        </div>
        <button type="submit" disabled={saving} style={{ ...btnPrimary, justifyContent: 'center' }}>
          {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={15} />} {t('common.save')}
        </button>
      </form>
    </Modal>
  )
}

function ImportModal({ orgId, userId, onClose, onImported }) {
  const { t } = useI18n()
  const { notify } = useToast()
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const parsed = useMemo(() => parsePriceImport(text), [text])

  async function submit() {
    if (!parsed.items.length) return
    setSaving(true)
    const { data, error } = await supabase.from('price_items')
      .insert(parsed.items.map(i => ({ ...i, org_id: orgId, created_by: userId }))).select()
    setSaving(false)
    if (error) {
      logger.error('prices', error, { step: 'import', count: parsed.items.length })
      return notify(userMessage(error), 'error')
    }
    notify(t('prices.imported', { count: data.length }), 'success')
    onImported(data)
    onClose()
  }

  return (
    <Modal title={t('prices.import')} onClose={onClose} maxWidth={600}>
      <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.6, marginBottom: '8px' }}>{t('prices.importHelp')}</p>
      <pre style={{ fontSize: '12px', background: 'rgba(255,255,255,0.05)', padding: '8px 10px', borderRadius: '8px', marginBottom: '10px', whiteSpace: 'pre-wrap' }}>
        {t('prices.importExample')}
      </pre>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={10} aria-label={t('prices.import')} autoFocus
        style={{ ...input, fontFamily: 'monospace', fontSize: '12px', resize: 'vertical' }} />
      <p role="status" style={{ fontSize: '13px', margin: '8px 0 12px', color: parsed.errors.length ? '#F59E0B' : colors.soft }}>
        {t('prices.importReady', { count: parsed.items.length })}
        {parsed.errors.length > 0 && ` · ${t('prices.importSkipped', { lines: parsed.errors.join(', ') })}`}
      </p>
      <button onClick={submit} disabled={saving || !parsed.items.length} style={{ ...btnPrimary, justifyContent: 'center', width: '100%' }}>
        {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={15} />} {t('prices.importButton', { count: parsed.items.length })}
      </button>
    </Modal>
  )
}

// Picker used inside a quote section: search, tick items, add them as lines.
export function PricePickerModal({ items, onPick, onClose }) {
  const { t, lang } = useI18n()
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState([])
  const visible = useMemo(() => items.filter(i => matches(i, search.trim().toLowerCase())), [items, search])
  const toggle = id => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]))

  return (
    <Modal title={t('prices.pickTitle')} onClose={onClose} maxWidth={560}>
      {items.length === 0 ? (
        <p style={{ color: colors.muted, fontSize: '13px', lineHeight: 1.6 }}>{t('prices.pickEmpty')}</p>
      ) : (
        <>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('prices.search')} aria-label={t('prices.search')} autoFocus style={{ ...input, marginBottom: '10px' }} />
          <div style={{ maxHeight: '50vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '12px' }}>
            {byCategory(visible).map(([category, list]) => (
              <div key={category || '—'}>
                <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: colors.muted, padding: '8px 4px 4px' }}>{category || t('prices.noCategory')}</div>
                {list.map(item => (
                  <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 8px', borderRadius: '8px', cursor: 'pointer', background: picked.includes(item.id) ? 'rgba(30,200,120,0.1)' : 'transparent' }}>
                    <input type="checkbox" checked={picked.includes(item.id)} onChange={() => toggle(item.id)} style={{ accentColor: colors.accent }} />
                    <span style={{ flex: 1, fontSize: '14px' }}>{item.name}</span>
                    <span style={{ fontSize: '13px', color: colors.soft, whiteSpace: 'nowrap' }}>{formatMoney(item.unit_price, 'EUR', lang)}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
          <button onClick={() => onPick(items.filter(i => picked.includes(i.id)))} disabled={!picked.length} style={{ ...btnPrimary, justifyContent: 'center', width: '100%' }}>
            <Plus size={15} /> {t('prices.addPicked', { count: picked.length })}
          </button>
        </>
      )}
    </Modal>
  )
}
