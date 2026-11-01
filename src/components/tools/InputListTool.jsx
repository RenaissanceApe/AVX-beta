import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, Printer, PackagePlus, Loader2, RotateCcw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { selectAll } from '../../lib/selectAll'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { useUndoRemove } from '../../lib/undo'
import { saveSnapshot, loadSnapshot, isNetworkError } from '../../lib/offline'
import { nextChannel, channelGaps, inputsToEquipment, inputCounts } from '../../lib/tools'
import { t } from '../../i18n'
import { Modal, btn, btnPrimary, iconBtn, input, label, card, colors, tint } from '../ui'
import EmptyState from '../EmptyState'
import { HintLabel } from '../help/HelpParts'

const EMPTY = { channel: '', source: '', mic: '', item_id: '', stand: '', phantom: false, stage_box: '', notes: '' }
const FIELDS = 'id, channel, source, mic, item_id, stand, phantom, stage_box, notes, checked, plot_ref'

// The input list (docs/FIELD_TOOLS.md, F1): one line per mixer channel, what's plugged in and
// how. Editors add, change, reorder and tick lines checked on site; everyone on the gig reads it,
// also offline. Mics and DIs picked from the catalogue can be added to the gig's equipment.
export default function InputListTool({ gig, canEdit, canPlanEquipment }) {
  const { notify } = useToast()
  const [inputs, setInputs] = useState(null)
  const [savedAt, setSavedAt] = useState(null)
  const [items, setItems] = useState([])
  const [editing, setEditing] = useState(null) // null | 'new' | input
  const [busy, setBusy] = useState(false)
  const { hidden, remove: removeLater } = useUndoRemove()

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('gig_inputs').select(FIELDS).eq('gig_id', gig.id).order('channel')
    if (error && isNetworkError(error)) {
      const snap = loadSnapshot(`inputs.${gig.id}`)
      setInputs(snap?.data || [])
      setSavedAt(snap?.savedAt || null)
      return
    }
    if (error) logger.error('inputs', error, { step: 'load' })
    setInputs(data || [])
    setSavedAt(null)
    if (data) saveSnapshot(`inputs.${gig.id}`, data)
  }, [gig.id])
  useEffect(() => { load() }, [load])

  // The catalogue's stock-tracked items, to link a mic or DI to (editors only)
  useEffect(() => {
    if (!canEdit || !gig.org_id) return
    selectAll(() => supabase.from('price_items').select('id, name, category').eq('org_id', gig.org_id).neq('tracking', 'none').is('archived_at', null).order('name').order('id'))
      .then(({ data, error }) => { if (error) logger.error('inputs', error, { step: 'items' }); setItems(data || []) })
  }, [canEdit, gig.org_id])

  const shown = useMemo(() => (inputs || []).filter(i => !hidden.has(i.id)), [inputs, hidden])
  const counts = inputCounts(shown)
  const gaps = channelGaps(shown)
  const itemName = id => items.find(i => i.id === id)?.name

  async function move(input, by) {
    const list = [...shown]
    const at = list.findIndex(i => i.id === input.id)
    const to = at + by
    if (to < 0 || to >= list.length) return
    ;[list[at], list[to]] = [list[to], list[at]]
    setInputs(list.map((i, n) => ({ ...i, channel: n + 1 })))
    const { error } = await supabase.rpc('order_inputs', { p_gig: gig.id, p_ids: list.map(i => i.id) })
    if (error) { notify(userMessage(error), 'error'); load() }
  }

  async function toggleChecked(row) {
    setInputs(list => list.map(i => (i.id === row.id ? { ...i, checked: !row.checked } : i)))
    const { error } = await supabase.from('gig_inputs').update({ checked: !row.checked }).eq('id', row.id)
    if (error) { notify(userMessage(error), 'error'); load() }
  }

  async function clearChecks() {
    const { error } = await supabase.from('gig_inputs').update({ checked: false }).eq('gig_id', gig.id).eq('checked', true)
    if (error) return notify(userMessage(error), 'error')
    track('inputs:clearChecks')
    load()
  }

  function remove(row) {
    removeLater(row.id, {
      message: t('undo.removed', { name: row.source }),
      commit: async () => (await supabase.from('gig_inputs').delete().eq('id', row.id)).error,
      onDone: load,
    })
  }

  // Mics and DIs linked to the catalogue → lines on the gig's Equipment tab
  async function addToEquipment() {
    setBusy(true)
    const { data: lines, error } = await supabase.from('gig_equipment').select('id, item_id, quantity').eq('gig_id', gig.id)
    if (error) { setBusy(false); return notify(userMessage(error), 'error') }
    const todo = inputsToEquipment(shown, lines).filter(x => x.add > 0)
    for (const x of todo) {
      const line = lines.find(l => l.item_id === x.item_id)
      const res = line
        ? await supabase.from('gig_equipment').update({ quantity: x.needed }).eq('id', line.id)
        : await supabase.from('gig_equipment').insert({ gig_id: gig.id, item_id: x.item_id, quantity: x.needed })
      if (res.error) { setBusy(false); logger.error('inputs', res.error, { step: 'equipment' }); return notify(userMessage(res.error), 'error') }
    }
    setBusy(false)
    track('inputs:toEquipment')
    notify(todo.length ? t('inputs.addedToEquipment', { count: todo.reduce((s, x) => s + x.add, 0) }) : t('inputs.equipmentUpToDate'), 'success')
  }

  if (inputs === null) return <Loader2 size={20} color={colors.accentText} style={{ animation: 'spin 1s linear infinite' }} />
  const linked = shown.some(i => i.item_id)

  return (
    <section aria-labelledby="input-list-title">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <div style={{ flex: '1 1 200px' }}>
          <h2 id="input-list-title" style={{ fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>{t('tools.name.input_list')}</h2>
          <p style={{ color: colors.muted, fontSize: '13px' }}>
            {t('inputs.count', { count: counts.total })}
            {counts.phantom > 0 && ` · ${t('inputs.phantomCount', { count: counts.phantom })}`}
            {counts.checked > 0 && ` · ${t('inputs.checkedCount', { count: counts.checked, total: counts.total })}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {canEdit && <button type="button" onClick={() => setEditing('new')} style={btnPrimary}><Plus size={14} /> {t('inputs.add')}</button>}
          {shown.length > 0 && <Link to={`/gig/${gig.id}/inputs`} style={{ ...btn, textDecoration: 'none' }}><Printer size={14} /> {t('inputs.print')}</Link>}
        </div>
      </div>
      {savedAt && <p role="status" style={{ fontSize: '12px', color: 'var(--warn)', marginBottom: '10px' }}>{t('inputs.offline')}</p>}

      {shown.length === 0 ? (
        <EmptyState compact title={t('inputs.emptyTitle')} body={canEdit ? t('inputs.emptyEditor') : t('inputs.emptyReader')}
          action={canEdit ? t('inputs.add') : null} onAction={() => setEditing('new')} guide="pm-input-list" />
      ) : (
        <ol style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {shown.map((row, n) => (
            <li key={row.id} style={{ ...card, padding: '10px 12px', display: 'flex', flexWrap: 'wrap', gap: '6px 12px', alignItems: 'flex-start', borderColor: row.checked ? tint(colors.accent, 45) : undefined }}>
              <span aria-hidden="true" style={{ fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: 800, minWidth: '2.2em', textAlign: 'right', color: colors.accentText, lineHeight: 1.2 }}>{row.channel}</span>
              <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                <strong style={{ display: 'block', fontSize: '15px' }}><span className="sr-only">{t('inputs.channelN', { n: row.channel })}: </span>{row.source}</strong>
                <span style={{ fontSize: '13px', color: colors.soft, display: 'flex', gap: '4px 10px', flexWrap: 'wrap' }}>
                  {row.mic && <span>{row.mic}</span>}
                  {row.stand && <span>{t('inputs.standShort', { stand: row.stand })}</span>}
                  {row.stage_box && <span>{t('inputs.boxShort', { box: row.stage_box })}</span>}
                  {row.phantom && <span style={{ fontWeight: 800, color: 'var(--warn)' }}>48V</span>}
                </span>
                {row.notes && <span style={{ display: 'block', fontSize: '12px', color: colors.muted, marginTop: '2px' }}>{row.notes}</span>}
              </div>
              {canEdit ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexWrap: 'wrap', justifyContent: 'flex-end', marginLeft: 'auto' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: colors.soft, cursor: 'pointer', marginRight: '4px' }}>
                    <input type="checkbox" checked={row.checked} onChange={() => toggleChecked(row)} style={{ accentColor: 'var(--accent)' }} />
                    <span>{t('inputs.checked')}<span className="sr-only"> {row.source}</span></span>
                  </label>
                  <button type="button" onClick={() => move(row, -1)} disabled={n === 0} aria-label={t('inputs.moveUp', { name: row.source })} style={iconBtn}><ChevronUp size={15} /></button>
                  <button type="button" onClick={() => move(row, 1)} disabled={n === shown.length - 1} aria-label={t('inputs.moveDown', { name: row.source })} style={iconBtn}><ChevronDown size={15} /></button>
                  <button type="button" onClick={() => setEditing(row)} aria-label={t('inputs.edit', { name: row.source })} style={iconBtn}><Pencil size={14} /></button>
                  <button type="button" onClick={() => remove(row)} aria-label={t('inputs.remove', { name: row.source })} style={iconBtn}><Trash2 size={14} /></button>
                </div>
              ) : row.checked ? <span style={{ fontSize: '12px', color: colors.accentText }}>{t('inputs.checked')}</span> : null}
            </li>
          ))}
        </ol>
      )}

      {gaps.length > 0 && <p style={{ fontSize: '12px', color: colors.muted, marginTop: '8px' }}>{t('inputs.gaps', { channels: gaps.slice(0, 12).join(', ') })}</p>}

      {canEdit && shown.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '14px' }}>
          {canPlanEquipment && linked && (
            <button type="button" onClick={addToEquipment} disabled={busy} style={btn}>
              {busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <PackagePlus size={14} />} {t('inputs.toEquipment')}
            </button>
          )}
          {counts.checked > 0 && <button type="button" onClick={clearChecks} style={btn}><RotateCcw size={14} /> {t('inputs.clearChecks')}</button>}
        </div>
      )}

      {editing && (
        <InputForm gig={gig} row={editing === 'new' ? null : editing} items={items} itemName={itemName}
          firstFree={nextChannel(inputs)} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />
      )}
    </section>
  )
}

function InputForm({ gig, row, items, firstFree, onClose, onSaved }) {
  const { notify } = useToast()
  const [form, setForm] = useState(() => (row
    ? { ...EMPTY, ...Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v ?? EMPTY[k] ?? ''])), channel: String(row.channel) }
    : { ...EMPTY, channel: String(firstFree) }))
  const [saving, setSaving] = useState(false)
  const set = patch => setForm(f => ({ ...f, ...patch }))
  const clean = v => (String(v || '').trim() || null)

  async function save(e) {
    e.preventDefault()
    const channel = Math.round(Number(form.channel))
    if (!form.source.trim() || !(channel >= 1 && channel <= 512)) return
    setSaving(true)
    const values = {
      channel, source: form.source.trim(), mic: clean(form.mic), item_id: form.item_id || null, stand: clean(form.stand),
      phantom: !!form.phantom, stage_box: clean(form.stage_box), notes: clean(form.notes),
    }
    const { error } = row
      ? await supabase.from('gig_inputs').update(values).eq('id', row.id)
      : await supabase.from('gig_inputs').insert({ ...values, gig_id: gig.id })
    setSaving(false)
    if (error) {
      logger.error('inputs', error, { step: row ? 'update' : 'insert' })
      return notify(error.code === '23505' ? t('inputs.channelTaken', { n: channel }) : userMessage(error), 'error')
    }
    track(row ? 'inputs:edit' : 'inputs:add')
    onSaved()
  }

  // Picking a catalogue item fills in the mic name when it's still empty
  function pickItem(id) {
    const name = items.find(i => i.id === id)?.name
    set({ item_id: id, ...(name && !form.mic.trim() ? { mic: name } : {}) })
  }

  return (
    <Modal title={row ? t('inputs.editTitle', { n: row.channel }) : t('inputs.add')} onClose={onClose}>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '90px minmax(0, 1fr)', gap: '10px' }}>
          <div>
            <label style={label} htmlFor="input-channel">{t('inputs.channel')}</label>
            <input id="input-channel" type="number" min={1} max={512} required value={form.channel} onChange={e => set({ channel: e.target.value })} style={input} />
          </div>
          <div>
            <label style={label} htmlFor="input-source">{t('inputs.source')}</label>
            <input id="input-source" required maxLength={120} value={form.source} onChange={e => set({ source: e.target.value })} placeholder={t('inputs.sourcePlaceholder')} style={input} autoFocus />
          </div>
        </div>
        <div>
          <label style={label} htmlFor="input-mic">{t('inputs.mic')}</label>
          <input id="input-mic" maxLength={120} value={form.mic} onChange={e => set({ mic: e.target.value })} placeholder={t('inputs.micPlaceholder')} style={input} />
        </div>
        {items.length > 0 && (
          <div>
            <HintLabel htmlFor="input-item" hint="input-item">{t('inputs.item')}</HintLabel>
            <select id="input-item" value={form.item_id || ''} onChange={e => pickItem(e.target.value)} style={{ ...input, appearance: 'auto' }}>
              <option value="">{t('inputs.noItem')}</option>
              {items.map(i => <option key={i.id} value={i.id}>{i.name}{i.category ? ` · ${i.category}` : ''}</option>)}
            </select>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '10px' }}>
          <div>
            <label style={label} htmlFor="input-stand">{t('inputs.stand')}</label>
            <input id="input-stand" maxLength={60} value={form.stand} onChange={e => set({ stand: e.target.value })} placeholder={t('inputs.standPlaceholder')} style={input} />
          </div>
          <div>
            <HintLabel htmlFor="input-box" hint="stage-box">{t('inputs.box')}</HintLabel>
            <input id="input-box" maxLength={40} value={form.stage_box} onChange={e => set({ stage_box: e.target.value })} placeholder="SB1-03" style={input} />
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer' }}>
          <input type="checkbox" checked={form.phantom} onChange={e => set({ phantom: e.target.checked })} style={{ accentColor: 'var(--accent)' }} /> {t('inputs.phantom')}
        </label>
        <div>
          <label style={label} htmlFor="input-notes">{t('inputs.notes')}</label>
          <input id="input-notes" maxLength={300} value={form.notes} onChange={e => set({ notes: e.target.value })} style={input} />
        </div>
        <button type="submit" disabled={saving || !form.source.trim()} style={{ ...btnPrimary, justifyContent: 'center' }}>
          {saving && <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />} {t('common.save')}
        </button>
      </form>
    </Modal>
  )
}
