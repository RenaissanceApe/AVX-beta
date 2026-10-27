import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus, ArrowLeft, Play, Pause, RotateCcw, Clock, Flag, Mic, MicOff, Camera, Check, Trash2, FileText, Download, Loader2, Square, CloudOff, ListTodo } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { saveSnapshot, loadSnapshot, isNetworkError } from '../../lib/offline'
import {
  FRAME_RATES, DEPARTMENTS, PRIORITIES, QUICK, msToTc, parseTc, clockMs, clampAnchor, timeOfDayMs, measureOffset,
  departmentFor, filterNotes, sortByTime, notesCsv, notesExport, noteRow, queueNote, readQueuedNotes, flushQueuedNotes,
  REHEARSAL_OUTBOX_CHANGED,
} from '../../lib/rehearsal'
import { taskFromNote } from '../../lib/tasks'
import { t, getLanguage, fmt } from '../../i18n'
import { Modal, btn, btnPrimary, btnDanger, iconBtn, input, label, card, colors, tint } from '../ui'
import EmptyState from '../EmptyState'
import { CameraSync, LtcSync, SyncIcons } from './TimecodeSync'

const SESSION_FIELDS = 'id, gig_id, name, fps, frame_count, clock, running, anchor_at, anchor_ms, clock_set_by, created_by, created_at, ended_at'
const NOTE_FIELDS = 'id, session_id, gig_id, client_id, author_id, tc_ms, written_at, department, priority, cue, body, photo_path, assignee_id, status, done_by, done_at, created_at, removed_at'
const PRIORITY_COLOUR = { note: 'var(--muted)', fix: 'var(--warn)', urgent: 'var(--danger)' }

// Rehearsal companion (docs/TOOLS_PLAN.md §2, R1): sessions on a gig, each with a clock everyone
// shares, and notes marked at a timecode by everyone at once. ?session=<id> opens one.
export default function RehearsalTool({ gig, members, nameOf, userId, canNote, canManage, offline }) {
  const { notify } = useToast()
  const [params, setParams] = useSearchParams()
  const [sessions, setSessions] = useState(null)
  const [creating, setCreating] = useState(false)
  const openId = params.get('session')
  const setOpen = id => setParams(p => {
    const next = new URLSearchParams(p)
    if (id) next.set('session', id); else next.delete('session')
    return next
  })

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('rehearsal_sessions').select(SESSION_FIELDS)
      .eq('gig_id', gig.id).is('removed_at', null).order('created_at', { ascending: false })
    if (error && isNetworkError(error)) return setSessions(loadSnapshot(`rehearsals.${gig.id}`)?.data || [])
    if (error) logger.error('rehearsal', error, { step: 'sessions' })
    setSessions(data || [])
    if (data) saveSnapshot(`rehearsals.${gig.id}`, data)
  }, [gig.id])
  useEffect(() => { load() }, [load])

  async function create(form) {
    const { data, error } = await supabase.from('rehearsal_sessions').insert({
      gig_id: gig.id, name: form.name, fps: form.fps, frame_count: form.df ? 'df' : 'ndf', clock: form.clock,
      running: form.clock === 'time_of_day', anchor_ms: form.clock === 'time_of_day' ? clampAnchor(timeOfDayMs()) : 0,
    }).select(SESSION_FIELDS).single()
    if (error) return notify(userMessage(error), 'error')
    track('rehearsal:session')
    setCreating(false)
    await load()
    setOpen(data.id)
  }

  const open = (sessions || []).find(s => s.id === openId)
  if (openId && open) return (
    <SessionView session={open} gig={gig} members={members} nameOf={nameOf} userId={userId} canNote={canNote}
      canManage={canManage || open.created_by === userId} offline={offline} onBack={() => setOpen(null)} onChanged={load}
      earlier={(sessions || []).filter(s => s.id !== open.id)} />
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 240px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700 }}>{t('tools.name.rehearsal')}</h2>
          <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5 }}>{t('rehearsal.intro')}</p>
        </div>
        {canNote && !offline && <button type="button" onClick={() => setCreating(true)} style={btnPrimary}><Plus size={14} /> {t('rehearsal.new')}</button>}
      </div>
      {sessions === null ? <Loader2 size={20} color={colors.accentText} style={{ animation: 'spin 1s linear infinite' }} />
        : sessions.length === 0 ? (
          <EmptyState icon={<Flag size={28} />} title={t('rehearsal.emptyTitle')} body={canNote ? t('rehearsal.emptyBody') : t('rehearsal.emptyReader')}
            action={canNote && !offline ? t('rehearsal.new') : null} onAction={() => setCreating(true)} guide="crew-rehearsal" />
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {sessions.map(s => (
              <li key={s.id}>
                <button type="button" onClick={() => setOpen(s.id)} style={{ ...card, width: '100%', textAlign: 'left', cursor: 'pointer', color: 'var(--text)', font: 'inherit', display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <Flag size={18} color={s.ended_at ? colors.muted : colors.accentText} aria-hidden="true" />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ display: 'block' }}>{s.name}</strong>
                    <span style={{ fontSize: '12px', color: colors.muted }}>
                      {fmt(s.created_at, 'd MMM, HH:mm')} · {fpsLabel(s)} · {s.ended_at ? t('rehearsal.ended') : t(`rehearsal.clock.${s.clock}`)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      {creating && <NewSession count={(sessions || []).length} onCancel={() => setCreating(false)} onCreate={create} />}
    </div>
  )
}

const fpsLabel = s => `${Number(s.fps)} fps${s.frame_count === 'df' ? ' DF' : ''}`

function NewSession({ count, onCancel, onCreate }) {
  const [form, setForm] = useState({ name: t('rehearsal.defaultName', { n: count + 1 }), fps: 25, df: false, clock: 'time_of_day' })
  const [busy, setBusy] = useState(false)
  const set = patch => setForm(f => ({ ...f, ...patch }))
  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    await onCreate(form)
    setBusy(false)
  }
  return (
    <Modal title={t('rehearsal.new')} onClose={onCancel}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <label htmlFor="rh-name" style={label}>{t('rehearsal.name')}</label>
          <input id="rh-name" value={form.name} maxLength={80} required onChange={e => set({ name: e.target.value })} style={input} />
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 140px' }}>
            <label htmlFor="rh-fps" style={label}>{t('rehearsal.fps')}</label>
            <select id="rh-fps" value={form.fps} onChange={e => set({ fps: Number(e.target.value), df: Number(e.target.value) === 29.97 && form.df })} style={input}>
              {FRAME_RATES.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <label htmlFor="rh-clock" style={label}>{t('rehearsal.clockLabel')}</label>
            <select id="rh-clock" value={form.clock} onChange={e => set({ clock: e.target.value })} style={input}>
              <option value="time_of_day">{t('rehearsal.clock.time_of_day')}</option>
              <option value="stopwatch">{t('rehearsal.clock.stopwatch')}</option>
            </select>
          </div>
        </div>
        {form.fps === 29.97 && (
          <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '14px' }}>
            <input type="checkbox" checked={form.df} onChange={e => set({ df: e.target.checked })} /> {t('rehearsal.dropFrame')}
          </label>
        )}
        <p style={{ fontSize: '12px', color: colors.muted, lineHeight: 1.5 }}>{t('rehearsal.clockHint')}</p>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel} style={{ ...btn, background: 'transparent' }}>{t('common.cancel')}</button>
          <button type="submit" disabled={busy || !form.name.trim()} style={btnPrimary}>{t('rehearsal.start')}</button>
        </div>
      </form>
    </Modal>
  )
}

// ── One session ──────────────────────────────────────────────────────────────
function SessionView({ session: initial, gig, members, nameOf, userId, canNote, canManage, offline, onBack, onChanged, earlier }) {
  const { notify } = useToast()
  const [session, setSession] = useState(initial)
  const [notes, setNotes] = useState(null)
  const [queued, setQueued] = useState(() => readQueuedNotes(userId).filter(n => n.session_id === initial.id))
  const [carried, setCarried] = useState([])
  const [offset, setOffset] = useState(0)
  const [composer, setComposer] = useState(null) // { tc_ms } while writing
  const [setting, setSetting] = useState(false)
  const [syncing, setSyncing] = useState(null) // 'camera' | 'ltc'
  const [filter, setFilter] = useState({ department: 'all', mine: false, open: false })
  const canMark = canNote && !session.ended_at
  const me = members.find(m => m.user_id === userId)
  const myDept = departmentFor(me?.function_title)
  const df = session.frame_count === 'df'

  useEffect(() => { setSession(initial) }, [initial])
  useEffect(() => { measureOffset().then(setOffset) }, [])

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('rehearsal_notes').select(NOTE_FIELDS).eq('session_id', initial.id).is('removed_at', null).order('tc_ms')
    if (error && isNetworkError(error)) return setNotes(loadSnapshot(`rehearsalNotes.${initial.id}`)?.data || [])
    if (error) logger.error('rehearsal', error, { step: 'notes' })
    setNotes(data || [])
    if (data) saveSnapshot(`rehearsalNotes.${initial.id}`, data)
  }, [initial.id])
  useEffect(() => { load() }, [load])

  // Open notes from earlier runs of this gig, carried into this one
  useEffect(() => {
    const ids = earlier.map(s => s.id)
    if (!ids.length) return setCarried([])
    supabase.from('rehearsal_notes').select(NOTE_FIELDS).in('session_id', ids).eq('status', 'open').is('removed_at', null).order('created_at').limit(200)
      .then(({ data, error }) => { if (error && !isNetworkError(error)) logger.error('rehearsal', error, { step: 'carried' }); setCarried(data || []) })
  }, [earlier.map(s => s.id).join()]) // eslint-disable-line react-hooks/exhaustive-deps

  // Live: everyone's notes and the shared clock
  useEffect(() => {
    const merge = row => setNotes(list => {
      const rest = (list || []).filter(n => n.id !== row.id)
      return row.removed_at ? rest : sortByTime([...rest, row])
    })
    const channel = supabase.channel(`rehearsal-${initial.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rehearsal_notes', filter: `session_id=eq.${initial.id}` }, p => p.new?.id && merge(p.new))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rehearsal_sessions', filter: `id=eq.${initial.id}` }, p => {
        if (p.new?.removed_at) { onBack(); onChanged() } else if (p.new) setSession(s => ({ ...s, ...p.new }))
      })
      .subscribe(status => { if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') logger.warn('realtime', `Channel ${status}`, { session: initial.id }) })
    return () => { supabase.removeChannel(channel) }
  }, [initial.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Notes written offline go out when the connection is back
  useEffect(() => {
    const refresh = () => setQueued(readQueuedNotes(userId).filter(n => n.session_id === initial.id))
    const flush = async () => {
      const { sent, failed } = await flushQueuedNotes(userId)
      if (sent) { notify(t('rehearsal.sentQueued', { count: sent }), 'success'); load() }
      if (failed) notify(t('rehearsal.queuedFailed', { count: failed }), 'error')
    }
    window.addEventListener(REHEARSAL_OUTBOX_CHANGED, refresh)
    window.addEventListener('online', flush)
    flush()
    return () => { window.removeEventListener(REHEARSAL_OUTBOX_CHANGED, refresh); window.removeEventListener('online', flush) }
  }, [userId, initial.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const now = () => clockMs(session, offset)

  async function moveClock(patch) {
    const { error } = await supabase.from('rehearsal_sessions').update(patch).eq('id', session.id)
    if (error) return notify(userMessage(error), 'error')
    // The server sets the anchor's time; read it back so this phone matches everyone else
    const { data } = await supabase.from('rehearsal_sessions').select(SESSION_FIELDS).eq('id', session.id).maybeSingle()
    if (data) setSession(data)
  }
  // The reading and the server time it belongs to go together, so network delay doesn't shift it
  const setTo = (ms, extra = {}) => moveClock({ anchor_ms: clampAnchor(ms), anchor_at: new Date(Date.now() + offset).toISOString(), ...extra })
  const nudge = by => setTo(now() + by)
  const frame = 1000 / Number(session.fps)

  async function save(note) {
    const row = { ...note, session_id: session.id, gig_id: gig.id, client_id: note.client_id || crypto.randomUUID() }
    const { data, error } = await supabase.from('rehearsal_notes').insert(noteRow(row)).select(NOTE_FIELDS).single()
    if (error && isNetworkError(error)) {
      if (row.photo_path || row.file) notify(t('rehearsal.photoNeedsConnection'), 'error')
      queueNote(userId, { ...noteRow(row), photo_path: null, queued_at: new Date().toISOString() })
      return true
    }
    if (error) { notify(userMessage(error), 'error'); return false }
    track('rehearsal:note')
    setNotes(list => sortByTime([...(list || []).filter(n => n.id !== data.id), data]))
    return true
  }

  async function update(note, patch) {
    setNotes(list => (list || []).map(n => (n.id === note.id ? { ...n, ...patch } : n)))
    const { error } = await supabase.from('rehearsal_notes').update(patch).eq('id', note.id)
    if (error) { notify(userMessage(error), 'error'); load() }
  }
  async function makeTask(note) {
    const { error } = await supabase.from('tasks').insert(taskFromNote(note))
    if (error && error.code === '23505') return notify(t('rehearsal.taskExists'), 'success')
    if (error) return notify(userMessage(error), 'error')
    track('rehearsal:task')
    notify(t('rehearsal.taskMade'), 'success')
  }
  async function remove(note) {
    if (!window.confirm(t('rehearsal.removeConfirm'))) return
    setNotes(list => (list || []).filter(n => n.id !== note.id))
    setCarried(list => list.filter(n => n.id !== note.id))
    const { error } = await supabase.from('rehearsal_notes').update({ removed_at: new Date().toISOString() }).eq('id', note.id)
    if (error) { notify(userMessage(error), 'error'); load() }
  }
  async function end() {
    if (!window.confirm(t('rehearsal.endConfirm'))) return
    await moveClock({ ended_at: new Date().toISOString(), running: false, anchor_ms: clampAnchor(now()) })
    onChanged()
  }
  async function removeSession() {
    if (!window.confirm(t('rehearsal.removeSessionConfirm', { name: session.name }))) return
    const { error } = await supabase.from('rehearsal_sessions').update({ removed_at: new Date().toISOString() }).eq('id', session.id)
    if (error) return notify(userMessage(error), 'error')
    notify(t('rehearsal.sessionRemoved'), 'success')
    onBack()
    onChanged()
  }

  function download(kind) {
    const all = notes || []
    const name = `${gig.name} - ${session.name}`.replace(/[\\/:*?"<>|]+/g, ' ').trim()
    const blob = kind === 'csv'
      ? new Blob(['﻿' + notesCsv(all, session, { nameOf, label: t })], { type: 'text/csv;charset=utf-8' })
      : new Blob([JSON.stringify(notesExport(all, session, gig), null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${name}.${kind}`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    track(`rehearsal:${kind}`)
  }

  const shown = filterNotes(notes, { ...filter, userId })
  const pending = queued.map(q => ({ ...q, id: `q-${q.client_id}`, author_id: userId, status: 'open', pending: true }))
  const carriedShown = filterNotes(carried, { ...filter, open: true, userId })

  return (
    <div>
      <button type="button" onClick={onBack} style={{ ...btn, background: 'transparent', color: colors.soft, padding: '6px 10px', marginBottom: '10px' }}>
        <ArrowLeft size={14} /> {t('tools.name.rehearsal')}
      </button>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, overflowWrap: 'anywhere' }}>{session.name}</h2>
          <p style={{ fontSize: '12px', color: colors.muted }}>
            {fpsLabel(session)} · {session.ended_at ? t('rehearsal.endedAt', { time: fmt(session.ended_at, 'd MMM, HH:mm') }) : t(`rehearsal.clock.${session.clock}`)}
            {session.clock_set_by ? ` · ${t('rehearsal.clockBy', { name: nameOf(session.clock_set_by) })}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <Link to={`/gig/${gig.id}/rehearsal/${session.id}`} style={{ ...btn, textDecoration: 'none' }}><FileText size={14} /> {t('rehearsal.report')}</Link>
          <button type="button" onClick={() => download('csv')} style={btn}><Download size={14} /> CSV</button>
          <button type="button" onClick={() => download('json')} style={btn} title={t('rehearsal.jsonHint')}><Download size={14} /> JSON</button>
        </div>
      </div>

      <ClockPanel session={session} offset={offset} df={df}>
        {canMark && !offline && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {session.clock === 'stopwatch' && (session.running
              ? <button type="button" onClick={() => setTo(now(), { running: false })} style={btn}><Pause size={14} /> {t('rehearsal.pause')}</button>
              : <button type="button" onClick={() => setTo(session.anchor_ms, { running: true })} style={btn}><Play size={14} /> {t('rehearsal.run')}</button>)}
            {session.clock === 'stopwatch' && <button type="button" onClick={() => setTo(0, { running: false })} style={btn}><RotateCcw size={14} /> {t('rehearsal.reset')}</button>}
            <button type="button" onClick={() => nudge(-1000)} style={btn} aria-label={t('rehearsal.nudge', { by: '−1s' })}>−1s</button>
            <button type="button" onClick={() => nudge(-frame)} style={btn} aria-label={t('rehearsal.nudge', { by: '−1f' })}>−1f</button>
            <button type="button" onClick={() => nudge(frame)} style={btn} aria-label={t('rehearsal.nudge', { by: '+1f' })}>+1f</button>
            <button type="button" onClick={() => nudge(1000)} style={btn} aria-label={t('rehearsal.nudge', { by: '+1s' })}>+1s</button>
            <button type="button" onClick={() => setSetting(true)} style={btn}><Clock size={14} /> {t('rehearsal.setClock')}</button>
            <button type="button" onClick={() => setSyncing('camera')} style={btn}><SyncIcons.camera size={14} /> {t('rehearsal.fromCamera')}</button>
            <button type="button" onClick={() => setSyncing('ltc')} style={btn}><SyncIcons.ltc size={14} /> {t('rehearsal.fromLtc')}</button>
          </div>
        )}
        <DriftNote session={session} offset={offset} />
      </ClockPanel>

      {canMark && (
        <button type="button" onClick={() => setComposer({ tc_ms: now() })}
          style={{ ...btnPrimary, width: '100%', justifyContent: 'center', fontSize: '18px', padding: '18px', margin: '12px 0 18px', minHeight: '64px' }}>
          <Flag size={20} /> {t('rehearsal.mark')}
        </button>
      )}

      <div role="group" aria-label={t('rehearsal.filters')} style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px' }}>
        <label htmlFor="rh-dept-filter" className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{t('rehearsal.department')}</label>
        <select id="rh-dept-filter" value={filter.department} onChange={e => setFilter(f => ({ ...f, department: e.target.value }))} style={{ ...input, width: 'auto', padding: '7px 10px' }}>
          <option value="all">{t('rehearsal.allDepartments')}</option>
          {DEPARTMENTS.map(d => <option key={d} value={d}>{t(`rehearsal.dept.${d}`)}</option>)}
        </select>
        <Chip on={filter.mine} onClick={() => setFilter(f => ({ ...f, mine: !f.mine }))}>{t('rehearsal.mine')}</Chip>
        <Chip on={filter.open} onClick={() => setFilter(f => ({ ...f, open: !f.open }))}>{t('rehearsal.openOnly')}</Chip>
        <span style={{ fontSize: '12px', color: colors.muted, marginLeft: 'auto' }} aria-live="polite">{t('rehearsal.count', { count: shown.length })}</span>
      </div>

      {notes === null ? <Loader2 size={20} color={colors.accentText} style={{ animation: 'spin 1s linear infinite' }} /> : (
        <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {pending.map(n => <NoteRow key={n.id} note={n} session={session} nameOf={nameOf} />)}
          {shown.map(n => (
            <NoteRow key={n.id} note={n} session={session} nameOf={nameOf} canNote={canNote}
              canRemove={n.author_id === userId || canManage} onToggle={() => update(n, { status: n.status === 'open' ? 'done' : 'open' })}
              onRemove={() => remove(n)} onTask={canManage && !offline ? () => makeTask(n) : null} />
          ))}
          {shown.length === 0 && pending.length === 0 && <li style={{ color: colors.muted, fontSize: '14px', padding: '8px 0' }}>{t('rehearsal.noNotes')}</li>}
        </ul>
      )}

      {carriedShown.length > 0 && (
        <section style={{ marginTop: '22px' }}>
          <h3 style={{ ...label, marginBottom: '8px' }}>{t('rehearsal.carried', { count: carriedShown.length })}</h3>
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {carriedShown.map(n => {
              const from = earlier.find(s => s.id === n.session_id)
              return (
                <NoteRow key={n.id} note={n} session={from || session} nameOf={nameOf} from={from?.name} canNote={canNote}
                  canRemove={n.author_id === userId || canManage}
                  onToggle={async () => {
                    setCarried(list => list.filter(x => x.id !== n.id))
                    const { error } = await supabase.from('rehearsal_notes').update({ status: 'done' }).eq('id', n.id)
                    if (error) notify(userMessage(error), 'error')
                  }}
                  onRemove={() => remove(n)} />
              )
            })}
          </ul>
        </section>
      )}

      {!offline && (canManage || (canNote && !session.ended_at)) && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '24px' }}>
          {canMark && <button type="button" onClick={end} style={{ ...btn, background: 'transparent' }}><Square size={14} /> {t('rehearsal.end')}</button>}
          {canManage && <button type="button" onClick={removeSession} style={btnDanger}><Trash2 size={14} /> {t('rehearsal.removeSession')}</button>}
        </div>
      )}

      {composer && (
        <NoteComposer tc={composer.tc_ms} session={session} gig={gig} members={members} nameOf={nameOf} defaultDept={myDept} offline={offline}
          onCancel={() => setComposer(null)} onSave={async note => { if (await save(note)) setComposer(null) }} />
      )}
      {syncing === 'camera' && (
        <CameraSync session={session} onClose={() => setSyncing(null)} onType={() => { setSyncing(null); setSetting(true) }}
          onUse={async (ms, clock) => { await setTo(ms, { clock, running: true }); setSyncing(null); track('rehearsal:sync:camera') }} />
      )}
      {syncing === 'ltc' && (
        <LtcSync session={session} onClose={() => setSyncing(null)}
          onUse={async (ms, clock) => { await setTo(ms, { clock, running: true }); setSyncing(null); track('rehearsal:sync:ltc') }} />
      )}
      {setting && (
        <SetClock session={session} current={now()} onCancel={() => setSetting(false)}
          onSet={async (ms, extra) => { await setTo(ms, extra); setSetting(false); track('rehearsal:setClock') }} />
      )}
    </div>
  )
}

function Chip({ on, onClick, children }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      style={{ ...btn, padding: '6px 12px', background: on ? tint(colors.accent, 22) : 'transparent', color: on ? colors.accentText : colors.soft }}>
      {children}
    </button>
  )
}

// Camera and LTC clocks run on their own and drift from the phone's; after a while, say so
function DriftNote({ session, offset }) {
  const [, tick] = useState(0)
  useEffect(() => { const id = setInterval(() => tick(n => n + 1), 30000); return () => clearInterval(id) }, [])
  if (!['camera', 'ltc'].includes(session.clock) || !session.running || session.ended_at) return null
  const minutes = Math.floor((Date.now() + offset - new Date(session.anchor_at).getTime()) / 60000)
  if (minutes < 20) return null
  return <p role="note" style={{ fontSize: '12px', color: 'var(--warn)', lineHeight: 1.5 }}>{t('rehearsal.drift', { min: minutes })}</p>
}

// The big timecode, redrawn every frame from the shared anchor
function ClockPanel({ session, offset, df, children }) {
  const ref = useRef(null)
  useEffect(() => {
    let raf
    const draw = () => {
      if (ref.current) ref.current.textContent = msToTc(clockMs(session, offset), session.fps, df)
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [session, offset, df])
  return (
    <div style={{ ...card, textAlign: 'center', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div ref={ref} role="timer" aria-label={t('rehearsal.timecode')}
        style={{ fontFamily: 'var(--font-mono)', fontSize: 'clamp(32px, 11vw, 64px)', fontWeight: 700, letterSpacing: '0.02em', fontVariantNumeric: 'tabular-nums', color: session.running ? 'var(--text)' : colors.muted }} />
      {children}
    </div>
  )
}

function SetClock({ session, current, onCancel, onSet }) {
  const df = session.frame_count === 'df'
  const [text, setText] = useState(msToTc(current, session.fps, df))
  const ms = parseTc(text, session.fps, df)
  return (
    <Modal title={t('rehearsal.setClock')} onClose={onCancel}>
      <form onSubmit={e => { e.preventDefault(); if (ms !== null) onSet(ms, session.clock === 'time_of_day' ? { clock: 'stopwatch', running: true } : {}) }}
        style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div>
          <label htmlFor="rh-set" style={label}>{t('rehearsal.timecode')}</label>
          <input id="rh-set" value={text} onChange={e => setText(e.target.value)} inputMode="numeric" autoComplete="off"
            aria-describedby="rh-set-hint" aria-invalid={ms === null}
            style={{ ...input, fontFamily: 'var(--font-mono)', fontSize: '22px', textAlign: 'center' }} />
          <p id="rh-set-hint" style={{ fontSize: '12px', color: ms === null ? colors.danger : colors.muted, marginTop: '6px', lineHeight: 1.5 }}>
            {ms === null ? t('rehearsal.badTimecode') : t('rehearsal.setHint')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button type="button" onClick={() => onSet(timeOfDayMs(), { clock: 'time_of_day', running: true })} style={{ ...btn, background: 'transparent' }}>
            <Clock size={14} /> {t('rehearsal.useTimeOfDay')}
          </button>
          <button type="submit" disabled={ms === null} style={btnPrimary}>{t('rehearsal.setNow')}</button>
        </div>
      </form>
    </Modal>
  )
}

// Writing a note: the time was taken when Mark was tapped
function NoteComposer({ tc, session, gig, members, nameOf, defaultDept, offline, onCancel, onSave }) {
  const { notify } = useToast()
  const [form, setForm] = useState({ department: defaultDept, priority: 'note', cue: '', body: '', assignee_id: '' })
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const recogniser = useRef(null)
  const set = patch => setForm(f => ({ ...f, ...patch }))
  const Speech = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null
  const clientId = useMemo(() => crypto.randomUUID(), [])
  const df = session.frame_count === 'df'

  useEffect(() => () => recogniser.current?.stop(), [])

  function dictate() {
    if (listening) { recogniser.current?.stop(); return }
    const r = new Speech()
    r.lang = getLanguage() === 'pt' ? 'pt-PT' : 'en-GB'
    r.interimResults = false
    r.onresult = e => {
      const said = Array.from(e.results).map(x => x[0].transcript).join(' ').trim()
      if (said) setForm(f => ({ ...f, body: f.body ? `${f.body} ${said}` : said }))
    }
    r.onend = () => setListening(false)
    r.onerror = () => setListening(false)
    recogniser.current = r
    setListening(true)
    r.start()
  }

  async function submit(e) {
    e.preventDefault()
    if (!form.body.trim() && !file) return
    setBusy(true)
    let photo_path = null
    if (file && !offline) {
      const blob = await shrink(file)
      photo_path = `${gig.id}/${session.id}/${clientId}.jpg`
      const { error } = await supabase.storage.from('rehearsal-photos').upload(photo_path, blob, { contentType: 'image/jpeg', upsert: false })
      if (error && !isNetworkError(error)) { setBusy(false); return notify(userMessage(error), 'error') }
      if (error) photo_path = null
    }
    if (file && !photo_path && !form.body.trim()) { setBusy(false); return notify(t('rehearsal.photoNeedsConnection'), 'error') }
    await onSave({ ...form, client_id: clientId, tc_ms: Math.round(tc), photo_path, assignee_id: form.assignee_id || null })
    setBusy(false)
  }

  const onGig = members.filter(m => m.user_id)
  return (
    <Modal title={t('rehearsal.noteAt', { tc: msToTc(tc, session.fps, df) })} onClose={onCancel} maxWidth={560}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend style={label}>{t('rehearsal.department')}</legend>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {DEPARTMENTS.map(d => <Chip key={d} on={form.department === d} onClick={() => set({ department: d })}>{t(`rehearsal.dept.${d}`)}</Chip>)}
          </div>
        </fieldset>
        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend style={label}>{t('rehearsal.priorityLabel')}</legend>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {PRIORITIES.map(p => <Chip key={p} on={form.priority === p} onClick={() => set({ priority: p })}>{t(`rehearsal.priority.${p}`)}</Chip>)}
          </div>
        </fieldset>
        <div>
          <label htmlFor="rh-body" style={label}>{t('rehearsal.note')}</label>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
            {QUICK.map(q => (
              <button key={q} type="button" onClick={() => setForm(f => ({ ...f, body: f.body ? `${f.body} ${t(`rehearsal.quick.${q}`)}` : t(`rehearsal.quick.${q}`) }))}
                style={{ ...btn, padding: '5px 10px', fontSize: '12px', background: 'transparent' }}>{t(`rehearsal.quick.${q}`)}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
            <textarea id="rh-body" value={form.body} maxLength={2000} rows={3} autoFocus onChange={e => set({ body: e.target.value })} style={{ ...input, resize: 'vertical', flex: 1 }} />
            {Speech && (
              <button type="button" onClick={dictate} aria-pressed={listening} aria-label={listening ? t('rehearsal.stopDictation') : t('rehearsal.dictate')}
                style={{ ...btn, padding: '10px', background: listening ? tint(colors.danger, 20) : undefined, color: listening ? colors.danger : undefined }}>
                {listening ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 140px' }}>
            <label htmlFor="rh-cue" style={label}>{t('rehearsal.cue')}</label>
            <input id="rh-cue" value={form.cue} maxLength={80} placeholder={t('rehearsal.cuePlaceholder')} onChange={e => set({ cue: e.target.value })} style={input} />
          </div>
          <div style={{ flex: '1 1 180px' }}>
            <label htmlFor="rh-assignee" style={label}>{t('rehearsal.assignee')}</label>
            <select id="rh-assignee" value={form.assignee_id} onChange={e => set({ assignee_id: e.target.value })} style={input}>
              <option value="">{t('rehearsal.nobody')}</option>
              {onGig.map(m => <option key={m.user_id} value={m.user_id}>{nameOf(m.user_id)}{m.function_title ? ` · ${m.function_title}` : ''}</option>)}
            </select>
          </div>
        </div>
        {!offline && (
          <div>
            <label htmlFor="rh-photo" style={{ ...btn, background: 'transparent', cursor: 'pointer' }}><Camera size={14} /> {file ? file.name : t('rehearsal.addPhoto')}</label>
            <input id="rh-photo" type="file" accept="image/*" capture="environment" onChange={e => setFile(e.target.files?.[0] || null)}
              style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} />
          </div>
        )}
        {offline && <p style={{ fontSize: '12px', color: colors.muted, display: 'flex', gap: '6px', alignItems: 'center' }}><CloudOff size={14} /> {t('rehearsal.offlineNote')}</p>}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel} style={{ ...btn, background: 'transparent' }}>{t('common.cancel')}</button>
          <button type="submit" disabled={busy || (!form.body.trim() && !file)} style={btnPrimary}>{busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />} {t('rehearsal.saveNote')}</button>
        </div>
      </form>
    </Modal>
  )
}

// Photos are made smaller on the phone before they're sent (long side 1600 px, JPEG)
async function shrink(file) {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return await new Promise(resolve => canvas.toBlob(b => resolve(b || file), 'image/jpeg', 0.82))
  } catch {
    return file
  }
}

function NoteRow({ note, session, nameOf, canNote, canRemove, onToggle, onRemove, onTask, from }) {
  const df = session.frame_count === 'df'
  const done = note.status === 'done'
  return (
    <li style={{ ...card, padding: '10px 12px', display: 'flex', gap: '10px', alignItems: 'flex-start', borderLeft: `4px solid ${done ? colors.border : PRIORITY_COLOUR[note.priority]}`, background: done ? 'transparent' : card.background }}>
      {canNote && !note.pending ? (
        <input type="checkbox" checked={done} onChange={onToggle} aria-label={t('rehearsal.markDone', { tc: msToTc(note.tc_ms, session.fps, df) })}
          style={{ width: '20px', height: '20px', marginTop: '2px', flexShrink: 0 }} />
      ) : null}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'baseline', fontSize: '12px', color: colors.muted }}>
          <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)', fontSize: '13px' }}>{msToTc(note.tc_ms, session.fps, df)}</strong>
          <span>{t(`rehearsal.dept.${note.department}`)}</span>
          {note.priority !== 'note' && <span style={{ color: PRIORITY_COLOUR[note.priority], fontWeight: 700 }}>{t(`rehearsal.priority.${note.priority}`)}</span>}
          {note.cue && <span>· {note.cue}</span>}
          {from && <span>· {from}</span>}
          {note.pending && <span style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}><CloudOff size={12} /> {t('rehearsal.waiting')}</span>}
        </div>
        {note.body && <p style={{ fontSize: '14px', lineHeight: 1.5, margin: '4px 0 0', textDecoration: done ? 'line-through' : 'none', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{note.body}</p>}
        {note.photo_path && <NotePhoto path={note.photo_path} />}
        <div style={{ fontSize: '12px', color: colors.muted, marginTop: '4px' }}>
          {nameOf(note.author_id)}{note.assignee_id ? ` → ${nameOf(note.assignee_id)}` : ''}
          {done && note.done_by ? ` · ${t('rehearsal.doneBy', { name: nameOf(note.done_by) })}` : ''}
        </div>
      </div>
      {onTask && !note.pending && (
        <button type="button" onClick={onTask} aria-label={t('rehearsal.makeTask')} title={t('rehearsal.makeTask')} style={iconBtn}><ListTodo size={15} /></button>
      )}
      {canRemove && !note.pending && (
        <button type="button" onClick={onRemove} aria-label={t('rehearsal.remove')} style={iconBtn}><Trash2 size={15} /></button>
      )}
    </li>
  )
}

function NotePhoto({ path }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let live = true
    supabase.storage.from('rehearsal-photos').createSignedUrl(path, 3600).then(({ data }) => { if (live) setUrl(data?.signedUrl || null) })
    return () => { live = false }
  }, [path])
  if (!url) return null
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: '6px' }}>
      <img src={url} alt={t('rehearsal.photo')} style={{ maxWidth: '160px', maxHeight: '120px', borderRadius: '8px', objectFit: 'cover' }} />
    </a>
  )
}
