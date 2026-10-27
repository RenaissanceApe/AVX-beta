import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Loader2, Plus, ListTodo, Wrench } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { track } from '../lib/usage'
import { useWorkspace } from '../lib/WorkspaceContext'
import { saveSnapshot, loadSnapshot, isNetworkError } from '../lib/offline'
import { TASK_FIELDS, TEMPLATE_FIELDS, sortTasks, filterTasks, taskPlace } from '../lib/tasks'
import { localDay } from '../lib/onSite'
import { useI18n } from '../i18n'
import { btn, btnPrimary, colors, tint } from '../components/ui'
import AppShell from '../components/shell/AppShell'
import EmptyState from '../components/EmptyState'
import { PageHelp } from '../components/help/HelpParts'
import { TaskRow, TaskForm, GigLink } from '../components/tasks/TaskParts'
import TaskTemplates from '../components/tasks/TaskTemplates'

// The organisation's tasks (docs/TOOLS_PLAN.md step 5, T2): its own (office, warehouse, repairs)
// and those on its gigs you can see, in one list; and its checklist templates.
//   /org/:orgId/tasks            the list
//   /org/:orgId/tasks?tab=templates
export default function OrgTasksPage() {
  const { orgId } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { user } = useAuth()
  const { t } = useI18n()
  const { notify } = useToast()
  const { orgs, roleIn, loading, setWorkspace } = useWorkspace()
  const role = roleIn(orgId)
  const org = orgs.find(o => o.id === orgId)
  const canManage = role === 'admin' || role === 'member'
  const tab = params.get('tab') === 'templates' ? 'templates' : 'tasks'
  const [tasks, setTasks] = useState(null)
  const [templates, setTemplates] = useState([])
  const [people, setPeople] = useState([])
  const [names, setNames] = useState({})
  const [filter, setFilter] = useState({ mine: false, open: true, place: 'all' })
  const [editing, setEditing] = useState(null) // null | 'new' | task
  const today = localDay()
  useEffect(() => { setWorkspace(orgId) }, [orgId, setWorkspace])

  const load = useCallback(async () => {
    const [tk, tp, mem] = await Promise.all([
      supabase.from('tasks').select(`${TASK_FIELDS}, gigs(id, name)`).eq('org_id', orgId).is('removed_at', null)
        .order('created_at', { ascending: false }).limit(1000),
      supabase.from('task_templates').select(TEMPLATE_FIELDS).eq('org_id', orgId).is('removed_at', null).order('name'),
      supabase.from('org_members').select('user_id, role').eq('org_id', orgId),
    ])
    if (tk.error && isNetworkError(tk.error)) {
      const snap = loadSnapshot(`orgTasks.${orgId}`)?.data
      setTasks(snap?.tasks || []); setTemplates(snap?.templates || []); setNames(snap?.names || {})
      return
    }
    if (tk.error) logger.error('tasks', tk.error, { step: 'org' })
    const list = tk.data || []
    setTasks(list)
    setTemplates(tp.data || [])
    setPeople(mem.data || [])
    const ids = [...new Set([...(mem.data || []).map(m => m.user_id), ...list.flatMap(x => [x.assignee_id, x.done_by])].filter(Boolean))]
    const { data: profiles } = ids.length ? await supabase.from('profiles').select('id, full_name').in('id', ids) : { data: [] }
    const map = Object.fromEntries((profiles || []).map(p => [p.id, p.full_name]))
    setNames(map)
    saveSnapshot(`orgTasks.${orgId}`, { tasks: list, templates: tp.data || [], names: map })
  }, [orgId])
  useEffect(() => { if (role) load() }, [role, load])
  useEffect(() => {
    if (!role) return undefined
    const channel = supabase.channel(`org-tasks-${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `org_id=eq.${orgId}` }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [orgId, role, load])

  const shown = useMemo(() => sortTasks(filterTasks(tasks, { mine: filter.mine, open: filter.open, userId: user.id })
    .filter(x => filter.place === 'all' || taskPlace(x) === filter.place)), [tasks, filter, user.id])
  const nameOf = uid => (uid === user.id ? t('tasks.you') : names[uid] || t('common.unknown'))

  async function save(values) {
    const isNew = editing === 'new'
    const { error } = isNew
      ? await supabase.from('tasks').insert({ ...values, org_id: orgId })
      : await supabase.from('tasks').update(values).eq('id', editing.id)
    if (error) return notify(userMessage(error), 'error')
    if (isNew) track('tasks:addOrg')
    setEditing(null)
    load()
  }
  async function patch(task, values) {
    setTasks(list => list.map(x => (x.id === task.id ? { ...x, ...values } : x)))
    const { error } = await supabase.from('tasks').update(values).eq('id', task.id)
    if (error) { notify(userMessage(error), 'error'); load() }
  }
  async function remove(task) {
    if (!window.confirm(t('tasks.removeConfirm', { title: task.title }))) return
    await patch(task, { removed_at: new Date().toISOString() })
    setTasks(list => list.filter(x => x.id !== task.id))
  }

  if (loading || (role && !tasks)) return <AppShell><div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}><Loader2 size={24} color={colors.accentText} style={{ animation: 'spin 1s linear infinite' }} /></div></AppShell>
  if (!role) return (
    <AppShell>
      <div style={{ maxWidth: '360px', margin: '80px auto', textAlign: 'center', padding: '0 16px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '8px' }}>{t('tasks.orgTitle')}</h1>
        <p style={{ color: colors.muted, fontSize: '14px', lineHeight: 1.6, marginBottom: '20px' }}>{t('tasks.noAccess')}</p>
        <button type="button" onClick={() => navigate('/dashboard')} style={btnPrimary}><ArrowLeft size={14} /> {t('common.backToDashboard')}</button>
      </div>
    </AppShell>
  )

  const chip = on => ({ ...btn, padding: '6px 12px', background: on ? tint(colors.accent, 22) : 'transparent', color: on ? colors.accentText : colors.soft })
  return (
    <AppShell>
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '24px 16px 48px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <div style={{ fontSize: '12px', color: colors.muted, overflowWrap: 'anywhere' }}>{org?.name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.4px' }}>{t('tasks.orgTitle')}</h1>
              <PageHelp page="org-tasks" />
            </div>
          </div>
          {tab === 'tasks' && canManage && <button type="button" onClick={() => setEditing('new')} style={btnPrimary}><Plus size={14} /> {t('tasks.new')}</button>}
        </div>

        <div role="tablist" aria-label={t('tasks.orgTitle')} style={{ display: 'flex', gap: '6px', borderBottom: `1px solid ${colors.border}` }}>
          {['tasks', 'templates'].map(k => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setParams(k === 'tasks' ? {} : { tab: k }, { replace: true })}
              style={{ background: 'none', border: 'none', borderBottom: `2px solid ${tab === k ? colors.accent : 'transparent'}`, padding: '8px 10px', font: 'inherit', fontSize: '14px', fontWeight: 600, color: tab === k ? 'var(--text)' : colors.muted, cursor: 'pointer' }}>
              {t(`tasks.orgTab.${k}`)}
            </button>
          ))}
        </div>

        {tab === 'templates' ? (
          <TaskTemplates orgId={orgId} templates={templates} canManage={canManage} onChanged={load} />
        ) : (
          <>
            {tasks.length > 0 && (
              <div role="group" aria-label={t('tasks.filters')} style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button type="button" aria-pressed={filter.mine} onClick={() => setFilter(f => ({ ...f, mine: !f.mine }))} style={chip(filter.mine)}>{t('tasks.mine')}</button>
                <button type="button" aria-pressed={filter.open} onClick={() => setFilter(f => ({ ...f, open: !f.open }))} style={chip(filter.open)}>{t('tasks.openOnly')}</button>
                {['org', 'gig'].map(p => (
                  <button key={p} type="button" aria-pressed={filter.place === p} onClick={() => setFilter(f => ({ ...f, place: f.place === p ? 'all' : p }))} style={chip(filter.place === p)}>{t(`tasks.place.${p}`)}</button>
                ))}
              </div>
            )}
            {tasks.length === 0 ? (
              <EmptyState icon={<ListTodo size={28} />} title={t('tasks.emptyTitle')} body={t(canManage ? 'tasks.orgEmptyManager' : 'tasks.orgEmpty')}
                action={canManage ? t('tasks.new') : null} onAction={() => setEditing('new')} guide="pm-org-tasks" />
            ) : shown.length === 0 ? (
              <p style={{ color: colors.muted, fontSize: '14px' }}>{t('tasks.noneHere')}</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {shown.map(task => {
                  const own = !task.gig_id
                  return (
                    <TaskRow key={task.id} task={task} today={today} nameOf={nameOf}
                      canTick={canManage || task.assignee_id === user.id} canManage={canManage && own}
                      onToggle={() => patch(task, { status: task.status === 'open' ? 'done' : 'open' })}
                      onChecklist={list => patch(task, { checklist: list })}
                      onEdit={() => setEditing(task)} onRemove={() => remove(task)}
                      gigLink={task.gigs ? <GigLink gig={task.gigs} />
                        : task.repair_id ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}><Wrench size={12} aria-hidden="true" /> {t('tasks.fromRepair')}</span> : null} />
                  )
                })}
              </ul>
            )}
          </>
        )}
        {editing && <TaskForm task={editing === 'new' ? null : editing} people={people} nameOf={nameOf} templates={templates} onSave={save} onClose={() => setEditing(null)} />}
      </div>
    </AppShell>
  )
}
