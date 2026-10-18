import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2, Loader2, Check, X, Handshake, Truck, Inbox, Link2, Copy, RefreshCw, Archive, ArchiveRestore, Pencil } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { SUBRENTAL_STATUSES, isOpenSubrental, subrentalTotal, equipmentWindow } from '../../lib/inventory'
import { rangeText } from '../../lib/clashes'
import { formatMoney } from '../../lib/quotes'
import { toLocalInput } from '../gig/Booking'
import { useI18n, t } from '../../i18n'
import { Modal, btn, btnPrimary, iconBtn, input, label, card, colors } from '../ui'

const AMBER = '#F59E0B'
const select = { ...input, appearance: 'auto' }
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }
const small = { fontSize: '12px', color: colors.muted, lineHeight: 1.5 }
const STATUS_COLOR = { draft: colors.muted, requested: AMBER, confirmed: colors.accent, declined: colors.danger, returned: colors.soft, cancelled: colors.muted }
export const SUBRENTAL_SELECT = '*, supplier:supplier_id(name, partner_org_id), gig:gig_id(name), lines:subrental_lines(*)'
const fromLocalInput = v => (v ? new Date(v).toISOString() : null)
const money = (v, lang) => formatMoney(v, 'EUR', lang)

const Field = ({ id, text, children }) => <div><label style={label} htmlFor={id}>{text}</label>{children}</div>

// Hire gear in: supplier, dates (optionally for a gig), lines with costs, status.
// preset: { gig, itemId, quantity } when started from a short line on a gig.
export function SubrentalModal({ orgId, org, subrental, items = [], preset = {}, onClose, onSaved }) {
  const { notify } = useToast()
  const { lang } = useI18n()
  const presetWin = preset.gig ? equipmentWindow(preset.gig, org) : null
  const [suppliers, setSuppliers] = useState(null)
  const [gigs, setGigs] = useState([])
  const [form, setForm] = useState({
    supplier_id: subrental?.supplier_id || '', new_supplier: '', gig_id: subrental?.gig_id || preset.gig?.id || '',
    status: subrental?.status || 'draft', reference: subrental?.reference || '', notes: subrental?.notes || '',
    from: toLocalInput(subrental?.starts_at || presetWin?.from), until: toLocalInput(subrental?.ends_at || presetWin?.until),
  })
  const presetItem = items.find(i => i.id === preset.itemId)
  const [lines, setLines] = useState(() => (subrental?.lines?.length
    ? [...subrental.lines].sort((a, b) => a.position - b.position).map(l => ({ ...l, key: l.id }))
    : [{ key: 'l0', item_id: preset.itemId || '', description: presetItem?.name || '', quantity: preset.quantity || 1, unit_cost: '' }]))
  const [saving, setSaving] = useState(false)
  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }))

  useEffect(() => {
    Promise.all([
      supabase.from('suppliers').select('id, name, partner_org_id, archived_at').eq('org_id', orgId).order('name'),
      supabase.from('gigs').select('id, name, start_date, end_date').eq('org_id', orgId).neq('status', 'archived').order('start_date', { ascending: false }).limit(150),
    ]).then(([s, g]) => {
      setSuppliers((s.data || []).filter(x => !x.archived_at || x.id === subrental?.supplier_id))
      setGigs(g.data || [])
    })
  }, [orgId]) // eslint-disable-line react-hooks/exhaustive-deps

  function pickGig(id) {
    const gig = gigs.find(g => g.id === id)
    const win = gig ? equipmentWindow(gig, org) : null
    setForm(f => ({ ...f, gig_id: id, ...(win && !f.from && !f.until ? { from: toLocalInput(win.from), until: toLocalInput(win.until) } : {}) }))
  }
  const setLine = (key, changes) => setLines(ls => ls.map(l => (l.key === key ? { ...l, ...changes } : l)))
  const supplier = suppliers?.find(s => s.id === form.supplier_id)
  const newSupplier = form.supplier_id === 'new'
  const goodLines = lines.filter(l => l.description.trim() && Number(l.quantity) >= 1)
  const total = subrentalTotal({ lines: goodLines, quoted_total: subrental?.quoted_total })
  const invalid = !form.from || !form.until || new Date(form.until) <= new Date(form.from) || !goodLines.length
    || !(form.supplier_id && (!newSupplier || form.new_supplier.trim()))

  async function save(e) {
    e.preventDefault()
    if (invalid) return
    setSaving(true)
    let supplierId = form.supplier_id
    if (newSupplier) {
      const { data, error } = await supabase.from('suppliers').insert({ org_id: orgId, name: form.new_supplier.trim().slice(0, 200) }).select('id').single()
      if (error) { setSaving(false); return notify(userMessage(error), 'error') }
      supplierId = data.id
    }
    const row = {
      supplier_id: supplierId, gig_id: form.gig_id || null, status: form.status, reference: form.reference.trim() || null,
      notes: form.notes.trim() || null, starts_at: fromLocalInput(form.from), ends_at: fromLocalInput(form.until),
    }
    const res = subrental
      ? await supabase.from('subrentals').update(row).eq('id', subrental.id).select('id').single()
      : await supabase.from('subrentals').insert({ ...row, org_id: orgId }).select('id').single()
    if (res.error) {
      setSaving(false)
      logger.error('subrentals', res.error, { step: 'save' })
      return notify(userMessage(res.error), 'error')
    }
    const id = res.data.id
    // Lines are rewritten as a whole: they're the subrental's own list
    if (subrental?.lines?.length) {
      const { error } = await supabase.from('subrental_lines').delete().eq('subrental_id', id)
      if (error) { setSaving(false); return notify(userMessage(error), 'error') }
    }
    const { error } = await supabase.from('subrental_lines').insert(goodLines.map((l, i) => ({
      subrental_id: id, org_id: orgId, item_id: l.item_id || null, description: l.description.trim().slice(0, 200),
      quantity: Math.max(1, Math.round(Number(l.quantity) || 1)),
      unit_cost: l.unit_cost === '' || l.unit_cost == null ? null : Math.max(0, Number(String(l.unit_cost).replace(',', '.')) || 0), position: i,
    })))
    setSaving(false)
    if (error) {
      logger.error('subrentals', error, { step: 'lines' })
      return notify(userMessage(error), 'error')
    }
    if (!subrental) track('inventory:subrental')
    onSaved()
    onClose()
  }

  return (
    <Modal title={subrental ? t('sub.edit') : t('sub.new')} onClose={onClose} maxWidth={720}>
      {!suppliers ? <Loader2 size={18} color={colors.accent} style={{ animation: 'spin 1s linear infinite' }} /> : (
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={grid}>
            <Field id="sb-supplier" text={`${t('sub.supplier')} *`}>
              <select id="sb-supplier" value={form.supplier_id} onChange={set('supplier_id')} style={select} autoFocus={!subrental}>
                <option value="">—</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}{s.partner_org_id ? ` · ${t('sub.onAvx')}` : ''}</option>)}
                <option value="new">{t('sub.newSupplierOption')}</option>
              </select>
            </Field>
            {newSupplier && (
              <Field id="sb-new" text={t('sub.supplierName')}><input id="sb-new" value={form.new_supplier} onChange={set('new_supplier')} maxLength={200} style={input} /></Field>
            )}
            <Field id="sb-gig" text={t('sub.gig')}>
              <select id="sb-gig" value={form.gig_id} onChange={e => pickGig(e.target.value)} style={select}>
                <option value="">{t('sub.noGig')}</option>
                {gigs.map(g => <option key={g.id} value={g.id}>{g.name}{g.start_date ? ` · ${g.start_date}` : ''}</option>)}
              </select>
            </Field>
          </div>
          <div style={grid}>
            <Field id="sb-from" text={t('sub.from')}><input id="sb-from" type="datetime-local" value={form.from} onChange={set('from')} style={input} /></Field>
            <Field id="sb-until" text={t('sub.until')}><input id="sb-until" type="datetime-local" value={form.until} onChange={set('until')} style={input} /></Field>
            <Field id="sb-status" text={t('inv.status')}>
              <select id="sb-status" value={form.status} onChange={set('status')} style={select}>
                {SUBRENTAL_STATUSES.map(s => <option key={s} value={s}>{t(`sub.status.${s}`)}</option>)}
              </select>
            </Field>
            <Field id="sb-ref" text={t('sub.reference')}><input id="sb-ref" value={form.reference} onChange={set('reference')} maxLength={80} style={input} /></Field>
          </div>
          {supplier?.partner_org_id && <p style={{ ...small, color: '#38BDF8' }}>{t('sub.partnerHint')}</p>}
          {subrental?.answered_at && (
            <div style={{ ...card, padding: '10px 12px', fontSize: '13px', borderColor: STATUS_COLOR[subrental.status] }}>
              <strong>{t('sub.answered', { status: t(`sub.status.${subrental.status}`) })}</strong>
              {subrental.reply_note && <span style={{ color: colors.soft }}> · “{subrental.reply_note}”</span>}
              {subrental.quoted_total != null && <span style={{ color: colors.soft }}> · {money(subrental.quoted_total, lang)}</span>}
            </div>
          )}

          <div>
            <div style={{ ...label, marginBottom: '6px' }}>{t('sub.lines')}</div>
            {lines.map(l => (
              <div key={l.key} style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '6px' }}>
                <select value={l.item_id || ''} aria-label={t('sub.coversItem')} style={{ ...select, flex: '1 1 150px', padding: '6px 8px', fontSize: '13px' }}
                  onChange={e => { const it = items.find(i => i.id === e.target.value); setLine(l.key, { item_id: e.target.value, description: l.description || it?.name || '' }) }}>
                  <option value="">{t('sub.notInCatalogue')}</option>
                  {items.filter(i => i.tracking !== 'none' && !i.archived_at).map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
                <input value={l.description} onChange={e => setLine(l.key, { description: e.target.value })} maxLength={200} placeholder={t('sub.description')}
                  aria-label={t('sub.description')} style={{ ...input, flex: '2 1 180px', padding: '6px 8px' }} />
                <input type="number" min={1} value={l.quantity} onChange={e => setLine(l.key, { quantity: e.target.value })}
                  aria-label={t('inv.quantity')} style={{ ...input, width: '70px', padding: '6px 8px' }} />
                <input inputMode="decimal" value={l.unit_cost ?? ''} onChange={e => setLine(l.key, { unit_cost: e.target.value })} placeholder={t('sub.unitCost')}
                  aria-label={t('sub.unitCost')} style={{ ...input, width: '90px', padding: '6px 8px' }} />
                <button type="button" onClick={() => setLines(ls => ls.filter(x => x.key !== l.key))} disabled={lines.length === 1}
                  aria-label={t('equip.remove')} style={iconBtn}><Trash2 size={13} /></button>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setLines(ls => [...ls, { key: `l${Date.now()}`, item_id: '', description: '', quantity: 1, unit_cost: '' }])}
                style={{ ...btn, padding: '5px 10px', fontSize: '12px' }}><Plus size={12} /> {t('sub.addLine')}</button>
              <strong style={{ fontSize: '14px' }}>{t('sub.total')} {money(total, lang)}</strong>
            </div>
            <p style={{ ...small, marginTop: '6px' }}>{t('sub.linesHint')}</p>
          </div>
          <Field id="sb-notes" text={t('inv.note')}><input id="sb-notes" value={form.notes} onChange={set('notes')} maxLength={1000} style={input} /></Field>
          <button type="submit" disabled={saving || invalid} style={{ ...btnPrimary, justifyContent: 'center' }}>
            {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={15} />} {t('common.save')}
          </button>
        </form>
      )}
    </Modal>
  )
}

export function SupplierModal({ orgId, supplier, onClose, onSaved }) {
  const { notify } = useToast()
  const [form, setForm] = useState({
    name: supplier?.name || '', contact_name: supplier?.contact_name || '', email: supplier?.email || '',
    phone: supplier?.phone || '', notes: supplier?.notes || '',
  })
  const [code, setCode] = useState('')
  const [linked, setLinked] = useState(supplier?.partner_org_id ? '' : null) // '' = linked (name unknown), text = just linked
  const [saving, setSaving] = useState(false)
  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }))

  async function save(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    const row = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() || null]))
    const { error } = supplier
      ? await supabase.from('suppliers').update(row).eq('id', supplier.id)
      : await supabase.from('suppliers').insert({ ...row, org_id: orgId })
    setSaving(false)
    if (error) return notify(userMessage(error), 'error')
    onSaved()
    onClose()
  }
  async function link() {
    const { data, error } = await supabase.rpc('link_supplier', { p_supplier: supplier.id, p_code: code.trim() })
    if (error) return notify(error.code === '22023' ? t('sub.badCode') : userMessage(error), 'error')
    setLinked(data || '')
    setCode('')
    notify(t('sub.linked', { org: data }), 'success')
    onSaved()
  }
  async function unlink() {
    if (!window.confirm(t('sub.unlinkConfirm'))) return
    const { error } = await supabase.from('suppliers').update({ partner_org_id: null }).eq('id', supplier.id)
    if (error) return notify(userMessage(error), 'error')
    setLinked(null)
    onSaved()
  }

  return (
    <Modal title={supplier ? supplier.name : t('sub.newSupplier')} onClose={onClose}>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <Field id="sp-name" text={`${t('sub.supplierName')} *`}><input id="sp-name" value={form.name} onChange={set('name')} maxLength={200} style={input} autoFocus required /></Field>
        <div style={grid}>
          <Field id="sp-contact" text={t('sub.contact')}><input id="sp-contact" value={form.contact_name} onChange={set('contact_name')} maxLength={120} style={input} /></Field>
          <Field id="sp-email" text={t('sub.email')}><input id="sp-email" type="email" value={form.email} onChange={set('email')} maxLength={200} style={input} /></Field>
          <Field id="sp-phone" text={t('sub.phone')}><input id="sp-phone" type="tel" value={form.phone} onChange={set('phone')} maxLength={60} style={input} /></Field>
        </div>
        <Field id="sp-notes" text={t('inv.note')}><input id="sp-notes" value={form.notes} onChange={set('notes')} maxLength={1000} style={input} /></Field>
        {supplier && (
          <div style={{ ...card, padding: '10px 12px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}><Link2 size={13} /> {t('sub.onAvxTitle')}</div>
            {linked !== null ? (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', fontSize: '13px' }}>
                <span style={{ color: colors.accent, flex: 1 }}>{linked ? t('sub.linked', { org: linked }) : t('sub.isLinked')}</span>
                <button type="button" onClick={unlink} style={{ ...btn, padding: '4px 9px', fontSize: '12px' }}>{t('sub.unlink')}</button>
              </div>
            ) : (
              <>
                <p style={{ ...small, marginBottom: '6px' }}>{t('sub.linkHint')}</p>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input value={code} onChange={e => setCode(e.target.value)} maxLength={20} placeholder="P-…" aria-label={t('sub.code')} style={{ ...input, fontFamily: 'monospace' }} />
                  <button type="button" onClick={link} disabled={!code.trim()} style={btn}>{t('sub.link')}</button>
                </div>
              </>
            )}
          </div>
        )}
        <button type="submit" disabled={saving || !form.name.trim()} style={{ ...btnPrimary, justifyContent: 'center' }}>
          {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={15} />} {t('common.save')}
        </button>
      </form>
    </Modal>
  )
}

export function SubrentalRow({ s, onOpen }) {
  const { lang } = useI18n()
  const count = (s.lines || []).reduce((n, l) => n + (l.quantity || 0), 0)
  return (
    <button onClick={() => onOpen(s)} style={{ ...card, padding: '9px 12px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', width: '100%', textAlign: 'left', cursor: 'pointer', color: '#fff', font: 'inherit' }}>
      <span style={{ flex: '1 1 220px', minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 600, fontSize: '14px' }}>{s.supplier?.name}{s.reference ? <span style={{ color: colors.muted, fontWeight: 400 }}> · {s.reference}</span> : null}</span>
        <span style={{ fontSize: '12px', color: colors.muted, overflowWrap: 'anywhere' }}>
          {[rangeText(s.starts_at, s.ends_at), s.gig?.name, (s.lines || []).map(l => `${l.quantity} × ${l.description}`).join(', ')].filter(Boolean).join(' · ')}
        </span>
      </span>
      <span style={{ fontSize: '12px', color: colors.soft, whiteSpace: 'nowrap' }}>{t('sub.pieces', { count })} · {money(subrentalTotal(s), lang)}</span>
      <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: STATUS_COLOR[s.status] }}>{t(`sub.status.${s.status}`)}</span>
    </button>
  )
}

// Requests from organisations that hire from you on AVX
function IncomingRequests({ orgId }) {
  const { notify } = useToast()
  const { lang } = useI18n()
  const [rows, setRows] = useState([])
  const [answers, setAnswers] = useState({}) // id -> { note, total }
  const load = () => supabase.rpc('incoming_hire_requests', { p_org: orgId }).then(({ data, error }) => {
    if (error) logger.error('subrentals', error, { step: 'incoming' })
    setRows(data || [])
  })
  useEffect(() => { load() }, [orgId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function answer(r, verdict) {
    const a = answers[r.id] || {}
    const total = a.total ? Number(String(a.total).replace(',', '.')) : null
    const { error } = await supabase.rpc('answer_hire_request', { p_id: r.id, p_answer: verdict, p_note: a.note || null, p_total: Number.isFinite(total) ? total : null })
    if (error) return notify(error.code === '22023' ? t('sub.alreadyAnswered') : userMessage(error), 'error')
    notify(t(`sub.answerSent.${verdict}`), 'success')
    load()
  }
  if (!rows.length) return null
  const setA = (id, changes) => setAnswers(m => ({ ...m, [id]: { ...m[id], ...changes } }))
  return (
    <section style={{ marginBottom: '22px' }}>
      <h2 style={{ fontSize: '17px', fontWeight: 700, margin: '4px 0 8px', display: 'flex', alignItems: 'center', gap: '7px' }}><Inbox size={16} color={colors.accent} /> {t('sub.incoming')}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {rows.slice(0, 30).map(r => (
          <div key={r.id} style={{ ...card, padding: '10px 12px', borderColor: r.status === 'requested' ? 'rgba(245,158,11,0.4)' : colors.border }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'baseline', flexWrap: 'wrap' }}>
              <strong style={{ flex: '1 1 200px' }}>{r.from_org}{r.reference ? <span style={{ color: colors.muted, fontWeight: 400 }}> · {r.reference}</span> : null}</strong>
              <span style={{ fontSize: '12px', color: colors.soft }}>{rangeText(r.starts_at, r.ends_at)}</span>
              <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: STATUS_COLOR[r.status] }}>{t(`sub.status.${r.status}`)}</span>
            </div>
            <div style={{ fontSize: '13px', color: colors.soft, margin: '4px 0' }}>{(r.lines || []).map(l => `${l.quantity} × ${l.description}`).join(', ')}</div>
            {r.notes && <div style={small}>“{r.notes}”</div>}
            {r.status === 'requested' ? (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                <input value={answers[r.id]?.note || ''} onChange={e => setA(r.id, { note: e.target.value })} maxLength={1000} placeholder={t('sub.replyNote')}
                  aria-label={t('sub.replyNote')} style={{ ...input, flex: '2 1 200px', padding: '6px 8px' }} />
                <input inputMode="decimal" value={answers[r.id]?.total || ''} onChange={e => setA(r.id, { total: e.target.value })} placeholder={t('sub.price')}
                  aria-label={t('sub.price')} style={{ ...input, width: '110px', padding: '6px 8px' }} />
                <button onClick={() => answer(r, 'confirmed')} style={{ ...btnPrimary, padding: '6px 12px' }}><Check size={14} /> {t('sub.confirm')}</button>
                <button onClick={() => answer(r, 'declined')} style={{ ...btn, padding: '6px 12px' }}><X size={14} /> {t('sub.decline')}</button>
              </div>
            ) : (r.reply_note || r.quoted_total != null) && (
              <div style={small}>{[r.reply_note && `“${r.reply_note}”`, r.quoted_total != null && money(r.quoted_total, lang)].filter(Boolean).join(' · ')}</div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

function CrossHireCode({ orgId, isAdmin }) {
  const { notify } = useToast()
  const [code, setCode] = useState(null)
  async function load(fresh) {
    if (fresh && !window.confirm(t('sub.newCodeConfirm'))) return
    const { data, error } = await supabase.rpc('partner_code', { p_org: orgId, p_new: !!fresh })
    if (error) return notify(userMessage(error), 'error')
    setCode(data)
  }
  async function copy() {
    try { await navigator.clipboard.writeText(code); notify(t('sub.copied'), 'success') } catch { /* not allowed */ }
  }
  return (
    <section style={{ ...card, marginTop: '22px' }}>
      <h2 style={{ fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}><Link2 size={15} color={colors.accent} /> {t('sub.ourCode')}</h2>
      <p style={{ ...small, marginBottom: '8px' }}>{t('sub.ourCodeHint')}</p>
      {code ? (
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          <code style={{ fontSize: '16px', fontWeight: 700, letterSpacing: '0.05em', padding: '4px 10px', background: 'rgba(255,255,255,0.06)', borderRadius: '6px' }}>{code}</code>
          <button onClick={copy} style={{ ...btn, padding: '5px 9px', fontSize: '12px' }}><Copy size={12} /> {t('sub.copy')}</button>
          {isAdmin && <button onClick={() => load(true)} style={{ ...btn, padding: '5px 9px', fontSize: '12px' }}><RefreshCw size={12} /> {t('sub.newCode')}</button>}
        </div>
      ) : <button onClick={() => load(false)} style={btn}>{t('sub.showCode')}</button>}
    </section>
  )
}

// Inventory → Subrentals: what you hire in, from whom, and requests from others
export function SubrentalsTab({ orgId, inv }) {
  const [subs, setSubs] = useState(null)
  const [suppliers, setSuppliers] = useState([])
  const [showPast, setShowPast] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState(null) // subrental or {}
  const [supplier, setSupplier] = useState(null) // supplier or {}

  async function load() {
    const [s, sp] = await Promise.all([
      supabase.from('subrentals').select(SUBRENTAL_SELECT).eq('org_id', orgId).order('starts_at', { ascending: false }).limit(300),
      supabase.from('suppliers').select('*').eq('org_id', orgId).order('name'),
    ])
    if (s.error) logger.error('subrentals', s.error, { step: 'list' })
    setSubs(s.data || [])
    setSuppliers(sp.data || [])
  }
  useEffect(() => { load() }, [orgId]) // eslint-disable-line react-hooks/exhaustive-deps
  async function archive(sp) {
    const { error } = await supabase.from('suppliers').update({ archived_at: sp.archived_at ? null : new Date().toISOString() }).eq('id', sp.id)
    if (!error) load()
  }

  if (!subs) return <Loader2 size={20} color={colors.accent} style={{ animation: 'spin 1s linear infinite' }} />
  const now = new Date().toISOString()
  const current = subs.filter(s => isOpenSubrental(s) && s.ends_at >= now).sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const past = subs.filter(s => !current.includes(s))
  const visibleSuppliers = suppliers.filter(s => showArchived || !s.archived_at)

  return (
    <div>
      <IncomingRequests orgId={orgId} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
        <h2 style={{ fontSize: '17px', fontWeight: 700, flex: '1 1 auto', display: 'flex', alignItems: 'center', gap: '7px' }}><Handshake size={16} color={colors.accent} /> {t('sub.current')} <span style={{ color: colors.soft, fontWeight: 600 }}>· {current.length}</span></h2>
        <button onClick={() => setEditing({})} style={btnPrimary}><Plus size={15} /> {t('sub.new')}</button>
      </div>
      {current.length === 0 ? <p style={{ ...small, marginBottom: '14px' }}>{t('sub.noneCurrent')}</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '14px' }}>
          {current.map(s => <SubrentalRow key={s.id} s={s} onOpen={setEditing} />)}
        </div>
      )}
      {past.length > 0 && (
        <>
          <button onClick={() => setShowPast(v => !v)} style={{ ...btn, padding: '5px 10px', fontSize: '12px', marginBottom: '8px' }}>{showPast ? t('sub.hidePast') : t('sub.showPast', { count: past.length })}</button>
          {showPast && <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '14px' }}>{past.map(s => <SubrentalRow key={s.id} s={s} onOpen={setEditing} />)}</div>}
        </>
      )}

      <section style={{ marginTop: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 700, flex: '1 1 auto', display: 'flex', alignItems: 'center', gap: '7px' }}><Truck size={16} color={colors.accent} /> {t('sub.suppliers')}</h2>
          {suppliers.some(s => s.archived_at) && <button onClick={() => setShowArchived(v => !v)} style={{ ...btn, padding: '5px 10px', fontSize: '12px' }}>{showArchived ? t('inv.hideArchived') : t('inv.showArchived')}</button>}
          <button onClick={() => setSupplier({})} style={btn}><Plus size={14} /> {t('sub.newSupplier')}</button>
        </div>
        {visibleSuppliers.length === 0 ? <p style={small}>{t('sub.noSuppliers')}</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {visibleSuppliers.map(sp => (
              <div key={sp.id} style={{ ...card, padding: '9px 12px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', opacity: sp.archived_at ? 0.6 : 1 }}>
                <span style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 600, fontSize: '14px' }}>{sp.name}{sp.partner_org_id && <span style={{ fontSize: '11px', color: '#38BDF8', marginLeft: '6px' }}>{t('sub.onAvx')}</span>}</span>
                  <span style={{ fontSize: '12px', color: colors.muted }}>{[sp.contact_name, sp.phone, sp.email].filter(Boolean).join(' · ')}</span>
                </span>
                <button onClick={() => setSupplier(sp)} aria-label={t('common.edit')} title={t('common.edit')} style={iconBtn}><Pencil size={14} /></button>
                <button onClick={() => archive(sp)} title={sp.archived_at ? t('inv.restore') : t('inv.archive')} aria-label={sp.archived_at ? t('inv.restore') : t('inv.archive')} style={iconBtn}>
                  {sp.archived_at ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <CrossHireCode orgId={orgId} isAdmin={inv.role === 'admin'} />

      {editing && <SubrentalModal orgId={orgId} org={inv.org} subrental={editing.id ? editing : null} items={inv.items} onClose={() => setEditing(null)} onSaved={load} />}
      {supplier && <SupplierModal orgId={orgId} supplier={supplier.id ? supplier : null} onClose={() => setSupplier(null)} onSaved={load} />}
    </div>
  )
}

// On a gig's Equipment tab: what's hired in for it
export function GigSubrentals({ gig, org, items, refreshKey, onChanged }) {
  const [subs, setSubs] = useState([])
  const [editing, setEditing] = useState(null)
  const load = () => supabase.from('subrentals').select(SUBRENTAL_SELECT).eq('gig_id', gig.id).order('starts_at')
    .then(({ data }) => setSubs(data || []))
  useEffect(() => { load() }, [gig.id, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!subs.length) return null
  return (
    <section style={{ marginBottom: '14px' }}>
      <h3 style={{ ...label, marginBottom: '6px' }}>{t('sub.forGig')} · <Link to={`/org/${gig.org_id}/inventory?tab=subrentals`} style={{ color: colors.accent }}>{t('sub.all')}</Link></h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {subs.map(s => <SubrentalRow key={s.id} s={s} onOpen={setEditing} />)}
      </div>
      {editing && <SubrentalModal orgId={gig.org_id} org={org} subrental={editing} items={items} onClose={() => setEditing(null)} onSaved={() => { load(); onChanged?.() }} />}
    </section>
  )
}
