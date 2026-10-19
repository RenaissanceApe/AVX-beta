import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Send, Reply, X, Loader2, Paperclip, Link2, MoreHorizontal, Pencil, Trash2, History, Copy, FileText, Pin, PinOff, Bookmark, BookmarkCheck, Megaphone, CheckCircle2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import {
  linkify, layoutMessages, mergeMessages, autoBody, isAutoBody, parseMentions, mentionQuery, summarizeReactions,
  messageFilePath, messageLink, formatSize, dayRange, REACTIONS, MAX_FILES, MAX_FILE_BYTES,
} from '../../lib/messages'
import { MESSAGES_READ } from '../../lib/useMessages'
import { useI18n, t, fmt as fmtDate } from '../../i18n'
import { Attachments, CardView, CardPicker, ReactionBar, HistoryModal, AckStatusModal, EventCard } from './MessageParts'
import { colors } from '../ui'

const PAGE = 50
const MINE = 'rgba(30,200,120,0.14)'
const AMBER = '#F59E0B'
// System messages shown as a card with answer buttons (availability questions, crew calls)
const EVENTS = new Set(['availability', 'crew_call'])
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Text with links, and @mentions of known names and groups highlighted (any other "@word" too)
function Body({ text, mentionRe }) {
  return linkify(text).map((p, i) => (p.type === 'link'
    ? <a key={i} href={p.value} target="_blank" rel="noopener noreferrer" style={{ color: '#38BDF8', wordBreak: 'break-all' }}>{p.value}</a>
    : p.value.split(mentionRe).map((part, j) => (j % 2
      ? <span key={`${i}-${j}`} style={{ color: colors.accent, fontWeight: 600 }}>{part}</span>
      : <span key={`${i}-${j}`}>{part}</span>))))
}

// What a system message says ("Ana changed the venue to Porto")
function systemText(m, name) {
  const p = m.payload || {}
  const actor = m.author_id ? name(m.author_id) : t('common.someone')
  if (p.event === 'status') return t('chat.sys.status', { actor, status: t(`status.${p.status}`) })
  if (p.event === 'dates') return p.start_date
    ? t('chat.sys.dates', { actor, range: dayRange(p.start_date, p.end_date, fmtDate) }) : t('chat.sys.noDates', { actor })
  if (p.event === 'venue') return p.venue ? t('chat.sys.venue', { actor, venue: p.venue }) : t('chat.sys.noVenue', { actor })
  if (p.event === 'availability_answer') {
    const line = t(`chat.sys.availability.${p.status}`, { actor })
    return p.note ? `${line} · “${p.note}”` : line
  }
  if (p.event === 'crew_call_answer') return t(`chat.sys.crewCall.${p.answer}`, { actor, title: p.title })
  if (p.event === 'schedule') {
    const items = (p.items || []).slice(0, 3).join(', ') + ((p.items || []).length > 3 ? ', …' : '')
    return t('chat.sys.schedule', { actor, count: p.count || 1, items })
  }
  return t('chat.sys.other', { actor })
}

// Whether a message's mentions reach this person (directly or through a group on the gig)
function mentionsMe(m, me) {
  return (m.mentions || []).some(x => (x.user && x.user === me?.user_id)
    || (me && (x.group === 'everyone' || (x.group === 'crew' && me.role === 'crew') || (x.group === 'managers' && me.role === 'pm')
      || (x.group?.startsWith('fn:') && (me.function_title || '').trim().toLowerCase() === x.group.slice(3)))))
}

// One conversation: messages (newest at the bottom), replies, files, cards, mentions, reactions,
// edits and removal, live delivery, composer. Reading it marks it read. canPost false shows it
// read-only (viewers on a gig). focusId opens it at that message (links to a message).
export default function Conversation({ conversationId, canPost = true, height = '60vh', emptyText, focusId }) {
  const { user } = useAuth()
  const { notify } = useToast()
  const { fmt } = useI18n()
  const [messages, setMessages] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [names, setNames] = useState({})
  const [reactions, setReactions] = useState({})
  const [context, setContext] = useState({ kind: null, gigId: null, members: [], canManage: false })
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState(null)
  const [editing, setEditing] = useState(null)
  const [files, setFiles] = useState([])
  const [card, setCard] = useState(null)
  const [picker, setPicker] = useState(false)
  const [history, setHistory] = useState(null)
  const [menuFor, setMenuFor] = useState(null)
  const [highlight, setHighlight] = useState(null)
  const [mention, setMention] = useState(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [sending, setSending] = useState(false)
  const [pinned, setPinned] = useState([])
  const [showPins, setShowPins] = useState(false)
  const [announce, setAnnounce] = useState(false)
  const [myAcks, setMyAcks] = useState(() => new Set())
  const [ackCounts, setAckCounts] = useState({})
  const [saved, setSaved] = useState(() => new Set())
  const [statusFor, setStatusFor] = useState(null)
  const fetchedExtras = useRef(new Set())
  const scroller = useRef(null)
  const textarea = useRef(null)
  const fileInput = useRef(null)
  const atBottom = useRef(true)
  const fetchedReactions = useRef(new Set())

  const markRead = useCallback(() => {
    if (document.visibilityState !== 'visible') return
    supabase.rpc('read_conversation', { p_conv: conversationId }).then(({ error }) => {
      if (!error) window.dispatchEvent(new Event(MESSAGES_READ))
    })
  }, [conversationId])

  const loadPins = useCallback(async () => {
    const { data } = await supabase.from('messages').select('id, author_id, body, pinned_at, created_at, attachments, payload')
      .eq('conversation_id', conversationId).not('pinned_at', 'is', null).is('deleted_at', null).order('pinned_at', { ascending: false }).limit(20)
    setPinned(data || [])
  }, [conversationId])

  async function loadPage(before) {
    let q = supabase.from('messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(PAGE)
    if (before) q = q.lt('created_at', before)
    const { data, error } = await q
    if (error) { logger.error('messages', error, { step: 'load' }); return [] }
    setHasMore((data || []).length === PAGE)
    return (data || []).reverse()
  }

  // Opening at a linked message: some before it and everything after
  async function loadAround(id) {
    const { data: target } = await supabase.from('messages').select('*').eq('id', id).eq('conversation_id', conversationId).maybeSingle()
    if (!target) return loadPage()
    const [{ data: older }, { data: newer }] = await Promise.all([
      supabase.from('messages').select('*').eq('conversation_id', conversationId).lt('created_at', target.created_at).order('created_at', { ascending: false }).limit(25),
      supabase.from('messages').select('*').eq('conversation_id', conversationId).gte('created_at', target.created_at).order('created_at').limit(200),
    ])
    setHasMore((older || []).length === 25)
    return [...(older || []).reverse(), ...(newer || [])]
  }

  useEffect(() => {
    let cancelled = false
    setMessages(null); setReplyTo(null); setEditing(null); setReactions({}); fetchedReactions.current = new Set()
    setMyAcks(new Set()); setAckCounts({}); setSaved(new Set()); fetchedExtras.current = new Set(); setShowPins(false)
    loadPins()
    atBottom.current = !focusId
    ;(focusId ? loadAround(focusId) : loadPage()).then(list => {
      if (cancelled) return
      setMessages(list); markRead()
      if (focusId) setHighlight(focusId)
    })
    const channel = supabase.channel(`conversation-${conversationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, payload => {
        setMessages(list => mergeMessages(list || [], [payload.new]))
        if (payload.new.author_id !== user.id) markRead()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, payload => {
        setMessages(list => (list || []).map(m => (m.id === payload.new.id ? { ...m, ...payload.new } : m)))
        loadPins()
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_acks', filter: `conversation_id=eq.${conversationId}` }, payload => {
        const r = payload.new
        if (r.user_id === user.id) setMyAcks(set => new Set(set).add(r.message_id))
        setAckCounts(all => (all[r.message_id] ? { ...all, [r.message_id]: { ...all[r.message_id], done: all[r.message_id].done + 1 } } : all))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions', filter: `conversation_id=eq.${conversationId}` }, payload => {
        const r = payload.new
        if (r?.message_id) setReactions(all => ({ ...all, [`${r.message_id}|${r.user_id}|${r.emoji}`]: r }))
      })
      .subscribe()
    const onVisible = () => { if (document.visibilityState === 'visible') markRead() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { cancelled = true; supabase.removeChannel(channel); document.removeEventListener('visibilitychange', onVisible) }
  }, [conversationId, focusId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Who reads this conversation (names, roles, functions) and whether you run it (pins,
  // announcements, group mentions on a gig)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: conv } = await supabase.from('conversations').select('kind, gig_id, org_id, department, audience, context_type').eq('id', conversationId).maybeSingle()
      if (cancelled || !conv) return
      if (conv.kind === 'direct') return setContext({ kind: 'direct', gigId: null, members: [], canManage: false })
      let members = []
      let canManage = false
      if (conv.kind === 'org' || conv.kind === 'context') {
        const { data: rows } = await supabase.from('org_members').select('user_id, role').eq('org_id', conv.org_id)
        // A conversation about one thing (an item, a repair…) is for the organisation's admins and members
        const inAudience = r => (conv.kind === 'context' && r.role !== 'viewer') || conv.audience === 'everyone' || (conv.audience === 'staff' && r.role !== 'viewer') || (conv.audience === 'admins' && r.role === 'admin')
        members = (rows || []).filter(inAudience).map(r => ({ user_id: r.user_id, role: r.role, function_title: null }))
        canManage = (rows || []).some(r => r.user_id === user.id && r.role === 'admin')
      } else {
        const [{ data: rows }, { data: gig }] = await Promise.all([
          supabase.from('gig_members').select('user_id, role, function_title').eq('gig_id', conv.gig_id),
          supabase.from('gigs').select('created_by, org_id').eq('id', conv.gig_id).maybeSingle(),
        ])
        const { data: orgRole } = gig?.org_id
          ? await supabase.from('org_members').select('role').eq('org_id', gig.org_id).eq('user_id', user.id).maybeSingle() : { data: null }
        const inDepartment = r => r.role !== 'viewer' && (conv.department === 'managers' ? r.role === 'pm' : (r.function_title || '').trim().toLowerCase() === conv.department)
        members = conv.kind === 'department' ? (rows || []).filter(inDepartment) : (rows || [])
        const mine = (rows || []).find(r => r.user_id === user.id)
        canManage = gig?.created_by === user.id || mine?.role === 'pm' || orgRole?.role === 'admin'
      }
      const ids = members.map(m => m.user_id)
      const { data: people } = ids.length ? await supabase.from('profiles').select('id, full_name').in('id', ids) : { data: [] }
      if (cancelled) return
      const nameMap = Object.fromEntries((people || []).map(p => [p.id, p.full_name || '']))
      setNames(n => ({ ...n, ...nameMap }))
      setContext({ kind: conv.kind, contextType: conv.context_type || null, gigId: conv.gig_id || null, members: members.map(m => ({ ...m, name: nameMap[m.user_id] || '' })), canManage })
    })()
    return () => { cancelled = true }
  }, [conversationId, user.id])

  // Names of the people writing
  useEffect(() => {
    const missing = [...new Set((messages || []).map(m => m.author_id).filter(id => id && !(id in names)))]
    if (!missing.length) return
    supabase.from('profiles').select('id, full_name').in('id', missing).then(({ data }) => {
      setNames(n => ({ ...n, ...Object.fromEntries(missing.map(id => [id, data?.find(p => p.id === id)?.full_name || ''])) }))
    })
  }, [messages]) // eslint-disable-line react-hooks/exhaustive-deps
  const name = id => (id === user.id ? t('chat.you') : names[id] || t('common.someone'))
  // A client or supplier writing through their link has no account, just the name they typed
  const who = m => m.guest_name || name(m.author_id)

  // Reactions for messages as they load
  useEffect(() => {
    const ids = (messages || []).filter(m => m.kind === 'text' && !fetchedReactions.current.has(m.id)).map(m => m.id)
    if (!ids.length) return
    ids.forEach(id => fetchedReactions.current.add(id))
    for (let i = 0; i < ids.length; i += 100) {
      supabase.from('message_reactions').select('message_id, user_id, emoji, active').eq('conversation_id', conversationId).eq('active', true)
        .in('message_id', ids.slice(i, i + 100))
        .then(({ data }) => setReactions(all => ({ ...all, ...Object.fromEntries((data || []).map(r => [`${r.message_id}|${r.user_id}|${r.emoji}`, r])) })))
    }
  }, [messages, conversationId])
  // Saved marks, your confirmations, and (for whoever runs the channel or wrote it) how many confirmed
  useEffect(() => {
    const fresh = (messages || []).filter(m => m.kind === 'text' && !fetchedExtras.current.has(m.id))
    if (!fresh.length) return
    fresh.forEach(m => fetchedExtras.current.add(m.id))
    const ids = fresh.map(m => m.id)
    const announcements = fresh.filter(m => m.needs_ack && !m.deleted_at)
    for (let i = 0; i < ids.length; i += 100) {
      supabase.from('saved_messages').select('message_id').eq('saved', true).in('message_id', ids.slice(i, i + 100))
        .then(({ data }) => { if (data?.length) setSaved(set => { const next = new Set(set); data.forEach(r => next.add(r.message_id)); return next }) })
    }
    if (announcements.length) {
      supabase.from('message_acks').select('message_id').eq('user_id', user.id).in('message_id', announcements.map(m => m.id))
        .then(({ data }) => { if (data?.length) setMyAcks(set => { const next = new Set(set); data.forEach(r => next.add(r.message_id)); return next }) })
      for (const m of announcements) {
        if (m.author_id !== user.id && !context.canManage) continue
        supabase.rpc('announcement_status', { p_id: m.id }).then(({ data }) => {
          if (data) setAckCounts(all => ({ ...all, [m.id]: { done: data.filter(r => r.acked_at).length, total: data.length } }))
        })
      }
    }
  }, [messages, context.canManage, user.id])

  const reactionsByMessage = useMemo(() => {
    const out = {}
    for (const r of Object.values(reactions)) (out[r.message_id] ||= []).push(r)
    return out
  }, [reactions])

  // Stay at the bottom while new messages arrive, unless reading older ones or a linked message
  useEffect(() => {
    const el = scroller.current
    if (el && atBottom.current) el.scrollTop = el.scrollHeight
  }, [messages])
  useEffect(() => {
    if (!highlight || !messages) return
    document.getElementById(`msg-${highlight}`)?.scrollIntoView({ block: 'center' })
    const timer = setTimeout(() => setHighlight(null), 2500)
    return () => clearTimeout(timer)
  }, [highlight, messages])

  // Close the message menu on outside click or Escape
  useEffect(() => {
    if (!menuFor) return
    const close = e => { if (e.type === 'keydown' ? e.key === 'Escape' : !e.target.closest?.('.chat-menu')) setMenuFor(null) }
    document.addEventListener('mousedown', close); document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [menuFor])

  // People and groups that can be mentioned in a gig's channel
  const candidates = useMemo(() => {
    if (!context.kind || context.kind === 'direct') return []
    const people = context.members.filter(m => m.user_id !== user.id && m.name).map(m => ({ label: m.name, mention: { user: m.user_id }, hint: m.function_title || '' }))
    if (context.kind !== 'gig' || !context.canManage) return people
    const functions = new Map()
    for (const m of context.members) {
      const key = (m.function_title || '').trim().toLowerCase()
      if (key && !functions.has(key)) functions.set(key, m.function_title.trim())
    }
    return [
      ...people,
      { label: t('chat.group.everyone'), mention: { group: 'everyone' }, hint: t('chat.group.hint') },
      { label: t('chat.group.crew'), mention: { group: 'crew' }, hint: t('chat.group.hint') },
      { label: t('chat.group.managers'), mention: { group: 'managers' }, hint: t('chat.group.hint') },
      ...[...functions].map(([key, label]) => ({ label, mention: { group: `fn:${key}` }, hint: t('chat.group.hint') })),
    ]
  }, [context, user.id])
  const mentionRe = useMemo(() => {
    const labels = [...new Set([...context.members.map(m => m.name), ...candidates.map(c => c.label)].filter(Boolean))]
      .sort((a, b) => b.length - a.length).map(escapeRe)
    return new RegExp(`(@(?:${[...labels, '[\\p{L}\\d._-]+'].join('|')}))`, 'iu')
  }, [context.members, candidates])
  const suggestions = mention ? candidates.filter(c => c.label.toLowerCase().includes(mention.query.toLowerCase())).slice(0, 6) : []

  function typed(value, cursor) {
    setText(value)
    setMention(candidates.length ? mentionQuery(value, cursor) : null)
    setMentionIndex(0)
  }
  function pickMention(c) {
    const el = textarea.current
    const cursor = el?.selectionStart ?? text.length
    const next = `${text.slice(0, mention.start)}@${c.label} ${text.slice(cursor)}`
    setText(next); setMention(null)
    requestAnimationFrame(() => { const pos = mention.start + c.label.length + 2; el?.focus(); el?.setSelectionRange(pos, pos) })
  }

  function addFiles(list) {
    const incoming = [...list]
    const tooBig = incoming.find(f => f.size > MAX_FILE_BYTES)
    if (tooBig) notify(t('chat.fileTooBig', { name: tooBig.name }), 'error')
    setFiles(fs => [...fs, ...incoming.filter(f => f.size <= MAX_FILE_BYTES)].slice(0, MAX_FILES))
  }

  // Go to a message (from the pinned list): scroll if loaded, otherwise load around it
  async function jumpTo(id) {
    setShowPins(false)
    atBottom.current = false
    if (!messages?.some(m => m.id === id)) setMessages(await loadAround(id))
    setHighlight(id)
  }

  async function earlier() {
    const el = scroller.current
    const before = el?.scrollHeight || 0
    const older = await loadPage(messages[0]?.created_at)
    atBottom.current = false
    setMessages(list => mergeMessages(list || [], older))
    requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - before })
  }

  function resetComposer() {
    setText(''); setReplyTo(null); setEditing(null); setFiles([]); setCard(null); setMention(null); setAnnounce(false)
  }

  async function send(e) {
    e?.preventDefault()
    if (sending) return
    if (editing) {
      const body = text.trim()
      if (!body) return
      setSending(true)
      const { error } = await supabase.rpc('edit_message', { p_id: editing.id, p_body: body.slice(0, 4000) })
      setSending(false)
      if (error) { logger.error('messages', error, { step: 'edit' }); return notify(userMessage(error), 'error') }
      track('messages:edited')
      setMessages(list => list.map(m => (m.id === editing.id ? { ...m, body, edited_at: new Date().toISOString() } : m)))
      return resetComposer()
    }
    const typedBody = text.trim()
    const body = typedBody || autoBody({ files, cardLabel: card ? t(`chat.card.${card.type}`) : '' })
    if (!body) return
    setSending(true)
    const attachments = []
    for (const f of files) {
      const path = messageFilePath(conversationId, f.name, crypto.randomUUID())
      const { error } = await supabase.storage.from('message-files').upload(path, f, { contentType: f.type || undefined })
      if (error) {
        setSending(false)
        logger.error('messages', error, { step: 'upload' })
        return notify(t('chat.uploadFailed', { name: f.name }), 'error')
      }
      attachments.push({ path, name: f.name, type: f.type || '', size: f.size })
    }
    const { data, error } = await supabase.from('messages').insert({
      conversation_id: conversationId, body: body.slice(0, 4000), reply_to: replyTo?.id || null,
      attachments, mentions: parseMentions(typedBody, candidates), payload: card ? { card: { type: card.type, id: card.id } } : null,
      needs_ack: announce,
    }).select().single()
    setSending(false)
    if (error) {
      logger.error('messages', error, { step: 'send' })
      return notify(userMessage(error), 'error')
    }
    track('messages:sent')
    if (attachments.length) track('messages:files')
    if (card) track('messages:card')
    if (announce) track('messages:announcement')
    atBottom.current = true
    setMessages(list => mergeMessages(list || [], [data]))
    resetComposer()
  }

  async function react(m, emoji) {
    setMenuFor(null)
    const key = `${m.id}|${user.id}|${emoji}`
    const was = reactions[key]?.active
    setReactions(all => ({ ...all, [key]: { message_id: m.id, user_id: user.id, emoji, active: !was } }))
    const { data, error } = await supabase.rpc('react', { p_id: m.id, p_emoji: emoji })
    if (error) {
      setReactions(all => ({ ...all, [key]: { message_id: m.id, user_id: user.id, emoji, active: !!was } }))
      return notify(userMessage(error), 'error')
    }
    setReactions(all => ({ ...all, [key]: { message_id: m.id, user_id: user.id, emoji, active: data } }))
  }

  async function remove(m) {
    setMenuFor(null)
    if (!window.confirm(t('chat.confirmRemove'))) return
    const { error } = await supabase.rpc('remove_message', { p_id: m.id })
    if (error) return notify(userMessage(error), 'error')
    track('messages:removed')
    setMessages(list => list.map(x => (x.id === m.id ? { ...x, body: '—', attachments: [], payload: null, mentions: [], deleted_at: new Date().toISOString() } : x)))
  }

  async function pin(m, on) {
    setMenuFor(null)
    const { error } = await supabase.rpc('pin_message', { p_id: m.id, p_on: on })
    if (error) return notify(userMessage(error), 'error')
    track(on ? 'messages:pinned' : 'messages:unpinned')
    setMessages(list => list.map(x => (x.id === m.id ? { ...x, pinned_at: on ? new Date().toISOString() : null } : x)))
    loadPins()
  }

  async function toggleSave(m) {
    setMenuFor(null)
    const { data, error } = await supabase.rpc('toggle_saved', { p_id: m.id })
    if (error) return notify(userMessage(error), 'error')
    setSaved(set => { const next = new Set(set); if (data) next.add(m.id); else next.delete(m.id); return next })
    notify(data ? t('chat.savedNow') : t('chat.unsavedNow'), 'success')
  }

  async function ack(m) {
    const { error } = await supabase.rpc('ack_message', { p_id: m.id })
    if (error) return notify(userMessage(error), 'error')
    track('messages:acked')
    setMyAcks(set => new Set(set).add(m.id))
    window.dispatchEvent(new Event(MESSAGES_READ))
  }

  async function copyLink(m) {
    setMenuFor(null)
    try {
      await navigator.clipboard.writeText(messageLink(window.location.origin, conversationId, m.id))
      notify(t('chat.linkCopied'), 'success')
    } catch {
      notify(messageLink(window.location.origin, conversationId, m.id))
    }
  }

  function startEdit(m) {
    setMenuFor(null); setReplyTo(null); setFiles([]); setCard(null)
    setEditing(m); setText(isAutoBody(m) ? '' : m.body)
    requestAnimationFrame(() => textarea.current?.focus())
  }

  if (!messages) return <div style={{ padding: '24px', display: 'flex', justifyContent: 'center' }}><Loader2 size={20} color={colors.accent} style={{ animation: 'spin 1s linear infinite' }} /></div>
  const byId = Object.fromEntries(messages.map(m => [m.id, m]))
  const answersFor = {}
  for (const m of messages) {
    const key = m.kind === 'system' && (m.payload?.event === 'availability_answer' ? m.payload.request_id : m.payload?.event === 'crew_call_answer' ? m.payload.call_id : null)
    if (key) (answersFor[key] ||= []).push(m)
  }
  const me = context.members.find(m => m.user_id === user.id)
  const smallBtn = { background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', padding: '4px', display: 'flex' }
  const menuItem = { display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '7px 10px', background: 'none', border: 'none', color: '#fff', font: 'inherit', fontSize: '13px', cursor: 'pointer', textAlign: 'left', borderRadius: '6px' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height, minHeight: '320px' }}>
      {pinned.length > 0 && (
        <div style={{ position: 'relative', padding: '6px 2px', borderBottom: `1px solid ${colors.border}` }}>
          <button type="button" onClick={() => setShowPins(v => !v)} aria-expanded={showPins} style={{
            display: 'flex', alignItems: 'center', gap: '6px', width: '100%', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
            borderRadius: '8px', padding: '6px 10px', color: '#fff', font: 'inherit', fontSize: '13px', cursor: 'pointer', textAlign: 'left',
          }}>
            <Pin size={13} color={AMBER} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <strong>{t('chat.pinnedCount', { count: pinned.length })}</strong> · {isAutoBody(pinned[0]) ? pinned[0].body : (pinned[0].body || '').slice(0, 100)}
            </span>
          </button>
          {showPins && (
            <div role="list" style={{ position: 'absolute', zIndex: 25, top: '100%', left: 0, right: 0, background: colors.panel, border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', padding: '4px', boxShadow: '0 12px 28px rgba(0,0,0,0.5)', maxHeight: '50vh', overflowY: 'auto' }}>
              {pinned.map(p => (
                <button key={p.id} role="listitem" type="button" onClick={() => jumpTo(p.id)} style={{ ...menuItem, alignItems: 'flex-start', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '11px', color: colors.muted }}>{name(p.author_id)} · {fmt(p.created_at, 'd MMM HH:mm')}</span>
                  <span style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{(p.body || '').slice(0, 200)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div ref={scroller} onScroll={e => { const el = e.currentTarget; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60 }}
        role="log" aria-live="polite" style={{ flex: 1, overflowY: 'auto', padding: '8px 4px' }}>
        {hasMore && (
          <div style={{ textAlign: 'center', marginBottom: '8px' }}>
            <button onClick={earlier} style={{ background: 'none', border: `1px solid ${colors.border}`, color: colors.soft, borderRadius: '8px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer' }}>{t('chat.earlier')}</button>
          </div>
        )}
        {messages.length === 0 && <p style={{ textAlign: 'center', color: colors.muted, fontSize: '13px', padding: '30px 10px', lineHeight: 1.6 }}>{emptyText || t('chat.empty')}</p>}
        {layoutMessages(messages).map(row => {
          if (row.type === 'day') return (
            <div key={row.key} style={{ textAlign: 'center', fontSize: '11px', color: colors.muted, margin: '12px 0 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{fmt(row.day, 'EEEE, d MMM')}</div>
          )
          const m = row.message
          if (m.kind === 'system' && EVENTS.has(m.payload?.event)) return (
            <EventCard key={row.key} message={m} mine={m.author_id === user.id} actor={name(m.author_id)}
              answers={answersFor[m.payload.request_id || m.payload.call_id] || []} />
          )
          if (m.kind === 'system') return (
            <div key={row.key} style={{ textAlign: 'center', fontSize: '12px', color: colors.soft, margin: '6px 0' }}>{systemText(m, name)} · {fmt(m.created_at, 'HH:mm')}</div>
          )
          const mine = m.author_id === user.id
          const removed = !!m.deleted_at
          const quoted = m.reply_to ? byId[m.reply_to] : null
          const forMe = !mine && mentionsMe(m, me ? me : { user_id: user.id })
          const summary = summarizeReactions(reactionsByMessage[m.id] || [], user.id)
          return (
            <div key={row.key} id={`msg-${m.id}`} className="chat-row" style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', marginTop: row.continues ? '2px' : '10px' }}>
              {!row.continues && !mine && (
                <span style={{ fontSize: '12px', fontWeight: 700, color: colors.soft, margin: '0 0 2px 4px' }}>
                  {who(m)}
                  {m.guest_name && <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: 700, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t(`chat.guest.badge.${context.contextType || 'quote'}`)}</span>}
                </span>
              )}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', flexDirection: mine ? 'row-reverse' : 'row', maxWidth: '88%', position: 'relative' }}>
                <div style={{
                  background: mine ? MINE : 'rgba(255,255,255,0.06)', borderRadius: '12px', padding: '7px 11px', fontSize: '14px', lineHeight: 1.5,
                  whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', minWidth: 0,
                  boxShadow: highlight === m.id ? `0 0 0 2px ${colors.accent}` : forMe ? `inset 3px 0 0 ${AMBER}` : 'none', transition: 'box-shadow .3s',
                }}>
                  {removed ? <span style={{ fontStyle: 'italic', color: colors.muted }}>{t('chat.removed')}</span> : <>
                    {m.needs_ack && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: AMBER, marginBottom: '3px' }}>
                        <Megaphone size={13} /> {t('chat.announcement')}
                      </div>
                    )}
                    {m.reply_to && (
                      <div style={{ borderLeft: `3px solid ${colors.accent}`, padding: '2px 8px', marginBottom: '4px', fontSize: '12px', color: colors.soft, background: 'rgba(0,0,0,0.15)', borderRadius: '4px' }}>
                        {quoted ? <><strong>{who(quoted)}</strong> {quoted.deleted_at ? t('chat.removed') : (quoted.body || '').slice(0, 120)}</> : t('chat.earlierMessage')}
                      </div>
                    )}
                    {m.payload?.card && <CardView card={m.payload.card} />}
                    <Attachments files={m.attachments} />
                    {!isAutoBody(m) && <Body text={m.body} mentionRe={mentionRe} />}
                    {m.needs_ack && (
                      <div style={{ clear: 'both', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '6px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                        {(mine || context.canManage) && (
                          <button type="button" onClick={() => setStatusFor(m)} style={{ background: 'none', border: 'none', color: colors.soft, font: 'inherit', fontSize: '12px', cursor: 'pointer', padding: 0, textDecoration: 'underline dotted' }}>
                            {ackCounts[m.id] ? t('chat.ackCount', { done: ackCounts[m.id].done, total: ackCounts[m.id].total }) : t('chat.ackWho')}
                          </button>
                        )}
                        {!mine && (myAcks.has(m.id)
                          ? <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: colors.accent, fontWeight: 600 }}><CheckCircle2 size={14} /> {t('chat.acked')}</span>
                          : <button type="button" onClick={() => ack(m)} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: colors.accent, color: '#04110a', border: 'none', borderRadius: '8px', padding: '6px 10px', font: 'inherit', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                            <CheckCircle2 size={14} /> {t('chat.ack')}
                          </button>)}
                      </div>
                    )}
                  </>}
                  <span style={{ fontSize: '10px', color: colors.muted, marginLeft: '8px', float: 'right', marginTop: '4px' }}>
                    {m.pinned_at && !removed && <Pin size={10} color={AMBER} aria-label={t('chat.pinned')} style={{ marginRight: '4px', verticalAlign: '-1px' }} />}
                    {saved.has(m.id) && !removed && <Bookmark size={10} color={colors.accent} aria-label={t('chat.savedMark')} style={{ marginRight: '4px', verticalAlign: '-1px' }} />}
                    {m.edited_at && !removed && (
                      <button type="button" onClick={() => setHistory(m)} title={t('chat.history')} style={{ background: 'none', border: 'none', color: colors.muted, font: 'inherit', fontSize: '10px', cursor: 'pointer', padding: 0, marginRight: '4px', textDecoration: 'underline dotted' }}>{t('chat.edited')}</button>
                    )}
                    {fmt(m.created_at, 'HH:mm')}
                  </span>
                </div>
                {!removed && canPost && (
                  <button className="chat-tool" onClick={() => { setEditing(null); setReplyTo(m); textarea.current?.focus() }} aria-label={t('chat.replyTo', { name: who(m) })} title={t('chat.reply')} style={smallBtn}><Reply size={14} /></button>
                )}
                {!removed && (
                  <button className="chat-tool chat-menu" onClick={() => setMenuFor(menuFor === m.id ? null : m.id)} aria-haspopup="menu" aria-expanded={menuFor === m.id}
                    aria-label={t('chat.moreFor', { name: who(m) })} title={t('chat.more')} style={smallBtn}><MoreHorizontal size={14} /></button>
                )}
                {menuFor === m.id && (
                  <div role="menu" className="chat-menu" style={{
                    position: 'absolute', zIndex: 20, bottom: '100%', [mine ? 'right' : 'left']: 0, marginBottom: '4px', minWidth: '210px',
                    background: colors.panel, border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', padding: '6px', boxShadow: '0 12px 28px rgba(0,0,0,0.5)',
                  }}>
                    {canPost && (
                      <div style={{ display: 'flex', gap: '2px', padding: '2px 2px 6px', borderBottom: `1px solid ${colors.border}`, marginBottom: '4px' }}>
                        {REACTIONS.map(emoji => (
                          <button key={emoji} role="menuitem" onClick={() => react(m, emoji)} aria-label={t('chat.reactWith', { emoji })}
                            style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', padding: '3px', borderRadius: '6px' }}>{emoji}</button>
                        ))}
                      </div>
                    )}
                    {canPost && <button role="menuitem" style={menuItem} onClick={() => { setMenuFor(null); setEditing(null); setReplyTo(m); textarea.current?.focus() }}><Reply size={14} /> {t('chat.reply')}</button>}
                    <button role="menuitem" style={menuItem} onClick={() => copyLink(m)}><Copy size={14} /> {t('chat.copyLink')}</button>
                    <button role="menuitem" style={menuItem} onClick={() => toggleSave(m)}>{saved.has(m.id) ? <><BookmarkCheck size={14} /> {t('chat.unsave')}</> : <><Bookmark size={14} /> {t('chat.save')}</>}</button>
                    {(context.canManage || context.kind === 'direct') && canPost && (
                      <button role="menuitem" style={menuItem} onClick={() => pin(m, !m.pinned_at)}>{m.pinned_at ? <><PinOff size={14} /> {t('chat.unpin')}</> : <><Pin size={14} /> {t('chat.pin')}</>}</button>
                    )}
                    {m.edited_at && <button role="menuitem" style={menuItem} onClick={() => { setMenuFor(null); setHistory(m) }}><History size={14} /> {t('chat.history')}</button>}
                    {mine && canPost && <button role="menuitem" style={menuItem} onClick={() => startEdit(m)}><Pencil size={14} /> {t('chat.edit')}</button>}
                    {mine && <button role="menuitem" style={{ ...menuItem, color: colors.danger }} onClick={() => remove(m)}><Trash2 size={14} /> {t('chat.remove')}</button>}
                  </div>
                )}
              </div>
              {!removed && <ReactionBar summary={summary} name={name} onToggle={canPost ? emoji => react(m, emoji) : null} alignEnd={mine} />}
            </div>
          )
        })}
      </div>
      {canPost ? (
        <form onSubmit={send} style={{ borderTop: `1px solid ${colors.border}`, paddingTop: '8px', position: 'relative' }}
          onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!editing && e.dataTransfer.files.length) addFiles(e.dataTransfer.files) }}>
          {announce && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#fff', marginBottom: '6px', padding: '6px 8px', borderLeft: `3px solid ${AMBER}`, background: 'rgba(245,158,11,0.08)', borderRadius: '4px' }}>
              <Megaphone size={13} color={AMBER} /> <span style={{ flex: 1 }}>{t('chat.announceHint')}</span>
              <button type="button" onClick={() => setAnnounce(false)} aria-label={t('chat.announceOff')} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', display: 'flex' }}><X size={14} /></button>
            </div>
          )}
          {(replyTo || editing) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: colors.soft, marginBottom: '6px', padding: '4px 8px', borderLeft: `3px solid ${editing ? AMBER : colors.accent}`, background: 'rgba(255,255,255,0.04)', borderRadius: '4px' }}>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {editing ? <strong>{t('chat.editing')}</strong> : <><strong>{t('chat.replyingTo', { name: name(replyTo.author_id) })}</strong> {replyTo.body}</>}
              </span>
              <button type="button" onClick={() => (editing ? resetComposer() : setReplyTo(null))} aria-label={editing ? t('chat.cancelEdit') : t('chat.cancelReply')} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', display: 'flex' }}><X size={14} /></button>
            </div>
          )}
          {(files.length > 0 || card) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
              {card && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '4px 8px', borderRadius: '8px', background: 'rgba(30,200,120,0.1)', border: '1px solid rgba(30,200,120,0.3)' }}>
                  <Link2 size={12} /> {t(`chat.card.${card.type}`)}: {card.title}
                  <button type="button" onClick={() => setCard(null)} aria-label={t('chat.removeCard')} style={{ ...smallBtn, padding: 0 }}><X size={12} /></button>
                </span>
              )}
              {files.map((f, i) => (
                <span key={`${f.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '4px 8px', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', border: `1px solid ${colors.border}`, maxWidth: '100%' }}>
                  <FileText size={12} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>{f.name}</span> <span style={{ color: colors.muted }}>{formatSize(f.size)}</span>
                  <button type="button" onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))} aria-label={t('chat.removeFile', { name: f.name })} style={{ ...smallBtn, padding: 0 }}><X size={12} /></button>
                </span>
              ))}
            </div>
          )}
          {suggestions.length > 0 && (
            <div role="listbox" aria-label={t('chat.mentionSomeone')} style={{
              position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: '4px', zIndex: 15, background: colors.panel,
              border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', padding: '4px', boxShadow: '0 12px 28px rgba(0,0,0,0.5)',
            }}>
              {suggestions.map((c, i) => (
                <button key={`${c.label}-${i}`} type="button" role="option" aria-selected={i === mentionIndex}
                  onMouseDown={e => { e.preventDefault(); pickMention(c) }} style={{ ...menuItem, background: i === mentionIndex ? 'rgba(30,200,120,0.12)' : 'none' }}>
                  <strong>@{c.label}</strong> <span style={{ color: colors.muted, fontSize: '12px' }}>{c.hint}</span>
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end' }}>
            {!editing && <>
              <input ref={fileInput} type="file" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
              <button type="button" onClick={() => fileInput.current?.click()} disabled={files.length >= MAX_FILES} aria-label={t('chat.attach')} title={t('chat.attach')}
                style={{ ...smallBtn, color: colors.soft, height: '40px', padding: '0 4px' }}><Paperclip size={18} /></button>
              <button type="button" onClick={() => setPicker(true)} aria-label={t('chat.share')} title={t('chat.share')}
                style={{ ...smallBtn, color: colors.soft, height: '40px', padding: '0 4px' }}><Link2 size={18} /></button>
              {context.canManage && context.kind !== 'direct' && (
                <button type="button" onClick={() => setAnnounce(a => !a)} aria-pressed={announce} aria-label={t('chat.announceToggle')} title={t('chat.announceToggle')}
                  style={{ ...smallBtn, color: announce ? AMBER : colors.soft, height: '40px', padding: '0 4px' }}><Megaphone size={18} /></button>
              )}
            </>}
            <textarea ref={textarea} value={text} rows={Math.min(5, Math.max(1, text.split('\n').length))} maxLength={4000}
              placeholder={editing ? t('chat.editPlaceholder') : t('chat.placeholder')} aria-label={t('chat.placeholder')}
              onChange={e => typed(e.target.value, e.target.selectionStart)}
              onPaste={e => { if (!editing && e.clipboardData?.files?.length) { e.preventDefault(); addFiles(e.clipboardData.files) } }}
              onKeyDown={e => {
                if (suggestions.length) {
                  if (e.key === 'ArrowDown') { e.preventDefault(); return setMentionIndex(i => (i + 1) % suggestions.length) }
                  if (e.key === 'ArrowUp') { e.preventDefault(); return setMentionIndex(i => (i - 1 + suggestions.length) % suggestions.length) }
                  if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); return pickMention(suggestions[mentionIndex]) }
                  if (e.key === 'Escape') { e.preventDefault(); return setMention(null) }
                }
                if (e.key === 'Escape' && editing) { e.preventDefault(); return resetComposer() }
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() }
              }}
              style={{ flex: 1, minWidth: 0, resize: 'none', background: 'rgba(0,0,0,0.25)', border: `1px solid ${colors.border}`, borderRadius: '10px', padding: '9px 12px', color: '#fff', font: 'inherit', fontSize: '14px', lineHeight: 1.45 }} />
            <button type="submit" disabled={(!text.trim() && (editing || (!files.length && !card))) || sending} aria-label={editing ? t('chat.saveEdit') : t('chat.send')} title={editing ? t('chat.saveEdit') : t('chat.send')}
              style={{ background: colors.accent, border: 'none', borderRadius: '10px', width: '42px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#04110a', flexShrink: 0 }}>
              {sending ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : editing ? <Pencil size={16} /> : <Send size={16} />}
            </button>
          </div>
        </form>
      ) : <p style={{ fontSize: '12px', color: colors.muted, textAlign: 'center', padding: '8px', borderTop: `1px solid ${colors.border}` }}>{t('chat.readOnly')}</p>}
      {picker && <CardPicker gigId={context.gigId} onClose={() => setPicker(false)} onPick={(c, title) => { setCard({ ...c, title }); setPicker(false); textarea.current?.focus() }} />}
      {history && <HistoryModal message={history} onClose={() => setHistory(null)} />}
      {statusFor && <AckStatusModal message={statusFor} onClose={() => setStatusFor(null)} />}
      <style>{'.chat-tool { opacity: 0.35 } .chat-row:hover .chat-tool, .chat-tool:focus-visible, .chat-tool[aria-expanded="true"] { opacity: 1 }'}</style>
    </div>
  )
}
