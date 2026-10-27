import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Trash2, CalendarClock, ListChecks, Flag } from 'lucide-react'
import { dueState, checklistProgress, checklistFromText, toggleItem } from '../../lib/tasks'
import { t, fmt } from '../../i18n'
import { Modal, btn, btnPrimary, iconBtn, input, label, card, colors, tint } from '../ui'

const DUE_COLOUR = { overdue: 'var(--danger)', today: 'var(--warn)', soon: 'var(--accent-text)' }

// One task in a list: tick it, tick its checklist, open it to edit (docs/TOOLS_PLAN.md step 5)
export function TaskRow({ task, today, nameOf, canTick, canManage, onToggle, onChecklist, onEdit, onRemove, gigLink }) {
  const [open, setOpen] = useState(false)
  const done = task.status === 'done'
  const state = dueState(task, today)
  const progress = checklistProgress(task.checklist)
  return (
    <li style={{ ...card, padding: '10px 12px', display: 'flex', gap: '10px', alignItems: 'flex-start', background: done ? 'transparent' : card.background }}>
      <input type="checkbox" checked={done} disabled={!canTick} onChange={onToggle}
        aria-label={t(done ? 'tasks.reopen' : 'tasks.markDone', { title: task.title })} style={{ width: '20px', height: '20px', marginTop: '2px', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
          style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'var(--text)', textAlign: 'left', cursor: 'pointer', fontSize: '15px', fontWeight: 600, textDecoration: done ? 'line-through' : 'none', overflowWrap: 'anywhere' }}>
          {task.title}
        </button>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: '12px', color: colors.muted, marginTop: '2px' }}>
          {task.assignee_id && <span>{nameOf(task.assignee_id)}</span>}
          {task.due_on && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: DUE_COLOUR[state] || colors.muted, fontWeight: state ? 700 : 400 }}>
              <CalendarClock size={12} aria-hidden="true" /> {state ? t(`tasks.due.${state}`, { date: fmt(task.due_on, 'd MMM') }) : fmt(task.due_on, 'd MMM')}
            </span>
          )}
          {progress && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}><ListChecks size={12} aria-hidden="true" /> {progress.done}/{progress.total}</span>}
          {task.source_kind === 'rehearsal_note' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}><Flag size={12} aria-hidden="true" /> {t('tasks.fromNote')}</span>}
          {gigLink}
          {done && task.done_by && <span>{t('tasks.doneBy', { name: nameOf(task.done_by) })}</span>}
        </div>
        {open && (
          <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {task.notes && <p style={{ fontSize: '14px', lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{task.notes}</p>}
            {(task.checklist || []).length > 0 && (
              <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {task.checklist.map(i => (
                  <li key={i.id}>
                    <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '14px', cursor: canTick ? 'pointer' : 'default' }}>
                      <input type="checkbox" checked={!!i.done} disabled={!canTick} onChange={() => onChecklist(toggleItem(task.checklist, i.id))} />
                      <span style={{ textDecoration: i.done ? 'line-through' : 'none', color: i.done ? colors.muted : 'var(--text)' }}>{i.text}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {canManage && (
              <div style={{ display: 'flex', gap: '6px' }}>
                <button type="button" onClick={onEdit} style={{ ...btn, padding: '6px 10px' }}><Pencil size={13} /> {t('tasks.edit')}</button>
                <button type="button" onClick={onRemove} aria-label={t('tasks.removeNamed', { title: task.title })} style={iconBtn}><Trash2 size={15} /></button>
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  )
}

// New or edit: title, who, by when, notes, checklist (one item per line)
export function TaskForm({ task, people, nameOf, templates = [], onSave, onClose }) {
  const [form, setForm] = useState(() => ({
    title: task?.title || '', assignee_id: task?.assignee_id || '', due_on: task?.due_on || '', notes: task?.notes || '',
    checklistText: (task?.checklist || []).map(i => i.text).join('\n'),
  }))
  const [busy, setBusy] = useState(false)
  const set = patch => setForm(f => ({ ...f, ...patch }))
  // A template fills what's still empty and adds its checklist below any lines already typed
  function applyTemplate(id) {
    const tpl = templates.find(x => x.id === id)
    if (!tpl) return
    setForm(f => ({
      ...f, title: f.title.trim() ? f.title : tpl.name, notes: f.notes.trim() ? f.notes : tpl.notes || '',
      checklistText: [f.checklistText.trim(), ...(tpl.items || [])].filter(Boolean).join('\n'),
    }))
  }
  async function submit(e) {
    e.preventDefault()
    if (!form.title.trim()) return
    setBusy(true)
    await onSave({
      title: form.title.trim(), assignee_id: form.assignee_id || null, due_on: form.due_on || null, notes: form.notes.trim(),
      checklist: checklistFromText(form.checklistText, task?.checklist),
    })
    setBusy(false)
  }
  return (
    <Modal title={task ? t('tasks.editTitle') : t('tasks.new')} onClose={onClose} maxWidth={520}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {!task && templates.length > 0 && (
          <div>
            <label htmlFor="task-template" style={label}>{t('tasks.fromTemplate')}</label>
            <select id="task-template" value="" onChange={e => applyTemplate(e.target.value)} style={input}>
              <option value="">{t('tasks.pickTemplate')}</option>
              {templates.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="task-title" style={label}>{t('tasks.title')}</label>
          <input id="task-title" value={form.title} maxLength={200} required autoFocus onChange={e => set({ title: e.target.value })} style={input} />
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 180px' }}>
            <label htmlFor="task-who" style={label}>{t('tasks.who')}</label>
            <select id="task-who" value={form.assignee_id} onChange={e => set({ assignee_id: e.target.value })} style={input}>
              <option value="">{t('tasks.nobody')}</option>
              {people.map(p => <option key={p.user_id} value={p.user_id}>{nameOf(p.user_id)}{p.function_title ? ` · ${p.function_title}` : ''}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <label htmlFor="task-due" style={label}>{t('tasks.dueOn')}</label>
            <input id="task-due" type="date" value={form.due_on} onChange={e => set({ due_on: e.target.value })} style={input} />
          </div>
        </div>
        <div>
          <label htmlFor="task-notes" style={label}>{t('tasks.notes')}</label>
          <textarea id="task-notes" rows={3} maxLength={2000} value={form.notes} onChange={e => set({ notes: e.target.value })} style={{ ...input, resize: 'vertical' }} />
        </div>
        <div>
          <label htmlFor="task-list" style={label}>{t('tasks.checklist')}</label>
          <textarea id="task-list" rows={4} value={form.checklistText} onChange={e => set({ checklistText: e.target.value })}
            aria-describedby="task-list-hint" placeholder={t('tasks.checklistPlaceholder')} style={{ ...input, resize: 'vertical' }} />
          <p id="task-list-hint" style={{ fontSize: '12px', color: colors.muted, marginTop: '4px' }}>{t('tasks.checklistHint')}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{ ...btn, background: 'transparent' }}>{t('common.cancel')}</button>
          <button type="submit" disabled={busy || !form.title.trim()} style={btnPrimary}>{t('tasks.save')}</button>
        </div>
      </form>
    </Modal>
  )
}

export const GigLink = ({ gig }) => (gig
  ? <Link to={`/gig/${gig.id}?tab=tasks`} style={{ color: colors.accentText, background: tint(colors.accent, 10), borderRadius: '6px', padding: '0 6px' }}>{gig.name}</Link>
  : null)
