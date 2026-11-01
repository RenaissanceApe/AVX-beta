import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, ListTodo } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { saveSnapshot, loadSnapshot, isNetworkError } from '../../lib/offline'
import { updateIfUnchanged, notifyConflict } from '../../lib/staleSave'
import { TASK_FIELDS, TEMPLATE_FIELDS, sortTasks, filterTasks } from '../../lib/tasks'
import { localDay } from '../../lib/onSite'
import { t } from '../../i18n'
import { btn, btnPrimary, colors, tint } from '../ui'
import EmptyState from '../EmptyState'
import { TabHeader } from './parts'
import { TaskRow, TaskForm } from '../tasks/TaskParts'

// A gig's tasks (docs/TOOLS_PLAN.md build order step 5): managers add and edit them; anyone who
// writes on the gig, or the person a task is for, ticks it and its checklist. Live and offline.
export default function TasksTab({ gig, members, nameOf, userId, canManage, canNote, offline, onChanged }) {
  const { notify } = useToast()
  const [tasks, setTasks] = useState(null)
  const [editing, setEditing] = useState(null) // null | 'new' | task
  const [filter, setFilter] = useState({ mine: false, open: true })
  const [templates, setTemplates] = useState([])
  const today = localDay()

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('tasks').select(TASK_FIELDS).eq('gig_id', gig.id).is('removed_at', null)
    if (error && isNetworkError(error)) return setTasks(loadSnapshot(`tasks.${gig.id}`)?.data || [])
    if (error) logger.error('tasks', error, { step: 'load' })
    setTasks(data || [])
    if (data) saveSnapshot(`tasks.${gig.id}`, data)
  }, [gig.id])
  useEffect(() => { load() }, [load])
  // The organisation's checklist templates, for managers starting a task
  useEffect(() => {
    if (!canManage || !gig.org_id) return
    supabase.from('task_templates').select(TEMPLATE_FIELDS).eq('org_id', gig.org_id).is('removed_at', null).order('name')
      .then(({ data }) => setTemplates(data || []))
  }, [canManage, gig.org_id])
  useEffect(() => {
    const channel = supabase.channel(`tasks-${gig.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `gig_id=eq.${gig.id}` }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [gig.id, load])

  const shown = useMemo(() => sortTasks(filterTasks(tasks, { ...filter, userId })), [tasks, filter, userId])
  const openCount = filterTasks(tasks, { open: true }).length

  async function save(values) {
    const isNew = editing === 'new'
    const { error, conflict } = isNew
      ? await supabase.from('tasks').insert({ ...values, gig_id: gig.id })
      : await updateIfUnchanged(supabase, 'tasks', editing.id, values, editing.updated_at)
    if (error) return notify(userMessage(error), 'error')
    if (conflict) {
      logger.warn('tasks', 'save refused', { step: 'update', taskId: editing.id, conflict })
      return notifyConflict(conflict, notify, t)
    }
    if (isNew) track('tasks:add')
    setEditing(null)
    load()
    onChanged?.()
  }
  async function patch(task, values) {
    setTasks(list => list.map(x => (x.id === task.id ? { ...x, ...values } : x)))
    const { data, error } = await supabase.from('tasks').update(values).eq('id', task.id).select('updated_at')
    if (data?.[0]) setTasks(list => list.map(x => (x.id === task.id ? { ...x, updated_at: data[0].updated_at } : x)))
    if (error) { notify(userMessage(error), 'error'); load() } else onChanged?.()
  }
  async function remove(task) {
    if (!window.confirm(t('tasks.removeConfirm', { title: task.title }))) return
    await patch(task, { removed_at: new Date().toISOString() })
    setTasks(list => list.filter(x => x.id !== task.id))
  }

  const chip = on => ({ ...btn, padding: '6px 12px', background: on ? tint(colors.accent, 22) : 'transparent', color: on ? colors.accentText : colors.soft })
  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <TabHeader title={t('gig.tab.tasks')} subtitle={t('tasks.subtitle', { count: openCount })}
        action={canManage && !offline && <button type="button" onClick={() => setEditing('new')} style={btnPrimary}><Plus size={14} /> {t('tasks.new')}</button>} />
      {tasks && tasks.length > 0 && (
        <div role="group" aria-label={t('tasks.filters')} style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
          <button type="button" aria-pressed={filter.mine} onClick={() => setFilter(f => ({ ...f, mine: !f.mine }))} style={chip(filter.mine)}>{t('tasks.mine')}</button>
          <button type="button" aria-pressed={filter.open} onClick={() => setFilter(f => ({ ...f, open: !f.open }))} style={chip(filter.open)}>{t('tasks.openOnly')}</button>
        </div>
      )}
      {tasks === null ? null : tasks.length === 0 ? (
        <EmptyState icon={<ListTodo size={28} />} title={t('tasks.emptyTitle')} body={canManage ? t('tasks.emptyManager') : t('tasks.emptyCrew')}
          action={canManage && !offline ? t('tasks.new') : null} onAction={() => setEditing('new')} guide="pm-tasks" />
      ) : shown.length === 0 ? (
        <p style={{ color: colors.muted, fontSize: '14px' }}>{t('tasks.noneHere')}</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {shown.map(task => (
            <TaskRow key={task.id} task={task} today={today} nameOf={nameOf}
              canTick={!offline && (canNote || task.assignee_id === userId)} canManage={canManage && !offline}
              onToggle={() => patch(task, { status: task.status === 'open' ? 'done' : 'open' })}
              onChecklist={list => patch(task, { checklist: list })}
              onEdit={() => setEditing(task)} onRemove={() => remove(task)} />
          ))}
        </ul>
      )}
      {editing && <TaskForm task={editing === 'new' ? null : editing} people={members} nameOf={nameOf} templates={templates} onSave={save} onClose={() => setEditing(null)} />}
    </div>
  )
}
