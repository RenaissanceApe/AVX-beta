import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Bell, BellOff, Loader2, MessageCircle, Hash } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { useConversations } from '../lib/useMessages'
import { useI18n, t } from '../i18n'
import AppShell from '../components/shell/AppShell'
import Conversation from '../components/messages/Conversation'
import { iconBtn, card, colors } from '../components/ui'

const spinner = <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><Loader2 size={22} color={colors.accent} style={{ animation: 'spin 1s linear infinite' }} /></div>

function useNarrow() {
  const query = '(max-width: 760px)'
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setNarrow(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return narrow
}

const titleOf = c => (c.kind === 'gig' ? c.gig_name : c.other_name) || t('common.someone')

// Messages (MESSAGING.md, M1): your direct conversations and gig channels, newest first, and
// the one open. /messages, /messages/:id, and /messages?to=<user> to start (or reopen) a direct
// conversation. Side by side on wide screens, one at a time on phones.
export default function MessagesPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { notify } = useToast()
  const narrow = useNarrow()
  const { conversations, reload } = useConversations()
  const to = params.get('to')

  useEffect(() => {
    if (!to) return
    supabase.rpc('start_direct', { p_user: to }).then(({ data, error }) => {
      if (error) {
        logger.warn('messages', 'Start conversation failed', { code: error.code })
        notify(error.code === '42501' ? t('chat.cantMessage') : userMessage(error), 'error')
        return navigate('/messages', { replace: true })
      }
      navigate(`/messages/${data}`, { replace: true })
    })
  }, [to]) // eslint-disable-line react-hooks/exhaustive-deps

  const list = (
    <ConversationList conversations={conversations} openId={id} />
  )
  const open = id ? <OpenConversation key={id} id={id} summary={conversations?.find(c => c.id === id)} onMuted={reload} back={narrow} /> : null

  return (
    <AppShell>
      <div style={{ maxWidth: '1080px', margin: '0 auto', padding: '24px 16px 40px' }}>
        {(!narrow || !id) && <h1 style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.4px', marginBottom: '16px' }}>{t('chat.title')}</h1>}
        {to ? spinner : narrow ? (id ? open : list) : (
          <div style={{ display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr)', gap: '16px', alignItems: 'start' }}>
            {list}
            {open || (
              <div style={{ ...card, padding: '48px 20px', textAlign: 'center', color: colors.muted, fontSize: '14px' }}>
                <MessageCircle size={26} style={{ marginBottom: '8px' }} /><div>{t('chat.pick')}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  )
}

function ConversationList({ conversations, openId }) {
  const { user } = useAuth()
  const { fmt } = useI18n()
  const today = new Date().toDateString()
  const when = d => (new Date(d).toDateString() === today ? fmt(d, 'HH:mm') : fmt(d, 'd MMM'))
  if (!conversations) return spinner
  if (!conversations.length) return (
    <div style={{ ...card, padding: '32px 20px', textAlign: 'center', color: colors.muted, fontSize: '14px', lineHeight: 1.6 }}>{t('chat.none')}</div>
  )
  return (
    <nav aria-label={t('chat.title')} style={{ ...card, padding: '6px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
      {conversations.map(c => {
        const Icon = c.kind === 'gig' ? Hash : MessageCircle
        const preview = c.last_kind === 'system' ? t('chat.update')
          : `${c.last_author === user.id ? `${t('chat.you')}: ` : ''}${c.last_body || ''}`
        return (
          <Link key={c.id} to={`/messages/${c.id}`} aria-current={c.id === openId ? 'page' : undefined} style={{
            display: 'flex', gap: '10px', alignItems: 'center', padding: '10px', borderRadius: '10px', textDecoration: 'none', color: '#fff',
            background: c.id === openId ? 'rgba(30,200,120,0.1)' : 'transparent',
          }}>
            <Icon size={16} color={c.unread ? colors.accent : colors.muted} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: '14px', fontWeight: c.unread ? 800 : 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titleOf(c)}</span>
                <span style={{ fontSize: '11px', color: colors.muted, whiteSpace: 'nowrap' }}>{when(c.last_message_at)}</span>
              </span>
              <span style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: '12px', color: c.unread ? colors.soft : colors.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview}</span>
                {c.muted && <BellOff size={12} color={colors.muted} aria-label={t('chat.muted')} />}
                {c.unread > 0 && <span style={{ minWidth: '18px', height: '18px', padding: '0 5px', borderRadius: '9px', background: colors.accent, color: '#04110a', fontSize: '11px', fontWeight: 800, lineHeight: '18px', textAlign: 'center' }}>{c.unread > 98 ? '99+' : c.unread}</span>}
              </span>
            </span>
          </Link>
        )
      })}
    </nav>
  )
}

// The open conversation with its header. A conversation that has no messages yet isn't in the
// list, so its title is looked up here.
function OpenConversation({ id, summary, onMuted, back }) {
  const { user } = useAuth()
  const { notify } = useToast()
  const [info, setInfo] = useState(null)
  const [muted, setMuted] = useState(summary?.muted || false)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: conv } = await supabase.from('conversations').select('id, kind, gig_id, gigs(name)').eq('id', id).maybeSingle()
      if (cancelled) return
      if (!conv) return setMissing(true)
      let title = conv.gigs?.name
      let canPost = true
      if (conv.kind === 'gig') {
        const { data: me } = await supabase.from('gig_members').select('role').eq('gig_id', conv.gig_id).eq('user_id', user.id).maybeSingle()
        canPost = me ? me.role !== 'viewer' : true // the database decides for company people
      }
      if (conv.kind === 'direct') {
        const { data: members } = await supabase.from('conversation_members').select('user_id').eq('conversation_id', id)
        const other = members?.find(m => m.user_id !== user.id)?.user_id
        const { data: p } = other ? await supabase.from('profiles').select('full_name').eq('id', other).maybeSingle() : { data: null }
        title = p?.full_name
      }
      const { data: state } = await supabase.from('conversation_state').select('muted').eq('conversation_id', id).eq('user_id', user.id).maybeSingle()
      if (cancelled) return
      setInfo({ ...conv, canPost, title: title || t('common.someone') })
      setMuted(!!state?.muted)
    })()
    return () => { cancelled = true }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleMute() {
    const next = !muted
    setMuted(next)
    const { error } = await supabase.rpc('read_conversation', { p_conv: id, p_muted: next })
    if (error) { setMuted(!next); return notify(userMessage(error), 'error') }
    notify(next ? t('chat.mutedNow') : t('chat.unmutedNow'))
    onMuted()
  }

  if (missing) return <div style={{ ...card, padding: '32px 20px', textAlign: 'center', color: colors.muted, fontSize: '14px' }}>{t('chat.notFound')}</div>
  if (!info) return spinner
  const Icon = info.kind === 'gig' ? Hash : MessageCircle
  return (
    <section aria-label={info.title} style={{ ...card, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '8px', borderBottom: `1px solid ${colors.border}` }}>
        {back && <Link to="/messages" aria-label={t('chat.back')} title={t('chat.back')} style={{ ...iconBtn, color: colors.soft }}><ArrowLeft size={16} /></Link>}
        <Icon size={16} color={colors.accent} />
        <strong style={{ flex: 1, minWidth: 0, fontSize: '15px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info.title}</strong>
        {info.kind === 'gig' && <Link to={`/gig/${info.gig_id}?tab=chat`} style={{ fontSize: '12px', color: colors.accent, whiteSpace: 'nowrap' }}>{t('chat.openGig')}</Link>}
        <button onClick={toggleMute} aria-pressed={muted} aria-label={muted ? t('chat.unmute') : t('chat.mute')} title={muted ? t('chat.unmute') : t('chat.mute')}
          style={{ ...iconBtn, color: muted ? colors.muted : colors.soft }}>{muted ? <BellOff size={16} /> : <Bell size={16} />}</button>
      </div>
      <Conversation conversationId={id} canPost={info.canPost} height={back ? 'calc(100dvh - 210px)' : '65vh'}
        emptyText={info.kind === 'direct' ? t('chat.emptyDirect', { name: info.title }) : undefined} />
    </section>
  )
}
