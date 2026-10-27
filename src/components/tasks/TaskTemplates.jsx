import { useState } from 'react'
import { Plus, Pencil, Trash2, ListChecks } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { itemsFromText } from '../../lib/tasks'
import { t } from '../../i18n'
import { Modal, btn, btnPrimary, iconBtn, input, label, card, colors } from '../ui'
import EmptyState from '../EmptyState'

// An organisation's checklist templates (docs/TOOLS_PLAN.md step 5, T2): a name, notes and a
// checklist to start a task from, on any gig or for the organisation. Removing only hides it.
export default function TaskTemplates({ orgId, templates, canManage, onChanged }) {
  const { notify } = useToast()
  const [editing, setEditing] = useState(null) // null | 'new' | template

  async function save(values) {
    const isNew = editing === 'new'
    const { error } = isNew
      ? await supabase.from('task_templates').insert({ ...values, org_id: orgId })
      : await supabase.from('task_templates').update(values).eq('id', editing.id)
    if (error) return notify(userMessage(error), 'error')
    if (isNew) track('tasks:template')
    setEditing(null)
    onChanged()
  }
  async function remove(tpl) {
    if (!window.confirm(t('taskTpl.removeConfirm', { name: tpl.name }))) return
    const { error } = await supabase.from('task_templates').update({ removed_at: new Date().toISOString() }).eq('id', tpl.id)
    if (error) return notify(userMessage(error), 'error')
    onChanged()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <p style={{ fontSize: '13px', color: colors.muted, flex: '1 1 240px' }}>{t('taskTpl.intro')}</p>
        {canManage && <button type="button" onClick={() => setEditing('new')} style={btnPrimary}><Plus size={14} /> {t('taskTpl.new')}</button>}
      </div>
      {templates.length === 0 ? (
        <EmptyState icon={<ListChecks size={28} />} title={t('taskTpl.emptyTitle')} body={t('taskTpl.emptyBody')}
          action={canManage ? t('taskTpl.new') : null} onAction={() => setEditing('new')} />
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {templates.map(tpl => (
            <li key={tpl.id} style={{ ...card, padding: '10px 12px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '15px', fontWeight: 600, overflowWrap: 'anywhere' }}>{tpl.name}</div>
                <div style={{ fontSize: '12px', color: colors.muted, marginTop: '2px', overflowWrap: 'anywhere' }}>
                  {t('taskTpl.items', { count: (tpl.items || []).length })}{(tpl.items || []).length ? ` · ${tpl.items.slice(0, 3).join(', ')}${tpl.items.length > 3 ? '…' : ''}` : ''}
                </div>
              </div>
              {canManage && (
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button type="button" onClick={() => setEditing(tpl)} aria-label={t('taskTpl.editNamed', { name: tpl.name })} style={iconBtn}><Pencil size={15} /></button>
                  <button type="button" onClick={() => remove(tpl)} aria-label={t('taskTpl.removeNamed', { name: tpl.name })} style={iconBtn}><Trash2 size={15} /></button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && <TemplateForm template={editing === 'new' ? null : editing} onSave={save} onClose={() => setEditing(null)} />}
    </div>
  )
}

function TemplateForm({ template, onSave, onClose }) {
  const [form, setForm] = useState(() => ({
    name: template?.name || '', notes: template?.notes || '', itemsText: (template?.items || []).join('\n'),
  }))
  const [busy, setBusy] = useState(false)
  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }))
  async function submit(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    setBusy(true)
    await onSave({ name: form.name.trim(), notes: form.notes.trim(), items: itemsFromText(form.itemsText) })
    setBusy(false)
  }
  return (
    <Modal title={template ? t('taskTpl.editTitle') : t('taskTpl.new')} onClose={onClose} maxWidth={520}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div>
          <label htmlFor="tpl-name" style={label}>{t('taskTpl.name')}</label>
          <input id="tpl-name" value={form.name} maxLength={120} required autoFocus onChange={set('name')} placeholder={t('taskTpl.namePlaceholder')} style={input} />
        </div>
        <div>
          <label htmlFor="tpl-items" style={label}>{t('tasks.checklist')}</label>
          <textarea id="tpl-items" rows={6} value={form.itemsText} onChange={set('itemsText')} aria-describedby="tpl-items-hint"
            placeholder={t('tasks.checklistPlaceholder')} style={{ ...input, resize: 'vertical' }} />
          <p id="tpl-items-hint" style={{ fontSize: '12px', color: colors.muted, marginTop: '4px' }}>{t('taskTpl.itemsHint')}</p>
        </div>
        <div>
          <label htmlFor="tpl-notes" style={label}>{t('tasks.notes')}</label>
          <textarea id="tpl-notes" rows={2} maxLength={2000} value={form.notes} onChange={set('notes')} style={{ ...input, resize: 'vertical' }} />
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{ ...btn, background: 'transparent' }}>{t('common.cancel')}</button>
          <button type="submit" disabled={busy || !form.name.trim()} style={btnPrimary}>{t('taskTpl.save')}</button>
        </div>
      </form>
    </Modal>
  )
}
