import { useState } from 'react'
import { SlidersHorizontal, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { track } from '../lib/usage'
import { FIELD_ENTITIES, FIELD_KINDS, useCustomFields, choicesFromText } from '../lib/customFields'
import { useI18n } from '../i18n'
import { btn, iconBtn, input, label, colors, tint } from './ui'

const select = { ...input, appearance: 'auto', width: 'auto', minWidth: 0 }

// Organisation settings → Custom fields (docs/TOOLS_PLAN.md step 6, S2): the organisation's own
// fields on gigs, clients, suppliers and catalogue items.
export default function OrgCustomFieldsSettings({ org }) {
  const { t } = useI18n()
  const { notify } = useToast()
  const [entity, setEntity] = useState('gig')
  const { fields, loaded, reload } = useCustomFields(org.id, entity)
  const [draft, setDraft] = useState({ label: '', kind: 'text', choicesText: '' })
  const [busy, setBusy] = useState(false)

  async function run(promise, step) {
    setBusy(true)
    const { error } = await promise
    setBusy(false)
    if (error) { logger.error('customFields', error, { step }); notify(userMessage(error), 'error'); return false }
    reload()
    return true
  }
  async function add(e) {
    e.preventDefault()
    const choices = draft.kind === 'choice' ? choicesFromText(draft.choicesText) : []
    if (!draft.label.trim() || (draft.kind === 'choice' && !choices.length)) return
    const ok = await run(supabase.from('custom_fields').insert({
      org_id: org.id, entity, label: draft.label.trim(), kind: draft.kind, choices, position: (fields.at(-1)?.position ?? 0) + 1,
    }), 'add')
    if (ok) { track(`customFields:${entity}`); setDraft({ label: '', kind: 'text', choicesText: '' }) }
  }
  const update = (f, values) => run(supabase.from('custom_fields').update(values).eq('id', f.id), 'update')
  function remove(f) {
    if (window.confirm(t('custom.removeConfirm', { name: f.label }))) update(f, { removed_at: new Date().toISOString() })
  }
  async function move(i, dir) {
    if (!fields[i + dir]) return
    const order = fields.map(x => x.id)
    ;[order[i], order[i + dir]] = [order[i + dir], order[i]]
    setBusy(true)
    const results = await Promise.all(order.map((id, n) => supabase.from('custom_fields').update({ position: n + 1 }).eq('id', id)))
    setBusy(false)
    const error = results.find(r => r.error)?.error
    if (error) notify(userMessage(error), 'error')
    reload()
  }

  const tab = on => ({ ...btn, padding: '6px 12px', background: on ? tint(colors.accent, 22) : 'transparent', color: on ? colors.accentText : colors.soft })
  return (
    <section aria-labelledby="org-fields" style={{ marginTop: '20px', paddingTop: '16px', borderTop: `1px solid ${colors.border}` }}>
      <h3 id="org-fields" style={{ ...label, display: 'flex', alignItems: 'center', gap: '6px' }}><SlidersHorizontal size={13} /> {t('custom.title')}</h3>
      <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5, marginBottom: '10px' }}>{t('custom.intro')}</p>
      <div role="group" aria-label={t('custom.on')} style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
        {FIELD_ENTITIES.map(e => <button key={e} type="button" aria-pressed={entity === e} onClick={() => setEntity(e)} style={tab(entity === e)}>{t(`custom.entity.${e}`)}</button>)}
      </div>
      {loaded && fields.length === 0 && <p style={{ fontSize: '13px', color: colors.muted, marginBottom: '8px' }}>{t(`custom.empty.${entity}`)}</p>}
      {fields.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
          {fields.map((f, i) => (
            <li key={f.id} style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input defaultValue={f.label} maxLength={60} aria-label={t('custom.label')} disabled={busy}
                onBlur={e => { const v = e.target.value.trim(); if (v && v !== f.label) update(f, { label: v }); else e.target.value = f.label }}
                style={{ ...input, flex: '1 1 140px', minWidth: 0, padding: '6px 10px' }} />
              <span style={{ display: 'inline-flex', gap: '2px' }}>
                <button type="button" onClick={() => move(i, -1)} disabled={busy || i === 0} aria-label={t('labels.moveUp', { name: f.label })} style={iconBtn}><ArrowUp size={14} /></button>
                <button type="button" onClick={() => move(i, 1)} disabled={busy || i === fields.length - 1} aria-label={t('labels.moveDown', { name: f.label })} style={iconBtn}><ArrowDown size={14} /></button>
                <button type="button" onClick={() => remove(f)} disabled={busy} aria-label={t('labels.remove', { name: f.label })} style={iconBtn}><Trash2 size={14} /></button>
              </span>
              <span style={{ fontSize: '12px', color: colors.muted, width: '100%', marginTop: '-4px' }}>{t(`custom.kind.${f.kind}`)}</span>
              {f.kind === 'choice' && (
                <textarea defaultValue={(f.choices || []).join('\n')} rows={2} aria-label={t('custom.choicesOf', { name: f.label })} disabled={busy}
                  onBlur={e => { const c = choicesFromText(e.target.value); if (c.length && c.join('\n') !== (f.choices || []).join('\n')) update(f, { choices: c }) }}
                  style={{ ...input, width: '100%', resize: 'vertical', padding: '6px 10px', fontSize: '13px' }} />
              )}
            </li>
          ))}
        </ul>
      )}
      {fields.length < 40 && (
        <form onSubmit={add} style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={draft.label} maxLength={60} onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
            aria-label={t('custom.newLabel')} placeholder={t('custom.placeholder')} style={{ ...input, flex: '1 1 140px', minWidth: 0, padding: '6px 10px' }} />
          <select value={draft.kind} aria-label={t('custom.kindLabel')} onChange={e => setDraft(d => ({ ...d, kind: e.target.value }))} style={{ ...select, padding: '6px 8px' }}>
            {FIELD_KINDS.map(k => <option key={k} value={k}>{t(`custom.kind.${k}`)}</option>)}
          </select>
          <button type="submit" disabled={busy || !draft.label.trim() || (draft.kind === 'choice' && !choicesFromText(draft.choicesText).length)} style={btn}><Plus size={14} /> {t('labels.add')}</button>
          {draft.kind === 'choice' && (
            <textarea value={draft.choicesText} rows={3} onChange={e => setDraft(d => ({ ...d, choicesText: e.target.value }))}
              aria-label={t('custom.choices')} placeholder={t('custom.choicesHint')} style={{ ...input, width: '100%', resize: 'vertical', padding: '6px 10px', fontSize: '13px' }} />
          )}
        </form>
      )}
      <p style={{ fontSize: '12px', color: colors.muted, lineHeight: 1.5, marginTop: '8px' }}>{t('custom.kindHint')}</p>
    </section>
  )
}
