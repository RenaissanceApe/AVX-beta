import { useId, useMemo, useState } from 'react'
import { AlertTriangle, Info, Check } from 'lucide-react'
import { FIELDS, WORD_VALUES, cleanValue, closest } from '../../lib/importer'
import { presetLabel } from '../../lib/speakers'
import { PRESETS } from '../../data/speakers'
import { t } from '../../i18n'
import { Modal, btn, btnPrimary, input, label, colors, space } from '../ui'

// One group of rows with the same problem (or heads-up) and the fixes it offers
// (docs/SWITCHING.md, "Import overhaul: fix it here"). The fixes are radio buttons in a labelled
// group, each with its own controls; Apply hands the chosen fix to the check as fix records
// (importer.js, "Fixing it in the check"). Fixes that need the database part (IM3) show as not
// available yet, with the reason. Nothing is saved here: additions wait for Import.
const SHOWN_LINES = 25
const fieldOf = (kind, key, fields) => (fields || FIELDS[kind] || []).find(f => f.key === key) || { key, type: 'text' }
const fieldName = (kind, key) => t(`imp.field.${kind}.${key}`)
// Which cells say "this item" (or kit) in a row: its code and its name
const ITEM_CELLS = { item: ['item_code', 'item'], item_code: ['item_code', 'item'], kit: ['kit_code', 'kit'], kit_code: ['kit_code', 'kit'], name: ['code', 'name'], code: ['code', 'name'] }
export const choiceLabel = (words, value) => t(`imp.word.${words}.${value}`)
// Why a group's rows can't go in, as the page says it: the check's reason, or what the database
// said when it refused them (brought back by "fix and try again")
export function reasonText(group) {
  const { reason, value } = group
  if (group.note) return t(`imp.note.${reason}`)
  if (reason === 'refused') return String(value ?? '')
  const key = `imp.err.${reason}`
  const text = t(key, { value: value ?? '' })
  return group.refused || text === key ? t(`imp.srv.${reason}`, { name: value ?? '' }) : text
}

export default function FixGroup({ group, kind, ctx, onApply }) {
  const id = useId()
  const { reason, field, lines } = group
  const count = lines.length
  const options = group.fixes
  const [pick, setPick] = useState(options.find(o => !o.im3 && !ctx.blocked?.(o.id, group))?.id || null)
  const [values, setValues] = useState({})
  const [edits, setEdits] = useState({})
  const [adding, setAdding] = useState(false)
  const set = (k, v) => setValues(s => ({ ...s, [k]: v }))
  // The field, read with its column's date order when it is a date
  const def = { ...fieldOf(kind, field, ctx.fields), order: ctx.dateOrders?.[field] }
  const label_ = key => (ctx.fieldLabel ? ctx.fieldLabel(key) : fieldName(kind, key))
  const value = group.value
  const from = group.from

  // The choices each picker offers, the closest name first
  const locations = useMemo(() => closest(value || '', ctx.locations.map(l => l.name)), [ctx.locations, value])
  const items = useMemo(() => {
    const list = ctx.items.filter(i => (reason === 'bulkItem' ? i.tracking === 'serial' : reason === 'notTracked' || reason === 'partUntracked' ? i.tracking !== 'none' : true))
    const order = closest(value || '', list.map(i => i.name))
    return list.slice().sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name))
  }, [ctx.items, reason, value])
  const sameItems = useMemo(() => ctx.items.filter(i => i.name.toLowerCase() === String(value || '').toLowerCase()), [ctx.items, value])
  const gigs = useMemo(() => {
    const order = closest(value || '', ctx.gigs.map(g => g.name))
    return ctx.gigs.slice().sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name))
  }, [ctx.gigs, value])
  const sameGigs = ctx.gigs.filter(g => g.name.toLowerCase() === String(value || '').toLowerCase())
  const contacts = useMemo(() => closest(value || '', ctx.clients.map(c => c.name)), [ctx.clients, value])
  const sameContacts = ctx.contacts.filter(c => c.name.toLowerCase() === String(value || '').toLowerCase())
  // Raw values that come back in several rows ("n/a" as a price): each can be treated as empty at once
  const repeated = useMemo(() => {
    const n = new Map()
    for (const l of lines) if (l.raw.trim()) n.set(l.raw.trim().toLowerCase(), { raw: l.raw.trim(), count: (n.get(l.raw.trim().toLowerCase())?.count || 0) + 1 })
    return [...n.values()].filter(v => v.count > 1).slice(0, 3)
  }, [lines])
  const linesOf = list => list.map(l => l.line)
  const allLines = linesOf(lines)

  // An item picked for this group: its code and name in the row's cells. One without a code can
  // only be picked by name when no other item has that name (IM3 picks by id)
  const itemCells = item => {
    const [codeField, nameField] = ITEM_CELLS[field] || ['item_code', 'item']
    if (kind === 'items') return { code: item.code || '' }
    return { [codeField]: item.code || '', [nameField]: item.name }
  }
  const itemPickable = item => Boolean(item.code) || ctx.items.filter(i => i.name.toLowerCase() === item.name.toLowerCase()).length === 1
  const gigCells = gig => (kind === 'gigs' ? { ref: gig.import_ref || '' } : { gig_ref: gig.import_ref || '', gig: gig.name })
  const gigPickable = gig => Boolean(gig.import_ref) || ctx.gigs.filter(g => g.name.toLowerCase() === gig.name.toLowerCase()).length === 1
  const base = { key: group.key, reason, field, value: value ?? null, count }
  const replace = (fix, setCells, to) => ({ ...base, fix, to, type: 'replace', field, from, set: setCells })
  const cells = (fix, make, to) => ({ ...base, fix, to, type: 'cells', edits: Object.fromEntries(lines.map(l => [l.line, make(l)])) })

  // The fix records the chosen option makes, or null while it still needs a choice
  function records() {
    switch (pick) {
      case 'skip': return [{ ...base, fix: 'skip', type: 'skip', lines: allLines }]
      case 'edit': {
        const changed = Object.entries(edits).filter(([, text]) => text !== undefined)
        if (!changed.length) return null
        return [{ ...base, fix: 'edit', type: 'cells', count: changed.length, edits: Object.fromEntries(changed.map(([line, text]) => [line, { [field]: text }])) }]
      }
      case 'treatEmpty': {
        const v = values.empty ?? repeated[0]?.raw
        return v ? [{ ...replace('treatEmpty', { [field]: '' }, null), from: v.toLowerCase(), value: v, count: repeated.find(r => r.raw === v)?.count || 0 }] : null
      }
      case 'stripSpaces': return [cells('stripSpaces', l => ({ [field]: l.raw.replace(/\s+/g, '') }))]
      case 'cut': return [cells('cut', l => ({ [field]: l.raw.slice(0, def.max || 200) }), String(def.max || 200))]
      case 'swapDates': return [cells('swapDates', l => ({ start_date: ctx.raw(l.line, 'end_date'), end_date: ctx.raw(l.line, 'start_date') }))]
      case 'treatAs': return values.word ? [replace('treatAs', { [field]: values.word }, def.choices?.length ? values.word : choiceLabel(def.words, values.word))] : null
      case 'leaveEmpty': return [replace('leaveEmpty', { [field]: '' })]
      case 'pickPreset': {
        const p = PRESETS.find(x => x.id === values.preset)
        return p ? [replace('pickPreset', { speaker_preset: p.id }, presetLabel(p))] : null
      }
      case 'putIn': return values.location ? [cells('putIn', () => ({ location: values.location }), values.location)] : null
      case 'fillVolts': {
        const v = cleanValue(values.volts ?? '230', fieldOf('items', 'current_v'))
        return v.value ? [cells('fillVolts', () => ({ current_v: String(v.value) }), String(v.value))] : null
      }
      case 'addLocation': return [{ ...base, fix: 'addLocation', type: 'add', what: 'location', record: { name: value, kind: values.locationKind || 'warehouse' }, to: value }]
      case 'restoreLocation': {
        const loc = ctx.archivedLocations.find(l => l.name.toLowerCase() === String(value).toLowerCase())
        return loc ? [{ ...base, fix: 'restoreLocation', type: 'restore', id: loc.id, name: loc.name, to: loc.name }] : null
      }
      case 'useLocation': return values.location ? [replace('useLocation', { location: values.location }, values.location)] : null
      case 'useItem':
      case 'chooseItem': {
        const item = ctx.items.find(i => String(i.id) === values.item)
        return item ? [replace(pick, itemCells(item), item.code ? `${item.name} (${item.code})` : item.name)] : null
      }
      case 'startTracking': {
        const item = ctx.items.find(i => i.name.toLowerCase() === String(value).toLowerCase() && i.tracking === 'none')
        return item ? [{ ...base, fix: 'startTracking', type: 'track', id: item.id, name: item.name, to: item.name }] : null
      }
      case 'useGig':
      case 'chooseGig': {
        const gig = ctx.gigs.find(g => String(g.id) === values.gig)
        return gig ? [replace(pick, gigCells(gig), gig.name)] : null
      }
      case 'chooseContact': {
        const c = sameContacts.find(x => String(x.id) === values.contact)
        return c ? [replace('chooseContact', { tax_id: c.tax_id }, c.tax_id)] : null
      }
      case 'addContact': return [{ ...base, fix: 'addContact', type: 'add', what: 'client', record: { name: value }, to: value }]
      case 'linkContact': return values.client ? [replace('linkContact', { client: values.client }, values.client)] : null
      case 'countBulk': return [cells('countBulk', () => ({ tracking: 'bulk' }))]
      case 'dropQuantity': return [cells('dropQuantity', () => ({ quantity: '' }))]
      case 'keepTracking': return [cells('keepTracking', () => ({ tracking: '' }))]
      default: return null
    }
  }

  function apply() {
    if (pick === 'addItem' || pick === 'addKit') return setAdding(true)
    const made = records()
    if (made) onApply(made)
  }

  const ready = pick === 'addItem' || pick === 'addKit' || (pick && records())
  const titleId = `${id}-title`
  const Icon = group.note ? Info : AlertTriangle

  // The controls under the chosen option
  function controls(o) {
    const pickId = `${id}-${o}`
    const select = (key, list, placeholder) => (
      <select id={pickId} aria-label={t(`imp.fix.${o}`, { value: value ?? '' })} value={values[key] || ''} onChange={e => set(key, e.target.value)} style={{ ...input, appearance: 'auto', maxWidth: '360px' }}>
        <option value="">{placeholder || t('imp.fix.choose')}</option>
        {list}
      </select>
    )
    switch (o) {
      case 'useLocation':
      case 'putIn':
        return locations.length ? select('location', locations.map(n => <option key={n} value={n}>{n}</option>)) : <p style={muted}>{t('imp.fix.noLocations')}</p>
      case 'addLocation':
        return select('locationKind', WORD_VALUES.locationKind.map(k => <option key={k} value={k}>{choiceLabel('locationKind', k)}</option>), choiceLabel('locationKind', 'warehouse'))
      case 'useItem':
        return items.length
          ? select('item', items.map(i => <option key={i.id} value={i.id} disabled={!itemPickable(i)}>{itemLabel(i)}{itemPickable(i) ? '' : ` · ${t('imp.fix.im3Short')}`}</option>))
          : <p style={muted}>{t('imp.fix.noItems')}</p>
      case 'chooseItem':
        return select('item', sameItems.map(i => <option key={i.id} value={i.id} disabled={!i.code}>{itemLabel(i)}{i.code ? '' : ` · ${t('imp.fix.im3Short')}`}</option>))
      case 'useGig':
        return gigs.length
          ? select('gig', gigs.map(g => <option key={g.id} value={g.id} disabled={!gigPickable(g)}>{g.name}{g.start_date ? ` · ${g.start_date}` : ''}{gigPickable(g) ? '' : ` · ${t('imp.fix.im3Short')}`}</option>))
          : <p style={muted}>{t('imp.fix.noGigs')}</p>
      case 'chooseGig':
        return select('gig', sameGigs.map(g => <option key={g.id} value={g.id} disabled={!g.import_ref}>{g.name}{g.start_date ? ` · ${g.start_date}` : ''}{g.import_ref ? ` · ${g.import_ref}` : ` · ${t('imp.fix.im3Short')}`}</option>))
      case 'chooseContact':
        return select('contact', sameContacts.map(c => <option key={c.id} value={c.id} disabled={!c.tax_id}>{[c.name, c.email, c.tax_id].filter(Boolean).join(' · ')}{c.tax_id ? '' : ` · ${t('imp.fix.im3Short')}`}</option>))
      case 'linkContact':
        return contacts.length ? select('client', contacts.map(n => <option key={n} value={n}>{n}</option>)) : <p style={muted}>{t('imp.fix.noContacts')}</p>
      case 'treatAs':
        return select('word', def.choices?.length
          ? def.choices.map(w => <option key={w} value={w}>{w}</option>)
          : (WORD_VALUES[def.words] || []).map(w => <option key={w} value={w}>{choiceLabel(def.words, w)}</option>))
      case 'pickPreset':
        return select('preset', closest(value || '', PRESETS.map(presetLabel)).map(name => PRESETS.find(p => presetLabel(p) === name)).map(p => <option key={p.id} value={p.id}>{presetLabel(p)}</option>))
      case 'treatEmpty':
        return repeated.length > 1 ? select('empty', repeated.map(r => <option key={r.raw} value={r.raw}>{t('imp.fix.emptyValue', { value: r.raw, count: r.count })}</option>), t('imp.fix.emptyValue', { value: repeated[0].raw, count: repeated[0].count })) : null
      case 'fillVolts':
        return <input id={pickId} inputMode="numeric" aria-label={fieldName('items', 'current_v')} value={values.volts ?? '230'} onChange={e => set('volts', e.target.value)} style={{ ...input, maxWidth: '120px' }} />
      case 'edit':
        return (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: space[2] }}>
            {lines.slice(0, SHOWN_LINES).map(l => {
              const text = edits[l.line] ?? l.raw
              const check = cleanValue(text, def)
              const errId = `${id}-e${l.line}`
              return (
                <li key={l.line} style={{ display: 'flex', flexWrap: 'wrap', gap: space[2], alignItems: 'center' }}>
                  <label htmlFor={`${id}-c${l.line}`} style={{ fontSize: '13px', color: colors.soft, minWidth: '64px', fontFamily: 'var(--font-mono)' }}>{t('imp.line', { n: l.line })}</label>
                  <input id={`${id}-c${l.line}`} value={text} onChange={e => setEdits(s => ({ ...s, [l.line]: e.target.value }))} aria-describedby={check.error ? errId : undefined}
                    aria-invalid={check.error ? 'true' : undefined} style={{ ...input, flex: '1 1 160px', minWidth: 0, maxWidth: '320px' }} />
                  {check.error
                    ? <span id={errId} style={{ fontSize: '13px', color: 'var(--warn)', display: 'flex', gap: space[1], alignItems: 'center' }}><AlertTriangle size={12} aria-hidden="true" /> {t(`imp.err.${check.error}`, { value: text })}</span>
                    : edits[l.line] !== undefined && <span style={{ fontSize: '13px', color: colors.accentText, display: 'flex', gap: space[1], alignItems: 'center' }}><Check size={12} aria-hidden="true" /> {t('imp.fix.looksRight')}</span>}
                </li>
              )
            })}
            {count > SHOWN_LINES && <li style={muted}>{t('imp.andMore', { count: count - SHOWN_LINES })}</li>}
          </ul>
        )
      default: return null
    }
  }
  const itemLabel = i => [i.name, i.code, i.brand, i.category].filter(Boolean).join(' · ') + (i.pending ? ` · ${t('imp.willBeAdded')}` : '')
  // An option that can't be used here, and why (the database part, IM3, or nothing to pick)
  const unavailable = o => (o.im3 ? t('imp.fix.im3') : ctx.blocked?.(o.id, group) || null)
  const visible = options.filter(o => o.id !== 'stripSpaces' || lines.some(l => /\s/.test(l.raw))).filter(o => o.id !== 'treatEmpty' || repeated.length)

  return (
    <section aria-labelledby={titleId} style={{ borderTop: `1px solid ${colors.border}`, padding: `${space[4]} 0` }}>
      <h3 id={titleId} style={{ display: 'flex', gap: space[2], alignItems: 'baseline', fontSize: '14px', fontWeight: 700, margin: 0, overflowWrap: 'anywhere' }}>
        <Icon size={14} aria-hidden="true" style={{ flexShrink: 0, color: group.note ? colors.soft : 'var(--warn)', alignSelf: 'center' }} />
        <span>
          {t('imp.group.rows', { count })}
          {field && ` · ${label_(field)}`}
          {value != null && value !== '' && ` “${value}”`}
        </span>
      </h3>
      <p style={{ fontSize: '13px', color: colors.soft, margin: `${space[1]} 0 ${space[2]}`, lineHeight: 1.6 }}>
        {reasonText(group)}
        {reason === 'bulkItem' && ` ${t('imp.fix.bulkLimit')}`}
      </p>
      <p style={{ ...muted, marginBottom: space[3] }}>{t('imp.group.lines', { count, lines: allLines.slice(0, 12).join(', ') + (count > 12 ? '…' : '') })}</p>
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: space[2] }}>
        <legend style={{ ...label, marginBottom: space[2] }}>{t(group.note ? 'imp.group.whatToDo' : 'imp.group.fix')}</legend>
        {visible.map(o => {
          const off = unavailable(o)
          return (
            <div key={o.id} style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
              <label style={{ display: 'flex', gap: space[2], alignItems: 'flex-start', fontSize: '14px', cursor: off ? 'default' : 'pointer', color: off ? colors.muted : 'var(--text)' }}>
                <input type="radio" name={`${id}-fix`} value={o.id} checked={pick === o.id} disabled={!!off} onChange={() => setPick(o.id)} style={{ marginTop: '3px', accentColor: 'var(--accent)' }} />
                <span>
                  {o.id === 'treatEmpty'
                    ? (repeated.length > 1 ? t('imp.fix.treatEmptyPick') : t('imp.fix.treatEmpty', { value: repeated[0].raw, count: repeated[0].count }))
                    : o.id === 'treatAs' ? t('imp.fix.treatAs', { value: lines[0]?.raw ?? '' })
                    : t(`imp.fix.${o.id}`, { value: value ?? '', count, max: def.max || 200 })}
                  {off && <span style={{ display: 'block', fontSize: '13px', color: colors.muted }}>{off}</span>}
                </span>
              </label>
              {pick === o.id && !off && <div style={{ paddingLeft: '26px' }}>{controls(o.id)}</div>}
            </div>
          )
        })}
      </fieldset>
      <button type="button" onClick={apply} disabled={!ready} style={{ ...btn, marginTop: space[3] }}>{t(pick === 'addItem' || pick === 'addKit' ? 'imp.fix.addDetails' : 'imp.fix.apply')}</button>
      {adding && <AddItem kind={kind} reason={reason} field={field} value={value} kit={pick === 'addKit'}
        onClose={() => setAdding(false)}
        onAdd={(record, kitType) => { setAdding(false); onApply([{ ...base, fix: pick, type: 'add', what: 'item', record, to: record.name, edits: kitType ? Object.fromEntries(allLines.map(n => [n, { kit_type: kitType }])) : undefined }]) }} />}
    </section>
  )
}

const muted = { fontSize: '13px', color: colors.muted, margin: 0 }

// The small form for an item (or a set or case) a fix adds to the catalogue when Import is pressed:
// its name, code and how it's kept (units are always kept per unit)
function AddItem({ kind, field, value, kit, onClose, onAdd }) {
  const byCode = /code$/.test(field || '')
  const [name, setName] = useState(byCode ? '' : value || '')
  const [code, setCode] = useState(byCode ? value || '' : '')
  const [tracking, setTracking] = useState(kind === 'units' ? 'serial' : 'bulk')
  const [kitType, setKitType] = useState('case')
  const codeCheck = code.trim() ? cleanValue(code, { type: 'code' }) : { value: null }
  const ok = name.trim() && !codeCheck.error
  function submit(e) {
    e.preventDefault()
    if (!ok) return
    // A set isn't kept in stock (its contents are); a case is counted like any item
    const record = { name: name.trim().slice(0, 200), code: code.trim() || null, tracking: kit ? (kitType === 'set' ? 'none' : 'bulk') : tracking }
    onAdd(record, kit ? kitType : null)
  }
  return (
    <Modal title={t(kit ? 'imp.add.kitTitle' : 'imp.add.itemTitle')} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <p style={{ fontSize: '13px', color: colors.soft, margin: 0, lineHeight: 1.6 }}>{t('imp.add.when')}</p>
        <div>
          <label style={label} htmlFor="imp-add-name">{t('imp.add.name')}</label>
          <input id="imp-add-name" value={name} onChange={e => setName(e.target.value)} maxLength={200} required style={input} />
        </div>
        <div>
          <label style={label} htmlFor="imp-add-code">{t('imp.add.code')}</label>
          <input id="imp-add-code" value={code} onChange={e => setCode(e.target.value)} aria-describedby="imp-add-code-hint" aria-invalid={codeCheck.error ? 'true' : undefined} style={input} />
          <p id="imp-add-code-hint" style={{ fontSize: '13px', color: codeCheck.error ? 'var(--warn)' : colors.muted, marginTop: space[1] }}>{codeCheck.error ? t('imp.err.code') : t('imp.add.codeHint')}</p>
        </div>
        {kit ? (
          <div>
            <label style={label} htmlFor="imp-add-kit">{t('imp.add.kitType')}</label>
            <select id="imp-add-kit" value={kitType} onChange={e => setKitType(e.target.value)} style={{ ...input, appearance: 'auto' }}>
              {['case', 'set'].map(k => <option key={k} value={k}>{t(`imp.add.kitType.${k}`)}</option>)}
            </select>
          </div>
        ) : (
          <div>
            <label style={label} htmlFor="imp-add-tracking">{t('imp.add.tracking')}</label>
            <select id="imp-add-tracking" value={tracking} onChange={e => setTracking(e.target.value)} disabled={kind === 'units'} style={{ ...input, appearance: 'auto' }}>
              {(kind === 'units' ? ['serial'] : ['bulk', 'serial']).map(k => <option key={k} value={k}>{choiceLabel('tracking', k)}</option>)}
            </select>
          </div>
        )}
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
          <button type="button" onClick={onClose} style={btn}>{t('imp.add.cancel')}</button>
          <button type="submit" disabled={!ok} style={btnPrimary}>{t('imp.add.confirm')}</button>
        </div>
      </form>
    </Modal>
  )
}
