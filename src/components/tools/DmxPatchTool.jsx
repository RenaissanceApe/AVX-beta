import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Printer, Pencil, Trash2, AlertTriangle, Loader2, PackagePlus, ListRestart } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { useUndoRemove } from '../../lib/undo'
import { saveSnapshot, loadSnapshot, isNetworkError } from '../../lib/offline'
import { inputsToEquipment } from '../../lib/tools'
import { overlaps, packAddresses, bulkFixtures, universeUse, dmxRange, UNIVERSE_SIZE } from '../../lib/dmx'
import { t } from '../../i18n'
import { Modal, btn, btnPrimary, iconBtn, input, label, card, colors, tint } from '../ui'
import EmptyState from '../EmptyState'
import { HintLabel } from '../help/HelpParts'

const FIELDS = 'id, name, fixture_type, mode, footprint, universe, address, position, item_id, notes, sort'
const order = (a, b) => a.universe - b.universe || (a.address ?? 9999) - (b.address ?? 9999) || a.sort - b.sort || a.name.localeCompare(b.name)

// The DMX patch (docs/FIELD_TOOLS.md, F2): every lighting fixture with its universe, start
// address and footprint. Editors add fixtures in bulk on free addresses, edit and remove them,
// and repack a universe; overlapping channels are flagged. Everyone on the gig reads it.
export default function DmxPatchTool({ gig, canEdit, canPlanEquipment }) {
  const { notify } = useToast()
  const [fixtures, setFixtures] = useState(null)
  const [savedAt, setSavedAt] = useState(null)
  const [catalogue, setCatalogue] = useState([])
  const [editing, setEditing] = useState(null) // null | 'new' | fixture
  const [busy, setBusy] = useState(false)
  const { hidden, remove: removeLater } = useUndoRemove()

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('gig_fixtures').select(FIELDS).eq('gig_id', gig.id)
    if (error && isNetworkError(error)) {
      const snap = loadSnapshot(`dmx.${gig.id}`)
      setFixtures(snap?.data || [])
      setSavedAt(snap?.savedAt || null)
      return
    }
    if (error) logger.error('dmx', error, { step: 'load' })
    setFixtures(data || [])
    setSavedAt(null)
    if (data) saveSnapshot(`dmx.${gig.id}`, data)
  }, [gig.id])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!canEdit || !gig.org_id) return
    supabase.from('price_items').select('id, name, category').eq('org_id', gig.org_id).neq('tracking', 'none').is('archived_at', null).order('name')
      .then(({ data }) => setCatalogue(data || []))
  }, [canEdit, gig.org_id])

  const shown = useMemo(() => (fixtures || []).filter(f => !hidden.has(f.id)).sort(order), [fixtures, hidden])
  const bad = useMemo(() => overlaps(shown), [shown])
  const universes = universeUse(shown)

  function remove(f) {
    removeLater(f.id, {
      message: t('undo.removed', { name: f.name }),
      commit: async () => (await supabase.from('gig_fixtures').delete().eq('id', f.id)).error,
      onDone: load,
    })
  }

  // Readdress a universe's fixtures one after another from 1, in their current order
  async function repack(universe) {
    const list = shown.filter(f => f.universe === universe)
    if (!window.confirm(t('dmx.repackConfirm', { universe, count: list.length }))) return
    setBusy(true)
    for (const u of packAddresses(list, { universe })) {
      const { error } = await supabase.from('gig_fixtures').update({ universe: u.universe, address: u.address }).eq('id', u.id)
      if (error) { setBusy(false); notify(userMessage(error), 'error'); return load() }
    }
    setBusy(false)
    track('dmx:repack')
    load()
  }

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
      if (res.error) { setBusy(false); return notify(userMessage(res.error), 'error') }
    }
    setBusy(false)
    track('dmx:toEquipment')
    notify(todo.length ? t('inputs.addedToEquipment', { count: todo.reduce((s, x) => s + x.add, 0) }) : t('dmx.equipmentUpToDate'), 'success')
  }

  if (fixtures === null) return <Loader2 size={20} color={colors.accentText} style={{ animation: 'spin 1s linear infinite' }} />

  return (
    <section aria-labelledby="dmx-title">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <div style={{ flex: '1 1 200px' }}>
          <h2 id="dmx-title" style={{ fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>{t('tools.name.dmx_patch')}</h2>
          <p style={{ color: colors.muted, fontSize: '13px' }}>{t('dmx.count', { count: shown.length })}{universes.length > 0 && ` · ${t('dmx.universes', { count: universes.length })}`}</p>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {canEdit && <button type="button" onClick={() => setEditing('new')} style={btnPrimary}><Plus size={14} /> {t('dmx.add')}</button>}
          {shown.length > 0 && <Link to={`/gig/${gig.id}/dmx`} style={{ ...btn, textDecoration: 'none' }}><Printer size={14} /> {t('inputs.print')}</Link>}
        </div>
      </div>
      {savedAt && <p role="status" style={{ fontSize: '12px', color: 'var(--warn)', marginBottom: '10px' }}>{t('dmx.offline')}</p>}
      {bad.size > 0 && (
        <p role="status" style={{ ...card, borderColor: tint('var(--warn)', 45), color: 'var(--warn)', fontSize: '13px', display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
          <AlertTriangle size={15} aria-hidden="true" /> {t('dmx.overlapBanner', { count: bad.size })}
        </p>
      )}

      {shown.length === 0 ? (
        <EmptyState compact title={t('dmx.emptyTitle')} body={canEdit ? t('dmx.emptyEditor') : t('dmx.emptyReader')}
          action={canEdit ? t('dmx.add') : null} onAction={() => setEditing('new')} guide="pm-dmx" />
      ) : universes.map(u => {
        const list = shown.filter(f => f.universe === u.universe)
        return (
          <section key={u.universe} aria-labelledby={`universe-${u.universe}`} style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
              <h3 id={`universe-${u.universe}`} style={{ fontSize: '15px', fontWeight: 800 }}>{t('dmx.universe', { n: u.universe })}</h3>
              <span style={{ fontSize: '12px', color: u.channels > UNIVERSE_SIZE ? 'var(--warn)' : colors.muted }}>{t('dmx.used', { used: u.channels, total: UNIVERSE_SIZE })}</span>
              {canEdit && <button type="button" onClick={() => repack(u.universe)} disabled={busy} style={{ ...btn, padding: '4px 10px', fontSize: '12px', marginLeft: 'auto' }}><ListRestart size={13} /> {t('dmx.repack')}</button>}
            </div>
            <div aria-hidden="true" style={{ height: '6px', borderRadius: '3px', background: 'color-mix(in srgb, var(--fg) min(100%, calc(8% * var(--line-k))), transparent)', overflow: 'hidden', marginBottom: '8px' }}>
              <div style={{ height: '100%', width: `${Math.min(100, (100 * u.channels) / UNIVERSE_SIZE)}%`, background: colors.accent }} />
            </div>
            <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {list.map(f => {
                const clash = bad.has(f.id)
                return (
                  <li key={f.id} style={{ ...card, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', borderColor: clash ? 'var(--warn)' : undefined }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, minWidth: '5.5em', color: f.address ? colors.accentText : colors.muted }}>{dmxRange(f, t('dmx.noAddress'))}</span>
                    <span style={{ flex: '1 1 160px', minWidth: 0 }}>
                      <strong style={{ display: 'block', fontSize: '14px' }}>{f.name}</strong>
                      <span style={{ fontSize: '12px', color: colors.soft }}>
                        {[f.fixture_type, f.mode, t('dmx.channelsShort', { count: f.footprint }), f.position].filter(Boolean).join(' · ')}
                      </span>
                      {clash && <span style={{ display: 'block', fontSize: '12px', color: 'var(--warn)' }}>{t('dmx.overlap')}</span>}
                    </span>
                    {canEdit && (
                      <span style={{ display: 'flex', gap: '2px', marginLeft: 'auto' }}>
                        <button type="button" onClick={() => setEditing(f)} aria-label={t('inputs.edit', { name: f.name })} style={iconBtn}><Pencil size={14} /></button>
                        <button type="button" onClick={() => remove(f)} aria-label={t('inputs.remove', { name: f.name })} style={iconBtn}><Trash2 size={14} /></button>
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}

      {canEdit && canPlanEquipment && shown.some(f => f.item_id) && (
        <button type="button" onClick={addToEquipment} disabled={busy} style={btn}><PackagePlus size={14} /> {t('plot.toEquipment')}</button>
      )}

      {editing && (
        <FixtureForm gig={gig} fixture={editing === 'new' ? null : editing} existing={shown} catalogue={catalogue}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />
      )}
    </section>
  )
}

// Also used by the light plot to add fixtures to a bar (defaults: { position })
export function FixtureForm({ gig, fixture, existing, catalogue, defaults, onClose, onSaved }) {
  const { notify } = useToast()
  const isNew = !fixture
  const [form, setForm] = useState(() => (fixture
    ? { name: fixture.name, fixture_type: fixture.fixture_type, mode: fixture.mode || '', footprint: String(fixture.footprint), universe: String(fixture.universe),
        address: fixture.address ? String(fixture.address) : '', position: fixture.position || '', item_id: fixture.item_id || '', notes: fixture.notes || '', count: '1' }
    : { name: '', fixture_type: '', mode: '', footprint: '', universe: '1', address: '', position: defaults?.position || '', item_id: '', notes: '', count: '1' }))
  const [saving, setSaving] = useState(false)
  const set = patch => setForm(f => ({ ...f, ...patch }))
  const num = (v, min, max) => { const n = Math.round(Number(v)); return n >= min && n <= max ? n : null }

  function pickItem(id) {
    const name = catalogue.find(i => i.id === id)?.name
    set({ item_id: id, ...(name && !form.fixture_type.trim() ? { fixture_type: name } : {}), ...(name && !form.name.trim() ? { name } : {}) })
  }

  async function save(e) {
    e.preventDefault()
    const footprint = num(form.footprint, 1, 512), universe = num(form.universe, 1, 256)
    const address = form.address === '' ? null : num(form.address, 1, 512)
    if (!form.name.trim() || !form.fixture_type.trim() || !footprint || !universe || (form.address !== '' && !address)) return
    if (address && address + footprint - 1 > 512) return notify(t('dmx.pastEnd'), 'error')
    setSaving(true)
    const base = { fixture_type: form.fixture_type.trim(), mode: form.mode.trim() || null, footprint, universe, position: form.position.trim() || null, item_id: form.item_id || null }
    let error
    if (isNew) {
      const count = num(form.count, 1, 100) || 1
      // One fixture with a typed address keeps it; several are placed on free addresses
      const rows = count === 1 && address
        ? [{ ...base, name: form.name.trim(), address, notes: form.notes.trim() || null }]
        : bulkFixtures(existing, { ...base, name: form.name.trim(), count })
      ;({ error } = await supabase.from('gig_fixtures').insert(rows.map(r => ({ ...r, gig_id: gig.id }))))
      if (!error) track('dmx:add')
    } else {
      ;({ error } = await supabase.from('gig_fixtures').update({ ...base, name: form.name.trim(), address, notes: form.notes.trim() || null }).eq('id', fixture.id))
    }
    setSaving(false)
    if (error) { logger.error('dmx', error, { step: isNew ? 'insert' : 'update' }); return notify(userMessage(error), 'error') }
    onSaved()
  }

  return (
    <Modal title={isNew ? t('dmx.add') : fixture.name} onClose={onClose}>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {catalogue.length > 0 && (
          <div>
            <label style={label} htmlFor="fx-item">{t('inputs.item')}</label>
            <select id="fx-item" value={form.item_id} onChange={e => pickItem(e.target.value)} style={{ ...input, appearance: 'auto' }}>
              <option value="">{t('inputs.noItem')}</option>
              {catalogue.map(i => <option key={i.id} value={i.id}>{i.name}{i.category ? ` · ${i.category}` : ''}</option>)}
            </select>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '10px' }}>
          <div>
            <label style={label} htmlFor="fx-type">{t('dmx.type')}</label>
            <input id="fx-type" required maxLength={80} value={form.fixture_type} onChange={e => set({ fixture_type: e.target.value })} placeholder="MAC Aura XB" style={input} />
          </div>
          <div>
            <label style={label} htmlFor="fx-mode">{t('dmx.mode')}</label>
            <input id="fx-mode" maxLength={40} value={form.mode} onChange={e => set({ mode: e.target.value })} placeholder={t('dmx.modePlaceholder')} style={input} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isNew ? 'repeat(3, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))', gap: '10px' }}>
          <div>
            <HintLabel htmlFor="fx-footprint" hint="dmx-footprint">{t('dmx.footprint')}</HintLabel>
            <input id="fx-footprint" type="number" required min={1} max={512} value={form.footprint} onChange={e => set({ footprint: e.target.value })} style={input} />
          </div>
          <div>
            <HintLabel htmlFor="fx-universe" hint="dmx-universe">{t('dmx.universeField')}</HintLabel>
            <input id="fx-universe" type="number" required min={1} max={256} value={form.universe} onChange={e => set({ universe: e.target.value })} style={input} />
          </div>
          {isNew ? (
            <div>
              <label style={label} htmlFor="fx-count">{t('dmx.howMany')}</label>
              <input id="fx-count" type="number" min={1} max={100} value={form.count} onChange={e => set({ count: e.target.value })} style={input} />
            </div>
          ) : (
            <div>
              <label style={label} htmlFor="fx-address">{t('dmx.address')}</label>
              <input id="fx-address" type="number" min={1} max={512} value={form.address} onChange={e => set({ address: e.target.value })} style={input} />
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '10px' }}>
          <div>
            <label style={label} htmlFor="fx-name">{isNew && Number(form.count) > 1 ? t('dmx.namePrefix') : t('dmx.name')}</label>
            <input id="fx-name" required maxLength={56} value={form.name} onChange={e => set({ name: e.target.value })} placeholder={t('dmx.namePlaceholder')} style={input} />
          </div>
          <div>
            <label style={label} htmlFor="fx-position">{t('dmx.position')}</label>
            <input id="fx-position" maxLength={60} value={form.position} onChange={e => set({ position: e.target.value })} placeholder={t('dmx.positionPlaceholder')} style={input} />
          </div>
        </div>
        {isNew && Number(form.count) === 1 && (
          <div>
            <label style={label} htmlFor="fx-address-new">{t('dmx.addressOptional')}</label>
            <input id="fx-address-new" type="number" min={1} max={512} value={form.address} onChange={e => set({ address: e.target.value })} style={input} />
          </div>
        )}
        {isNew && <p style={{ fontSize: '12px', color: colors.muted, lineHeight: 1.5 }}>{t('dmx.addHint')}</p>}
        <button type="submit" disabled={saving} style={{ ...btnPrimary, justifyContent: 'center' }}>
          {saving && <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />} {isNew ? t('dmx.addButton', { count: Number(form.count) || 1 }) : t('common.save')}
        </button>
      </form>
    </Modal>
  )
}
