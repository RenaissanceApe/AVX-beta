import { useCallback, useEffect, useMemo, useState } from 'react'
import { ListTodo } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { saveSnapshot, loadSnapshot, isNetworkError } from '../lib/offline'
import { TASK_FIELDS, sortTasks, filterTasks } from '../lib/tasks'
import { localDay } from '../lib/onSite'
import { useI18n } from '../i18n'
import { btn, colors, AvxLoader, PageHeader, Stack, space } from '../components/ui'
import AppShell from '../components/shell/AppShell'
import EmptyState from '../components/EmptyState'
import { TaskRow, GigLink } from '../components/tasks/TaskParts'

// My tasks (docs/TOOLS_PLAN.md step 5): every task given to me, on any gig or organisation, most
// urgent first. Tick them here; edit them on their gig.
//   /tasks
export default function MyTasksPage() {
  const { user } = useAuth()
  const { t } = useI18n()
  const { notify } = useToast()
  const [tasks, setTasks] = useState(null)
  const [names, setNames] = useState({})
  const [open, setOpen] = useState(true)
  const today = localDay()

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('tasks').select(`${TASK_FIELDS}, gigs(id, name), organisations(name)`)
      .eq('assignee_id', user.id).is('removed_at', null).order('due_on', { ascending: true, nullsFirst: false }).limit(500)
    if (error && isNetworkError(error)) return setTasks(loadSnapshot(`myTasks.${user.id}`)?.data || [])
    if (error) logger.error('tasks', error, { step: 'mine' })
    setTasks(data || [])
    if (data) saveSnapshot(`myTasks.${user.id}`, data)
    const ids = [...new Set((data || []).flatMap(x => [x.done_by]).filter(Boolean))]
    if (ids.length) supabase.from('profiles').select('id, full_name').in('id', ids).then(({ data: p }) => setNames(Object.fromEntries((p || []).map(x => [x.id, x.full_name]))))
  }, [user.id])
  useEffect(() => { load() }, [load])

  const shown = useMemo(() => sortTasks(filterTasks(tasks, { open })), [tasks, open])
  const nameOf = uid => (uid === user.id ? t('tasks.you') : names[uid] || t('common.unknown'))

  async function patch(task, values) {
    setTasks(list => list.map(x => (x.id === task.id ? { ...x, ...values } : x)))
    const { error } = await supabase.from('tasks').update(values).eq('id', task.id)
    if (error) { notify(userMessage(error), 'error'); load() }
  }

  return (
    <AppShell>
      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '24px 16px 48px' }}>
        <PageHeader title={t('tasks.myTitle')} line={t('tasks.myIntro')} />
        <Stack gap={4}>
        <div>
          <button type="button" aria-pressed={open} onClick={() => setOpen(o => !o)}
            style={{ ...btn, minHeight: '44px', padding: '8px 12px', background: 'transparent', borderColor: 'transparent', borderBottom: `2px solid ${open ? 'var(--accent)' : 'transparent'}`, color: open ? colors.text : colors.muted }}>{t('tasks.openOnly')}</button>
        </div>
        {tasks === null ? <AvxLoader size={22} color={colors.accentText} />
          : shown.length === 0 ? <EmptyState icon={<ListTodo size={28} />} title={t('tasks.myEmptyTitle')} body={t('tasks.myEmptyBody')} />
            : (
              <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: space[3] }}>
                {shown.map(task => (
                  <TaskRow key={task.id} task={task} today={today} nameOf={nameOf} canTick canManage={false}
                    onToggle={() => patch(task, { status: task.status === 'open' ? 'done' : 'open' })}
                    onChecklist={list => patch(task, { checklist: list })}
                    gigLink={task.gigs ? <GigLink gig={task.gigs} /> : task.organisations ? <span>{task.organisations.name}</span> : null} />
                ))}
              </ul>
            )}
        </Stack>
      </div>
    </AppShell>
  )
}
