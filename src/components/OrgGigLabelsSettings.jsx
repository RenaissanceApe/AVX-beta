import { useState } from 'react'
import { Tags, Plus, Trash2, ArrowUp, ArrowDown, Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { track } from '../lib/usage'
import { BASE_STATUSES, LABEL_COLOURS, SUGGESTED_STATUSES, labelStyle, useGigLabels } from '../lib/gigLabels'
import { useI18n } from '../i18n'
import { btn, iconBtn, input, label, colors } from './ui'

const select = { ...input, appearance: 'auto', width: 'auto', minWidth: 0 }

// Organisation settings → Gig statuses and types (docs/TOOLS_PLAN.md step 6, S1): the
// organisation's own words for where a gig is ("Option", "Invoiced"), each standing for one of the
// built-in statuses, and its kinds of gig ("Festival", "Corporate"), with colours.
export default function OrgGigLabelsSettings({ org }) {
  const { t } = useI18n()
  const labels = useGigLabels(org.id)
  if (!labels.loaded) return null
  return (
    <section aria-labelledby="org-labels" style={{ marginTop: '20px', paddingTop: '16px', borderTop: `1px solid ${colors.border}` }}>
      <h3 id="org-labels" style={{ ...label, display: 'flex', alignItems: 'center', gap: '6px' }}><Tags size={13} /> {t('labels.title')}</h3>
      <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5, marginBottom: '10px' }}>{t('labels.intro')}</p>
      <LabelList org={org} kind="statuses" items={labels.statuses} reload={labels.reload} />
      <LabelList org={org} kind="types" items={labels.types} reload={labels.reload} />
    </section>
  )
}

function LabelList({ org, kind, items, reload }) {
  const { t } = useI18n()
  const { notify } = useToast()
  const table = kind === 'statuses' ? 'gig_statuses' : 'gig_types'
  const [draft, setDraft] = useState({ name: '', colour: 'blue', base_status: 'confirmed' })
  const [busy, setBusy] = useState(false)

  async function run(promise, step) {
    setBusy(true)
    const { error } = await promise
    setBusy(false)
    if (error) { logger.error('labels', error, { step }); notify(userMessage(error), 'error'); return false }
    reload()
    return true
  }
  async function add(e) {
    e.preventDefault()
    if (!draft.name.trim()) return
    const row = { org_id: org.id, name: draft.name.trim(), colour: draft.colour, position: (items.at(-1)?.position ?? 0) + 1 }
    if (kind === 'statuses') row.base_status = draft.base_status
    if (await run(supabase.from(table).insert(row), 'add')) { track(`labels:${kind}`); setDraft(d => ({ ...d, name: '' })) }
  }
  async function suggest() {
    const rows = SUGGESTED_STATUSES.map((s, i) => ({ org_id: org.id, name: t(`labels.suggest.${s.key}`), colour: s.colour, base_status: s.base, position: i + 1 }))
    if (await run(supabase.from('gig_statuses').insert(rows), 'suggest')) track('labels:suggested')
  }
  const update = (item, values) => run(supabase.from(table).update(values).eq('id', item.id), 'update')
  function remove(item) {
    if (!window.confirm(t(`labels.${kind}.removeConfirm`, { name: item.name }))) return
    update(item, { removed_at: new Date().toISOString() })
  }
  async function move(i, dir) {
    const other = items[i + dir]
    if (!other) return
    // Renumber the whole list, so equal positions can't leave the order stuck
    const order = items.map(x => x.id)
    ;[order[i], order[i + dir]] = [order[i + dir], order[i]]
    setBusy(true)
    const results = await Promise.all(order.map((id, n) => supabase.from(table).update({ position: n + 1 }).eq('id', id)))
    setBusy(false)
    const error = results.find(r => r.error)?.error
    if (error) notify(userMessage(error), 'error')
    reload()
  }

  return (
    <div style={{ marginTop: '12px' }}>
      <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>{t(`labels.${kind}.title`)}</h4>
      <p style={{ fontSize: '12px', color: colors.muted, lineHeight: 1.5, marginBottom: '8px' }}>{t(`labels.${kind}.hint`)}</p>
      {items.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
          {items.map((item, i) => (
            <li key={item.id} style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span aria-hidden="true" style={{ ...labelStyle(item.colour), width: '14px', height: '14px', borderRadius: '50%', flexShrink: 0, border: '2px solid currentColor' }} />
              <input defaultValue={item.name} maxLength={40} aria-label={t('labels.name')} disabled={busy}
                onBlur={e => { const v = e.target.value.trim(); if (v && v !== item.name) update(item, { name: v }); else e.target.value = item.name }}
                style={{ ...input, flex: '1 1 140px', minWidth: 0, padding: '6px 10px' }} />
              <select value={item.colour} aria-label={t('labels.colour')} disabled={busy} onChange={e => update(item, { colour: e.target.value })} style={{ ...select, padding: '6px 8px' }}>
                {LABEL_COLOURS.map(c => <option key={c} value={c}>{t(`labels.colours.${c}`)}</option>)}
              </select>
              {kind === 'statuses' && (
                <select value={item.base_status} aria-label={t('labels.base')} disabled={busy} onChange={e => update(item, { base_status: e.target.value })} style={{ ...select, padding: '6px 8px' }}>
                  {BASE_STATUSES.map(b => <option key={b} value={b}>{t('labels.means', { status: t(`status.${b}`) })}</option>)}
                </select>
              )}
              <button type="button" onClick={() => move(i, -1)} disabled={busy || i === 0} aria-label={t('labels.moveUp', { name: item.name })} style={iconBtn}><ArrowUp size={14} /></button>
              <button type="button" onClick={() => move(i, 1)} disabled={busy || i === items.length - 1} aria-label={t('labels.moveDown', { name: item.name })} style={iconBtn}><ArrowDown size={14} /></button>
              <button type="button" onClick={() => remove(item)} disabled={busy} aria-label={t('labels.remove', { name: item.name })} style={iconBtn}><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
      )}
      {kind === 'statuses' && items.length === 0 && (
        <button type="button" onClick={suggest} disabled={busy} style={{ ...btn, marginBottom: '8px' }}><Sparkles size={14} /> {t('labels.suggest.button')}</button>
      )}
      {items.length < 30 && (
        <form onSubmit={add} style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={draft.name} maxLength={40} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
            aria-label={t(`labels.${kind}.newName`)} placeholder={t(`labels.${kind}.placeholder`)} style={{ ...input, flex: '1 1 140px', minWidth: 0, padding: '6px 10px' }} />
          <select value={draft.colour} aria-label={t('labels.colour')} onChange={e => setDraft(d => ({ ...d, colour: e.target.value }))} style={{ ...select, padding: '6px 8px' }}>
            {LABEL_COLOURS.map(c => <option key={c} value={c}>{t(`labels.colours.${c}`)}</option>)}
          </select>
          {kind === 'statuses' && (
            <select value={draft.base_status} aria-label={t('labels.base')} onChange={e => setDraft(d => ({ ...d, base_status: e.target.value }))} style={{ ...select, padding: '6px 8px' }}>
              {BASE_STATUSES.map(b => <option key={b} value={b}>{t('labels.means', { status: t(`status.${b}`) })}</option>)}
            </select>
          )}
          <button type="submit" disabled={busy || !draft.name.trim()} style={btn}><Plus size={14} /> {t('labels.add')}</button>
        </form>
      )}
    </div>
  )
}
