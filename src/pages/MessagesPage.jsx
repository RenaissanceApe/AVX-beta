import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Bell, BellOff, Loader2, MessageCircle, Hash, Users, Megaphone, Search, Bookmark, Plus, Settings, Archive, Package, Eye } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { useWorkspace } from '../lib/WorkspaceContext'
import { logger, userMessage } from '../lib/logger'
import { track } from '../lib/usage'
import { useConversations } from '../lib/useMessages'
import { conversationTitle, conversationContext, contextLink } from '../lib/messages'
import { useI18n, t } from '../i18n'
import AppShell from '../components/shell/AppShell'
import Conversation from '../components/messages/Conversation'
import { Modal, btn, btnPrimary, iconBtn, input, label, card, colors } from '../components/ui'
import { PageHelp } from '../components/help/HelpParts'

const spinner = <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><Loader2 size={22} color={colors.accent} style={{ animation: 'spin 1s linear infinite' }} /></div>
const KIND_ICONS = { direct: MessageCircle, gig: Hash, department: Users, org: Megaphone, context: Package }

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

// Messages (MESSAGING.md, M1–M3): your direct conversations, gig and department channels and
// organisation channels, newest first, and the one open. /messages, /messages/:id (?m= opens at
// a message), /messages?to=<user> to start a direct conversation. Search and saved messages sit
// above the list; organisation admins create channels here. One pane at a time on phones.
export default function MessagesPage() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { notify } = useToast()
  const { orgs } = useWorkspace()
  const narrow = useNarrow()
  const { conversations, reload } = useConversations()
  const [creating, setCreating] = useState(false)
  const to = params.get('to')
  const focusId = params.get('m')
  const view = params.get('view') // 'saved' | 'search'
  const adminOrgs = (orgs || []).filter(o => o.myRole === 'admin')

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

  const setView = v => { const next = new URLSearchParams(params); if (v) next.set('view', v); else next.delete('view'); setParams(next, { replace: true }) }
  const side = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', gap: '6px' }}>
        <button onClick={() => setView(view === 'search' ? null : 'search')} aria-pressed={view === 'search'} style={{ ...btn, flex: 1, justifyContent: 'center', borderColor: view === 'search' ? colors.accent : undefined }}><Search size={14} /> {t('chat.search')}</button>
        <button onClick={() => setView(view === 'saved' ? null : 'saved')} aria-pressed={view === 'saved'} style={{ ...btn, flex: 1, justifyContent: 'center', borderColor: view === 'saved' ? colors.accent : undefined }}><Bookmark size={14} /> {t('chat.saved')}</button>
        {adminOrgs.length > 0 && <button onClick={() => setCreating(true)} aria-label={t('chat.newChannel')} title={t('chat.newChannel')} style={{ ...btn, padding: '8px 10px' }}><Plus size={15} /></button>}
      </div>
      {view === 'search' ? <SearchPanel conversations={conversations} />
        : view === 'saved' ? <SavedPanel conversations={conversations} />
          : <ConversationList conversations={conversations} openId={id} />}
    </div>
  )
  const summary = conversations?.find(c => c.id === id)
  const open = id ? <OpenConversation key={id} id={id} focusId={focusId} summary={summary} onChanged={reload} back={narrow} /> : null

  return (
    <AppShell>
      <div style={{ maxWidth: '1080px', margin: '0 auto', padding: '24px 16px 40px' }}>
        {(!narrow || !id) && <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}><h1 style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.4px' }}>{t('chat.title')}</h1><PageHelp page="messages" /></div>}
        {to ? spinner : narrow ? (id ? open : side) : (
          <div style={{ display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr)', gap: '16px', alignItems: 'start' }}>
            {side}
            {open || (
              <div style={{ ...card, padding: '48px 20px', textAlign: 'center', color: colors.muted, fontSize: '14px' }}>
                <MessageCircle size={26} style={{ marginBottom: '8px' }} /><div>{t('chat.pick')}</div>
              </div>
            )}
          </div>
        )}
      </div>
      {creating && <ChannelModal orgs={adminOrgs} onClose={() => setCreating(false)} onSaved={cid => { setCreating(false); reload(); navigate(`/messages/${cid}`) }} />}
    </AppShell>
  )
}

function ConversationList({ conversations, openId }) {
  const { user } = useAuth()
  const { fmt } = useI18n()
  const today = new Date().toDateString()
  const when = d => (!d ? '' : new Date(d).toDateString() === today ? fmt(d, 'HH:mm') : fmt(d, 'd MMM'))
  if (!conversations) return spinner
  if (!conversations.length) return (
    <div style={{ ...card, padding: '32px 20px', textAlign: 'center', color: colors.muted, fontSize: '14px', lineHeight: 1.6 }}>{t('chat.none')}</div>
  )
  return (
    <nav aria-label={t('chat.title')} style={{ ...card, padding: '6px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
      {conversations.map(c => {
        const Icon = KIND_ICONS[c.kind] || MessageCircle
        const context = conversationContext(c)
        const preview = !c.last_message_at ? t('chat.noMessagesYet') : c.last_kind === 'system' ? t('chat.update')
          : `${c.last_author === user.id ? `${t('chat.you')}: ` : ''}${c.last_body || ''}`
        return (
          <Link key={c.id} to={`/messages/${c.id}`} aria-current={c.id === openId ? 'page' : undefined} style={{
            display: 'flex', gap: '10px', alignItems: 'center', padding: '10px', borderRadius: '10px', textDecoration: 'none', color: '#fff',
            background: c.id === openId ? 'rgba(30,200,120,0.1)' : 'transparent', opacity: c.archived ? 0.55 : 1,
          }}>
            <Icon size={16} color={c.unread ? colors.accent : colors.muted} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: '14px', fontWeight: c.unread ? 800 : 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {conversationTitle(c, t)}{context && <span style={{ fontWeight: 400, color: colors.muted, fontSize: '12px' }}> · {context}</span>}
                </span>
                <span style={{ fontSize: '11px', color: colors.muted, whiteSpace: 'nowrap' }}>{c.archived ? t('chat.archived') : when(c.last_message_at)}</span>
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

// Results link to the message inside its conversation
function ResultRow({ m, conversations, names }) {
  const { fmt } = useI18n()
  const c = conversations?.find(x => x.id === m.conversation_id)
  return (
    <Link to={`/messages/${m.conversation_id}?m=${m.id}`} style={{ display: 'block', padding: '9px 10px', borderRadius: '10px', textDecoration: 'none', color: '#fff' }}>
      <span style={{ display: 'flex', gap: '8px', fontSize: '12px', color: colors.muted }}>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, color: colors.soft }}>{c ? conversationTitle(c, t) : '…'}</span>
        <span>{fmt(m.created_at, 'd MMM')}</span>
      </span>
      <span style={{ display: 'block', fontSize: '13px', lineHeight: 1.45, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {names[m.author_id] && <strong>{names[m.author_id]}: </strong>}{(m.body || '').slice(0, 160)}
      </span>
    </Link>
  )
}

function useNames(rows) {
  const [names, setNames] = useState({})
  useEffect(() => {
    const ids = [...new Set((rows || []).map(r => r.author_id).filter(Boolean))].filter(id => !(id in names))
    if (!ids.length) return
    supabase.from('profiles').select('id, full_name').in('id', ids).then(({ data }) => setNames(n => ({ ...n, ...Object.fromEntries((data || []).map(p => [p.id, p.full_name || ''])) })))
  }, [rows]) // eslint-disable-line react-hooks/exhaustive-deps
  return names
}

function SearchPanel({ conversations }) {
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState(null)
  const names = useNames(rows)
  useEffect(() => {
    if (query.trim().length < 2) { setRows(null); return }
    let on = true
    const timer = setTimeout(() => {
      supabase.rpc('search_messages', { p_query: query.trim() }).then(({ data, error }) => {
        if (!on) return
        if (error) logger.warn('messages', 'Search failed', { code: error.code })
        setRows(data || [])
        track('messages:search')
      })
    }, 300)
    return () => { on = false; clearTimeout(timer) }
  }, [query])
  return (
    <div style={{ ...card, padding: '8px' }}>
      <input value={query} onChange={e => setQuery(e.target.value)} autoFocus placeholder={t('chat.searchPlaceholder')} aria-label={t('chat.search')} style={{ ...input, marginBottom: '6px' }} />
      {rows === null ? <p style={{ fontSize: '12px', color: colors.muted, padding: '6px 4px' }}>{t('chat.searchHint')}</p>
        : rows.length === 0 ? <p style={{ fontSize: '13px', color: colors.muted, padding: '6px 4px' }}>{t('chat.searchNone')}</p>
          : rows.map(m => <ResultRow key={m.id} m={m} conversations={conversations} names={names} />)}
    </div>
  )
}

function SavedPanel({ conversations }) {
  const [rows, setRows] = useState(null)
  const names = useNames(rows)
  useEffect(() => {
    supabase.from('saved_messages').select('message_id, conversation_id, saved_at, messages(id, conversation_id, author_id, body, created_at, deleted_at)')
      .eq('saved', true).order('saved_at', { ascending: false }).limit(100)
      .then(({ data, error }) => {
        if (error) logger.warn('messages', 'Saved failed', { code: error.code })
        setRows((data || []).map(r => r.messages).filter(m => m && !m.deleted_at))
      })
  }, [])
  return (
    <div style={{ ...card, padding: '8px' }}>
      {!rows ? spinner : rows.length === 0 ? <p style={{ fontSize: '13px', color: colors.muted, padding: '10px 4px', lineHeight: 1.5 }}>{t('chat.savedNone')}</p>
        : rows.map(m => <ResultRow key={m.id} m={m} conversations={conversations} names={names} />)}
    </div>
  )
}

// Create or change an organisation channel (admins)
function ChannelModal({ orgs, channel, onClose, onSaved }) {
  const { notify } = useToast()
  const [orgId, setOrgId] = useState(channel?.org_id || orgs?.[0]?.id || '')
  const [title, setTitle] = useState(channel?.title || '')
  const [audience, setAudience] = useState(channel?.audience || 'everyone')
  const [adminsPost, setAdminsPost] = useState(!!channel?.admins_post)
  const [busy, setBusy] = useState(false)
  async function save(archived = null) {
    if (!title.trim()) return
    setBusy(true)
    const { data, error } = await supabase.rpc('save_org_channel', {
      p_id: channel?.id || null, p_org: channel ? null : orgId, p_title: title.trim().slice(0, 80),
      p_audience: audience, p_admins_post: adminsPost, p_archived: archived,
    })
    setBusy(false)
    if (error) { logger.error('messages', error, { step: 'channel' }); return notify(userMessage(error), 'error') }
    track(channel ? 'messages:channel-edited' : 'messages:channel-created')
    notify(archived === true ? t('chat.channelArchived') : archived === false ? t('chat.channelRestored') : t('chat.channelSaved'), 'success')
    onSaved(data || channel.id)
  }
  return (
    <Modal title={channel ? t('chat.channelSettings') : t('chat.newChannel')} onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); save() }} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {!channel && orgs.length > 1 && (
          <label style={label}>{t('chat.channelOrg')}
            <select value={orgId} onChange={e => setOrgId(e.target.value)} style={{ ...input, marginTop: '4px' }}>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
        )}
        <label style={label}>{t('chat.channelName')}
          <input value={title} onChange={e => setTitle(e.target.value)} maxLength={80} required placeholder={t('chat.channelNameHint')} style={{ ...input, marginTop: '4px' }} />
        </label>
        <fieldset style={{ border: 'none', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <legend style={{ ...label, marginBottom: '4px' }}>{t('chat.channelAudience')}</legend>
          {['everyone', 'staff', 'admins'].map(a => (
            <label key={a} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '14px', cursor: 'pointer' }}>
              <input type="radio" name="audience" checked={audience === a} onChange={() => setAudience(a)} style={{ marginTop: '3px' }} />
              <span><strong>{t(`chat.audience.${a}`)}</strong><span style={{ display: 'block', fontSize: '12px', color: colors.muted }}>{t(`chat.audienceHint.${a}`)}</span></span>
            </label>
          ))}
        </fieldset>
        <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '14px', cursor: 'pointer' }}>
          <input type="checkbox" checked={adminsPost} onChange={e => setAdminsPost(e.target.checked)} style={{ marginTop: '3px' }} />
          <span><strong>{t('chat.adminsPost')}</strong><span style={{ display: 'block', fontSize: '12px', color: colors.muted }}>{t('chat.adminsPostHint')}</span></span>
        </label>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          {channel ? (
            <button type="button" disabled={busy} onClick={() => save(!channel.archived_at)} style={{ ...btn }}>
              <Archive size={14} /> {channel.archived_at ? t('chat.restoreChannel') : t('chat.archiveChannel')}
            </button>
          ) : <span />}
          <button type="submit" disabled={busy || !title.trim()} style={btnPrimary}>{busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : null}{channel ? t('common.save') : t('chat.createChannel')}</button>
        </div>
      </form>
    </Modal>
  )
}

// The open conversation with its header. A conversation that has no messages yet isn't in the
// list, so its details are looked up here.
function OpenConversation({ id, focusId, summary, onChanged, back }) {
  const { user } = useAuth()
  const { notify } = useToast()
  const { roleIn } = useWorkspace()
  const [info, setInfo] = useState(null)
  const [muted, setMuted] = useState(summary?.muted || false)
  const [missing, setMissing] = useState(false)
  const [editing, setEditing] = useState(false)

  async function load() {
    const { data: conv } = await supabase.from('conversations')
      .select('id, kind, gig_id, org_id, title, department, audience, admins_post, archived_at, context_type, context_id, gigs(name), organisations(name)').eq('id', id).maybeSingle()
    if (!conv) return setMissing(true)
    let title = conversationTitle({ ...conv, gig_name: conv.gigs?.name, org_name: conv.organisations?.name }, t)
    let canPost = !conv.archived_at
    if (conv.kind === 'gig') {
      const { data: me } = await supabase.from('gig_members').select('role').eq('gig_id', conv.gig_id).eq('user_id', user.id).maybeSingle()
      canPost = me ? me.role !== 'viewer' : true // the database decides for company people
    }
    if (conv.kind === 'org') {
      const role = roleIn(conv.org_id)
      canPost = !conv.archived_at && (role === 'admin' || (!conv.admins_post && role && role !== 'viewer'))
    }
    if (conv.kind === 'context') canPost = ['admin', 'member'].includes(roleIn(conv.org_id))
    if (conv.kind === 'direct') {
      const { data: members } = await supabase.from('conversation_members').select('user_id').eq('conversation_id', id)
      const other = members?.find(m => m.user_id !== user.id)?.user_id
      const { data: p } = other ? await supabase.from('profiles').select('full_name').eq('id', other).maybeSingle() : { data: null }
      title = p?.full_name || t('common.someone')
    }
    const { data: state } = await supabase.from('conversation_state').select('muted').eq('conversation_id', id).eq('user_id', user.id).maybeSingle()
    setInfo({ ...conv, canPost, title, orgName: conv.organisations?.name, isAdmin: conv.kind === 'org' && roleIn(conv.org_id) === 'admin' })
    setMuted(!!state?.muted)
  }
  useEffect(() => { load() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleMute() {
    const next = !muted
    setMuted(next)
    const { error } = await supabase.rpc('read_conversation', { p_conv: id, p_muted: next })
    if (error) { setMuted(!next); return notify(userMessage(error), 'error') }
    notify(next ? t('chat.mutedNow') : t('chat.unmutedNow'))
    onChanged()
  }

  if (missing) return <div style={{ ...card, padding: '32px 20px', textAlign: 'center', color: colors.muted, fontSize: '14px' }}>{t('chat.notFound')}</div>
  if (!info) return spinner
  const Icon = KIND_ICONS[info.kind] || MessageCircle
  return (
    <section aria-label={info.title} style={{ ...card, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '8px', borderBottom: `1px solid ${colors.border}` }}>
        {back && <Link to="/messages" aria-label={t('chat.back')} title={t('chat.back')} style={{ ...iconBtn, color: colors.soft }}><ArrowLeft size={16} /></Link>}
        <Icon size={16} color={colors.accent} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ display: 'block', fontSize: '15px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info.title}</strong>
          {info.kind === 'context' && (
            <span style={{ display: 'block', fontSize: '11px', color: colors.muted }}>{[t(`chat.context.kind.${info.context_type}`), info.orgName].filter(Boolean).join(' · ')}</span>
          )}
          {info.kind === 'org' && (
            <span style={{ display: 'block', fontSize: '11px', color: colors.muted }}>
              {[info.orgName, t(`chat.audience.${info.audience}`), info.admins_post && t('chat.adminsPostShort'), info.archived_at && t('chat.archived')].filter(Boolean).join(' · ')}
            </span>
          )}
        </span>
        {info.kind === 'context' && contextLink(info) && <Link to={contextLink(info)} style={{ fontSize: '12px', color: colors.accent, whiteSpace: 'nowrap' }}>{t(`chat.context.open.${info.context_type}`)}</Link>}
        {(info.kind === 'gig' || info.kind === 'department') && <Link to={`/gig/${info.gig_id}?tab=chat`} style={{ fontSize: '12px', color: colors.accent, whiteSpace: 'nowrap' }}>{t('chat.openGig')}</Link>}
        {info.isAdmin && <button onClick={() => setEditing(true)} aria-label={t('chat.channelSettings')} title={t('chat.channelSettings')} style={{ ...iconBtn, color: colors.soft }}><Settings size={16} /></button>}
        <button onClick={toggleMute} aria-pressed={muted} aria-label={muted ? t('chat.unmute') : t('chat.mute')} title={muted ? t('chat.unmute') : t('chat.mute')}
          style={{ ...iconBtn, color: muted ? colors.muted : colors.soft }}>{muted ? <BellOff size={16} /> : <Bell size={16} />}</button>
      </div>
      {info.kind === 'context' && (info.context_type === 'quote' || info.context_type === 'supplier') && (
        <p style={{ fontSize: '12px', color: '#F59E0B', padding: '6px 2px', display: 'flex', gap: '6px', alignItems: 'center' }}><Eye size={13} /> {t(`chat.guest.notice.${info.context_type}`)}</p>
      )}
      {info.archived_at && (
        <p style={{ fontSize: '12px', color: colors.muted, padding: '6px 2px', display: 'flex', gap: '6px', alignItems: 'center' }}><Archive size={13} /> {t('chat.archivedNote')}</p>
      )}
      <Conversation conversationId={id} focusId={focusId} canPost={info.canPost} height={back ? 'calc(100dvh - 210px)' : '65vh'}
        emptyText={info.kind === 'direct' ? t('chat.emptyDirect', { name: info.title }) : info.kind === 'org' ? t('chat.emptyChannel') : undefined} />
      {editing && <ChannelModal channel={info} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); onChanged() }} />}
    </section>
  )
}

