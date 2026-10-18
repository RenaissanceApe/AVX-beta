import { useCallback, useEffect, useRef, useState } from 'react'
import { Send, Reply, X, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { linkify, layoutMessages, mergeMessages } from '../../lib/messages'
import { MESSAGES_READ } from '../../lib/useMessages'
import { rangeText } from '../../lib/clashes'
import { useI18n, t } from '../../i18n'
import { colors } from '../ui'

const PAGE = 50
const MINE = 'rgba(30,200,120,0.14)'

function Body({ text }) {
  return linkify(text).map((p, i) => (p.type === 'link'
    ? <a key={i} href={p.value} target="_blank" rel="noopener noreferrer" style={{ color: '#38BDF8', wordBreak: 'break-all' }}>{p.value}</a>
    : <span key={i}>{p.value}</span>))
}

// What a system message says ("Ana changed the venue to Porto")
function systemText(m, name) {
  const p = m.payload || {}
  const actor = m.author_id ? name(m.author_id) : t('common.someone')
  if (p.event === 'status') return t('chat.sys.status', { actor, status: t(`status.${p.status}`) })
  if (p.event === 'dates') return p.start_date
    ? t('chat.sys.dates', { actor, range: rangeText(p.start_date, p.end_date || p.start_date) }) : t('chat.sys.noDates', { actor })
  if (p.event === 'venue') return p.venue ? t('chat.sys.venue', { actor, venue: p.venue }) : t('chat.sys.noVenue', { actor })
  return t('chat.sys.other', { actor })
}

// One conversation: messages (newest at the bottom), replies, live delivery, composer.
// Reading it marks it read. canPost false shows it read-only (viewers on a gig).
export default function Conversation({ conversationId, canPost = true, height = '60vh', emptyText }) {
  const { user } = useAuth()
  const { notify } = useToast()
  const { fmt } = useI18n()
  const [messages, setMessages] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [names, setNames] = useState({})
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState(null)
  const [sending, setSending] = useState(false)
  const scroller = useRef(null)
  const atBottom = useRef(true)

  const markRead = useCallback(() => {
    if (document.visibilityState !== 'visible') return
    supabase.rpc('read_conversation', { p_conv: conversationId }).then(({ error }) => {
      if (!error) window.dispatchEvent(new Event(MESSAGES_READ))
    })
  }, [conversationId])

  async function loadPage(before) {
    let q = supabase.from('messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(PAGE)
    if (before) q = q.lt('created_at', before)
    const { data, error } = await q
    if (error) { logger.error('messages', error, { step: 'load' }); return [] }
    setHasMore((data || []).length === PAGE)
    return (data || []).reverse()
  }

  useEffect(() => {
    let cancelled = false
    setMessages(null); setReplyTo(null)
    loadPage().then(list => { if (!cancelled) { setMessages(list); markRead() } })
    const channel = supabase.channel(`conversation-${conversationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, payload => {
        setMessages(list => mergeMessages(list || [], [payload.new]))
        if (payload.new.author_id !== user.id) markRead()
      })
      .subscribe()
    const onVisible = () => { if (document.visibilityState === 'visible') markRead() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { cancelled = true; supabase.removeChannel(channel); document.removeEventListener('visibilitychange', onVisible) }
  }, [conversationId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Names of the people writing
  useEffect(() => {
    const missing = [...new Set((messages || []).map(m => m.author_id).filter(id => id && !(id in names)))]
    if (!missing.length) return
    supabase.from('profiles').select('id, full_name').in('id', missing).then(({ data }) => {
      setNames(n => ({ ...n, ...Object.fromEntries(missing.map(id => [id, data?.find(p => p.id === id)?.full_name || ''])) }))
    })
  }, [messages]) // eslint-disable-line react-hooks/exhaustive-deps
  const name = id => (id === user.id ? t('chat.you') : names[id] || t('common.someone'))

  // Stay at the bottom while new messages arrive, unless reading older ones
  useEffect(() => {
    const el = scroller.current
    if (el && atBottom.current) el.scrollTop = el.scrollHeight
  }, [messages])

  async function earlier() {
    const el = scroller.current
    const before = el?.scrollHeight || 0
    const older = await loadPage(messages[0]?.created_at)
    atBottom.current = false
    setMessages(list => mergeMessages(list || [], older))
    requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - before })
  }

  async function send(e) {
    e?.preventDefault()
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    const { data, error } = await supabase.from('messages')
      .insert({ conversation_id: conversationId, body: body.slice(0, 4000), reply_to: replyTo?.id || null }).select().single()
    setSending(false)
    if (error) {
      logger.error('messages', error, { step: 'send' })
      return notify(userMessage(error), 'error')
    }
    track('messages:sent')
    atBottom.current = true
    setMessages(list => mergeMessages(list || [], [data]))
    setText(''); setReplyTo(null)
  }

  if (!messages) return <div style={{ padding: '24px', display: 'flex', justifyContent: 'center' }}><Loader2 size={20} color={colors.accent} style={{ animation: 'spin 1s linear infinite' }} /></div>
  const byId = Object.fromEntries(messages.map(m => [m.id, m]))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height, minHeight: '320px' }}>
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
          if (m.kind === 'system') return (
            <div key={row.key} style={{ textAlign: 'center', fontSize: '12px', color: colors.soft, margin: '6px 0' }}>{systemText(m, name)} · {fmt(m.created_at, 'HH:mm')}</div>
          )
          const mine = m.author_id === user.id
          const quoted = m.reply_to ? byId[m.reply_to] : null
          return (
            <div key={row.key} className="chat-row" style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', marginTop: row.continues ? '2px' : '10px' }}>
              {!row.continues && !mine && <span style={{ fontSize: '12px', fontWeight: 700, color: colors.soft, margin: '0 0 2px 4px' }}>{name(m.author_id)}</span>}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', flexDirection: mine ? 'row-reverse' : 'row', maxWidth: '88%' }}>
                <div style={{ background: mine ? MINE : 'rgba(255,255,255,0.06)', borderRadius: '12px', padding: '7px 11px', fontSize: '14px', lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', minWidth: 0 }}>
                  {m.reply_to && (
                    <div style={{ borderLeft: `3px solid ${colors.accent}`, padding: '2px 8px', marginBottom: '4px', fontSize: '12px', color: colors.soft, background: 'rgba(0,0,0,0.15)', borderRadius: '4px' }}>
                      {quoted ? <><strong>{name(quoted.author_id)}</strong> {(quoted.body || '').slice(0, 120)}</> : t('chat.earlierMessage')}
                    </div>
                  )}
                  <Body text={m.body} />
                  <span style={{ fontSize: '10px', color: colors.muted, marginLeft: '8px', float: 'right', marginTop: '4px' }}>{fmt(m.created_at, 'HH:mm')}</span>
                </div>
                {canPost && (
                  <button className="chat-reply" onClick={() => setReplyTo(m)} aria-label={t('chat.replyTo', { name: name(m.author_id) })} title={t('chat.reply')}
                    style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', padding: '4px', display: 'flex' }}><Reply size={14} /></button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {canPost ? (
        <form onSubmit={send} style={{ borderTop: `1px solid ${colors.border}`, paddingTop: '8px' }}>
          {replyTo && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: colors.soft, marginBottom: '6px', padding: '4px 8px', borderLeft: `3px solid ${colors.accent}`, background: 'rgba(255,255,255,0.04)', borderRadius: '4px' }}>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><strong>{t('chat.replyingTo', { name: name(replyTo.author_id) })}</strong> {replyTo.body}</span>
              <button type="button" onClick={() => setReplyTo(null)} aria-label={t('chat.cancelReply')} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', display: 'flex' }}><X size={14} /></button>
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={Math.min(5, Math.max(1, text.split('\n').length))} maxLength={4000}
              placeholder={t('chat.placeholder')} aria-label={t('chat.placeholder')}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() } }}
              style={{ flex: 1, resize: 'none', background: 'rgba(0,0,0,0.25)', border: `1px solid ${colors.border}`, borderRadius: '10px', padding: '9px 12px', color: '#fff', font: 'inherit', fontSize: '14px', lineHeight: 1.45 }} />
            <button type="submit" disabled={!text.trim() || sending} aria-label={t('chat.send')} title={t('chat.send')}
              style={{ background: colors.accent, border: 'none', borderRadius: '10px', width: '42px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#04110a', flexShrink: 0 }}>
              {sending ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} />}
            </button>
          </div>
        </form>
      ) : <p style={{ fontSize: '12px', color: colors.muted, textAlign: 'center', padding: '8px', borderTop: `1px solid ${colors.border}` }}>{t('chat.readOnly')}</p>}
      <style>{'.chat-reply { opacity: 0.35 } .chat-row:hover .chat-reply, .chat-reply:focus { opacity: 1 }'}</style>
    </div>
  )
}
