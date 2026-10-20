import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2, Loader2, Check, Boxes, Puzzle, Shuffle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { alternativesOf } from '../../lib/inventory'
import { useUndoRemove } from '../../lib/undo'
import { t } from '../../i18n'
import { Modal, btn, btnPrimary, iconBtn, input, card, colors } from '../ui'

const select = { ...input, appearance: 'auto' }
const small = { fontSize: '12px', color: colors.muted, lineHeight: 1.5 }
const ICONS = { content: Boxes, accessory: Puzzle, alternative: Shuffle }

// Kits on an item's page (docs/INVENTORY.md, I4): a set's or case's contents, an item's
// accessories, and the items that can stand in for it when it's short.
export function KitPanel({ orgId, item, kits }) {
  const sections = []
  if (item.kit_type) sections.push('content')
  if (item.tracking !== 'none' && !item.kit_type) sections.push('accessory')
  if (item.tracking !== 'none') sections.push('alternative')
  if (!kits.loaded || !sections.length) return null
  return (
    <section style={{ marginBottom: '24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
      {sections.map(kind => <PartList key={kind} orgId={orgId} item={item} kits={kits} kind={kind} />)}
    </section>
  )
}

function PartList({ orgId, item, kits, kind }) {
  const { notify } = useToast()
  const [adding, setAdding] = useState('')
  const [qty, setQty] = useState('1')
  const [saving, setSaving] = useState(false)
  const { hidden, remove: removeLater } = useUndoRemove()
  const Icon = ICONS[kind]
  const name = id => kits.items[id]?.name || '…'
  const rows = kind === 'alternative'
    ? alternativesOf(item.id, kits.pairs).map(id => ({ id, child_id: id, pair: kits.pairs.find(p => (p.item_a === id || p.item_b === id) && (p.item_a === item.id || p.item_b === item.id)) }))
    : kits.parts.filter(p => p.parent_id === item.id && p.kind === kind)
  const taken = new Set(rows.map(r => r.child_id))
  // What can go in: stock-tracked items (sets inside sets too), never the item itself
  const candidates = Object.values(kits.items)
    .filter(i => i.id !== item.id && !i.archived_at && !taken.has(i.id))
    .filter(i => i.tracking !== 'none' || (kind === 'content' && item.kit_type === 'set' && i.kit_type === 'set'))
    .filter(i => kind !== 'alternative' || !i.kit_type)
    .sort((a, b) => a.name.localeCompare(b.name))

  async function add(e) {
    e.preventDefault()
    if (!adding) return
    setSaving(true)
    const { error } = kind === 'alternative'
      ? await supabase.from('item_alternatives').insert({ org_id: orgId, item_a: item.id, item_b: adding })
      : await supabase.from('item_parts').insert({ org_id: orgId, parent_id: item.id, child_id: adding, kind, quantity: Math.min(1000, Math.max(1, Math.round(Number(qty) || 1))) })
    setSaving(false)
    if (error) {
      logger.error('kits', error, { step: 'add', kind })
      return notify(error.code === '23514' ? t('kit.notAllowed') : userMessage(error), 'error')
    }
    setAdding(''); setQty('1')
    kits.reload()
  }
  async function setQuantity(part, value) {
    const quantity = Math.min(1000, Math.max(1, Math.round(Number(value) || 1)))
    if (quantity === part.quantity) return
    const { error } = await supabase.from('item_parts').update({ quantity }).eq('id', part.id)
    if (error) return notify(userMessage(error), 'error')
    kits.reload()
  }
  function remove(row) {
    removeLater(row.id, {
      message: t('undo.removed', { name: name(row.child_id) }),
      commit: async () => (kind === 'alternative'
        ? await supabase.from('item_alternatives').delete().eq('id', row.pair.id)
        : await supabase.from('item_parts').delete().eq('id', row.id)).error,
      onDone: kits.reload,
    })
  }

  return (
    <div style={card}>
      <h2 style={{ fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}><Icon size={15} color={colors.accentText} /> {t(`kit.section.${kind}`)}</h2>
      <p style={{ ...small, marginBottom: '8px' }}>{t(`kit.sectionHint.${kind === 'content' ? item.kit_type : kind}`)}</p>
      {rows.length === 0 && <p style={{ ...small, marginBottom: '8px' }}>{t('kit.none')}</p>}
      {rows.filter(r => !hidden.has(r.id)).map(r => (
        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderTop: `1px solid ${colors.border}` }}>
          <Link to={`/org/${orgId}/inventory/${r.child_id}`} style={{ flex: 1, minWidth: 0, fontSize: '13px', color: 'var(--text)', overflowWrap: 'anywhere' }}>
            {name(r.child_id)}{kits.items[r.child_id]?.kit_type === 'set' && <span style={small}> · {t('kit.typeOpt.set')}</span>}
          </Link>
          {kind !== 'alternative' && (
            <input type="number" min={1} max={1000} defaultValue={r.quantity} key={r.quantity} onBlur={e => setQuantity(r, e.target.value)}
              aria-label={t('equip.quantityFor', { name: name(r.child_id) })} style={{ ...input, width: '64px', padding: '4px 8px' }} />
          )}
          <button onClick={() => remove(r)} aria-label={t('kit.removeNamed', { name: name(r.child_id) })} title={t('equip.remove')} style={iconBtn}><Trash2 size={13} /></button>
        </div>
      ))}
      <form onSubmit={add} style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
        <select value={adding} onChange={e => setAdding(e.target.value)} aria-label={t(`kit.add.${kind}`)} style={{ ...select, flex: '1 1 150px', padding: '6px 8px', fontSize: '13px' }}>
          <option value="">{t(`kit.add.${kind}`)}</option>
          {candidates.map(i => <option key={i.id} value={i.id}>{i.name}{i.category ? ` · ${i.category}` : ''}</option>)}
        </select>
        {kind !== 'alternative' && (
          <input type="number" min={1} max={1000} value={qty} onChange={e => setQty(e.target.value)} aria-label={t('inv.quantity')} style={{ ...input, width: '64px', padding: '6px 8px' }} />
        )}
        <button type="submit" disabled={!adding || saving} style={{ ...btn, padding: '6px 10px' }}>
          {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={13} />} {t('common.add')}
        </button>
      </form>
    </div>
  )
}

// Which units are packed in one case unit: units of the case's contents, ticked when in
// this case. Ticking a unit packed in another case moves it here.
export function CaseContentsModal({ caseUnit, kits, onClose, onSaved }) {
  const { notify } = useToast()
  const [units, setUnits] = useState(null)
  const [packed, setPacked] = useState(new Set())
  const [saving, setSaving] = useState(false)
  const contentIds = kits.parts.filter(p => p.parent_id === caseUnit.item_id && p.kind === 'content' && kits.items[p.child_id]?.tracking === 'serial').map(p => p.child_id)

  useEffect(() => {
    if (!contentIds.length) return setUnits([])
    supabase.from('stock_units').select('id, item_id, code, serial, status, case_unit_id, in_case:case_unit_id(code)')
      .in('item_id', contentIds).neq('status', 'retired').order('code')
      .then(({ data, error }) => {
        if (error) logger.error('kits', error, { step: 'caseUnits' })
        setUnits(data || [])
        setPacked(new Set((data || []).filter(u => u.case_unit_id === caseUnit.id).map(u => u.id)))
      })
  }, [caseUnit.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setSaving(true)
    const was = new Set(units.filter(u => u.case_unit_id === caseUnit.id).map(u => u.id))
    const add = [...packed].filter(id => !was.has(id))
    const drop = [...was].filter(id => !packed.has(id))
    const [a, d] = await Promise.all([
      add.length ? supabase.from('stock_units').update({ case_unit_id: caseUnit.id }).in('id', add) : { error: null },
      drop.length ? supabase.from('stock_units').update({ case_unit_id: null }).in('id', drop) : { error: null },
    ])
    setSaving(false)
    const error = a.error || d.error
    if (error) {
      logger.error('kits', error, { step: 'pack' })
      return notify(userMessage(error), 'error')
    }
    onSaved()
    onClose()
  }

  const byItem = (units || []).reduce((m, u) => { (m[u.item_id] ||= []).push(u); return m }, {})
  return (
    <Modal title={t('kit.caseContents', { code: caseUnit.code })} onClose={onClose}>
      <p style={{ ...small, marginBottom: '12px' }}>{t('kit.caseContentsHint')}</p>
      {!units ? <Loader2 size={18} color={colors.accentText} style={{ animation: 'spin 1s linear infinite' }} /> : units.length === 0 ? (
        <p style={{ ...small, marginBottom: '12px' }}>{contentIds.length ? t('kit.noUnitsToPack') : t('kit.noSerialContents')}</p>
      ) : Object.entries(byItem).map(([itemId, list]) => {
        const want = kits.parts.find(p => p.parent_id === caseUnit.item_id && p.child_id === itemId && p.kind === 'content')?.quantity
        const have = list.filter(u => packed.has(u.id)).length
        return (
          <div key={itemId} style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>
              {kits.items[itemId]?.name} <span style={{ color: have === want ? colors.accentText : 'var(--warn)', fontWeight: 600 }}>{t('kit.packedOf', { count: have, want })}</span>
            </div>
            {list.map(u => (
              <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', fontSize: '13px', cursor: 'pointer' }}>
                <input type="checkbox" checked={packed.has(u.id)} style={{ accentColor: colors.accent }}
                  onChange={() => setPacked(s => { const n = new Set(s); if (n.has(u.id)) n.delete(u.id); else n.add(u.id); return n })} />
                <span style={{ fontFamily: 'var(--font-mono)' }}>{u.code}</span>
                <span style={small}>{[u.serial, u.status !== 'available' && t(`inv.unitStatus.${u.status}`), u.case_unit_id && u.case_unit_id !== caseUnit.id && t('kit.inCase', { code: u.in_case?.code || '…' })].filter(Boolean).join(' · ')}</span>
              </label>
            ))}
          </div>
        )
      })}
      <button onClick={save} disabled={!units || saving} style={{ ...btnPrimary, width: '100%', justifyContent: 'center' }}>
        {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={15} />} {t('common.save')}
      </button>
    </Modal>
  )
}
