import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Download, Calendar, Clock, Package, Receipt, Lock, Loader2, Search, ClipboardList, UserPlus, HelpCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { logger, userMessage } from '../../lib/logger'
import { useToast } from '../../lib/ToastContext'
import { track } from '../../lib/usage'
import { rangeText } from '../../lib/clashes'
import { formatSize, dayRange } from '../../lib/messages'
import { useI18n, t, fmt } from '../../i18n'
import { Modal, input, btn, btnPrimary, colors } from '../ui'

// Pieces of a message (docs/MESSAGING.md, M2): files, object cards, reactions, earlier versions.

// Signed links are reused for 50 minutes so scrolling doesn't ask again
const signed = new Map()
async function signedUrl(path, download) {
  const key = `${path}|${download || ''}`
  const hit = signed.get(key)
  if (hit && hit.until > Date.now()) return hit.url
  const { data, error } = await supabase.storage.from('message-files').createSignedUrl(path, 3600, download ? { download } : undefined)
  if (error) { logger.warn('messages', 'File link failed', { code: error.statusCode }); return null }
  signed.set(key, { url: data.signedUrl, until: Date.now() + 50 * 60 * 1000 })
  return data.signedUrl
}

const isImage = f => /^image\/(png|jpe?g|gif|webp)$/i.test(f.type || '')

function ImageFile({ file }) {
  const [url, setUrl] = useState(null)
  useEffect(() => { let on = true; signedUrl(file.path).then(u => on && setUrl(u)); return () => { on = false } }, [file.path])
  return (
    <a href={url || undefined} target="_blank" rel="noopener noreferrer" aria-label={file.name} title={file.name}
      style={{ display: 'block', width: '180px', maxWidth: '100%', aspectRatio: '4 / 3', borderRadius: '8px', overflow: 'hidden', background: 'color-mix(in srgb, var(--shade) 30%, transparent)' }}>
      {url && <img src={url} alt={file.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
    </a>
  )
}

function OtherFile({ file }) {
  const [busy, setBusy] = useState(false)
  async function open() {
    setBusy(true)
    const url = await signedUrl(file.path, file.name)
    setBusy(false)
    if (url) window.open(url, '_blank', 'noopener')
  }
  return (
    <button type="button" onClick={open} title={t('chat.download', { name: file.name })} style={{
      display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderRadius: '8px', border: `1px solid ${colors.border}`,
      background: 'color-mix(in srgb, var(--shade) 20%, transparent)', color: 'var(--text)', font: 'inherit', fontSize: '13px', cursor: 'pointer', maxWidth: '100%', textAlign: 'left',
    }}>
      <FileText size={16} color={colors.accentText} style={{ flexShrink: 0 }} />
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
      <span style={{ color: colors.muted, fontSize: '11px', whiteSpace: 'nowrap' }}>{formatSize(file.size)}</span>
      {busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={14} color={colors.muted} />}
    </button>
  )
}

export function Attachments({ files }) {
  if (!files?.length) return null
  const images = files.filter(isImage)
  const others = files.filter(f => !isImage(f))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', margin: '2px 0 4px' }}>
      {images.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>{images.map(f => <ImageFile key={f.path} file={f} />)}</div>}
      {others.map(f => <OtherFile key={f.path} file={f} />)}
    </div>
  )
}

// ── Object cards ─────────────────────────────────────────────────────────────
const CARD_ICONS = { gig: Calendar, schedule: Clock, asset: FileText, quote: Receipt, item: Package, callsheet: ClipboardList }

// What each card shows and where it leads; the database decides whether the reader can see it
async function loadCard(type, id) {
  if (type === 'gig') {
    const { data } = await supabase.from('gigs').select('id, name, start_date, end_date, venue').eq('id', id).maybeSingle()
    return data && { title: data.name, sub: [dayRange(data.start_date, data.end_date, fmt), data.venue].filter(Boolean).join(' · '), to: `/gig/${data.id}` }
  }
  if (type === 'schedule') {
    const { data } = await supabase.from('gig_schedule').select('id, gig_id, day, start_time, end_time, title, location').eq('id', id).maybeSingle()
    return data && { title: data.title, sub: [dayRange(data.day, null, fmt), [data.start_time, data.end_time].filter(Boolean).map(x => x.slice(0, 5)).join('–'), data.location].filter(Boolean).join(' · '), to: `/gig/${data.gig_id}?tab=schedule` }
  }
  if (type === 'asset') {
    const { data } = await supabase.from('assets').select('id, gig_id, name, version').eq('id', id).maybeSingle()
    return data && { title: data.name, sub: t('chat.card.version', { version: data.version }), to: `/gig/${data.gig_id}?tab=assets` }
  }
  if (type === 'quote') {
    const { data } = await supabase.from('quotes').select('id, number, title, client_name, status').eq('id', id).maybeSingle()
    return data && { title: `${data.number} · ${data.title}`, sub: [data.client_name, t(`quoteStatus.${data.status}`)].filter(Boolean).join(' · '), to: `/quote/${data.id}` }
  }
  if (type === 'callsheet') {
    const { data } = await supabase.from('gigs').select('id, name, start_date, end_date').eq('id', id).maybeSingle()
    return data && { title: data.name, sub: dayRange(data.start_date, data.end_date, fmt), to: `/gig/${data.id}/callsheet` }
  }
  if (type === 'item') {
    const { data } = await supabase.from('price_items').select('id, org_id, name, code, category').eq('id', id).maybeSingle()
    return data && { title: data.name, sub: [data.code, data.category].filter(Boolean).join(' · '), to: `/org/${data.org_id}/inventory/${data.id}` }
  }
  return null
}

export function CardView({ card }) {
  const [info, setInfo] = useState(undefined)
  useEffect(() => {
    let on = true
    loadCard(card.type, card.id).then(d => on && setInfo(d || null), () => on && setInfo(null))
    return () => { on = false }
  }, [card.type, card.id])
  const Icon = CARD_ICONS[card.type] || FileText
  const box = { display: 'flex', gap: '10px', alignItems: 'center', padding: '8px 10px', borderRadius: '10px', border: `1px solid ${colors.border}`, background: 'color-mix(in srgb, var(--shade) 20%, transparent)', margin: '2px 0 4px', color: 'var(--text)', textDecoration: 'none', minWidth: '200px' }
  if (info === undefined) return <div style={box}><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /></div>
  if (!info) return <div style={{ ...box, color: colors.muted, fontSize: '13px' }}><Lock size={15} /> {t('chat.card.hidden', { type: t(`chat.card.${card.type}`) })}</div>
  return (
    <Link to={info.to} style={box}>
      <Icon size={18} color={colors.accentText} style={{ flexShrink: 0 }} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '11px', color: colors.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t(`chat.card.${card.type}`)}</span>
        <span style={{ display: 'block', fontWeight: 700, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info.title}</span>
        {info.sub && <span style={{ display: 'block', fontSize: '12px', color: colors.soft }}>{info.sub}</span>}
      </span>
    </Link>
  )
}

// ── Picking something to share ──────────────────────────────────────────────
// Gig-specific kinds (schedule, files) only inside a gig's channel
async function searchCards(type, query, gigId) {
  const like = `%${query.trim()}%`
  if (type === 'gig') {
    let q = supabase.from('gigs').select('id, name, start_date, venue').order('start_date', { ascending: false }).limit(20)
    if (query.trim()) q = q.ilike('name', like)
    const { data } = await q
    return (data || []).map(g => ({ id: g.id, title: g.name, sub: [dayRange(g.start_date, null, fmt), g.venue].filter(Boolean).join(' · ') }))
  }
  if (type === 'schedule') {
    let q = supabase.from('gig_schedule').select('id, day, start_time, title').eq('gig_id', gigId).order('day').order('start_time').limit(50)
    if (query.trim()) q = q.ilike('title', like)
    const { data } = await q
    return (data || []).map(s => ({ id: s.id, title: s.title, sub: `${dayRange(s.day, null, fmt)} · ${s.start_time.slice(0, 5)}` }))
  }
  if (type === 'asset') {
    let q = supabase.from('assets').select('id, name, version').eq('gig_id', gigId).is('superseded_by', null).order('created_at', { ascending: false }).limit(50)
    if (query.trim()) q = q.ilike('name', like)
    const { data } = await q
    return (data || []).map(a => ({ id: a.id, title: a.name, sub: t('chat.card.version', { version: a.version }) }))
  }
  if (type === 'quote') {
    let q = supabase.from('quotes').select('id, number, title, client_name').order('updated_at', { ascending: false }).limit(20)
    if (query.trim()) q = q.ilike('title', like)
    const { data } = await q
    return (data || []).map(x => ({ id: x.id, title: `${x.number} · ${x.title}`, sub: x.client_name || '' }))
  }
  if (type === 'item') {
    let q = supabase.from('price_items').select('id, name, code').is('archived_at', null).order('name').limit(20)
    if (query.trim()) q = q.ilike('name', like)
    const { data } = await q
    return (data || []).map(i => ({ id: i.id, title: i.name, sub: i.code || '' }))
  }
  return []
}

export function CardPicker({ gigId, onPick, onClose }) {
  const types = gigId ? ['schedule', 'asset', 'gig', 'quote', 'item'] : ['gig', 'quote', 'item']
  const [type, setType] = useState(types[0])
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState(null)
  useEffect(() => {
    let on = true
    setRows(null)
    const timer = setTimeout(() => searchCards(type, query, gigId).then(r => on && setRows(r), () => on && setRows([])), query ? 250 : 0)
    return () => { on = false; clearTimeout(timer) }
  }, [type, query, gigId])
  return (
    <Modal title={t('chat.share')} onClose={onClose}>
      <div role="tablist" style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '10px' }}>
        {types.map(k => (
          <button key={k} role="tab" aria-selected={type === k} onClick={() => setType(k)} style={{
            padding: '6px 10px', borderRadius: '8px', border: `1px solid ${type === k ? colors.accent : colors.border}`, cursor: 'pointer',
            background: type === k ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent', color: type === k ? colors.accentText : colors.soft, font: 'inherit', fontSize: '13px', fontWeight: 600,
          }}>{t(`chat.card.${k}`)}</button>
        ))}
      </div>
      <div style={{ position: 'relative', marginBottom: '8px' }}>
        <Search size={14} color={colors.muted} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('chat.shareSearch')} aria-label={t('chat.shareSearch')} style={{ ...input, paddingLeft: '30px' }} />
      </div>
      <div style={{ maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {!rows ? <Loader2 size={18} color={colors.accentText} style={{ animation: 'spin 1s linear infinite', margin: '16px auto' }} />
          : rows.length === 0 ? <p style={{ color: colors.muted, fontSize: '13px', padding: '12px 4px' }}>{t('chat.shareNone')}</p>
            : rows.map(r => (
              <button key={r.id} type="button" onClick={() => onPick({ type, id: r.id }, r.title)} style={{
                textAlign: 'left', padding: '8px 10px', borderRadius: '8px', border: 'none', background: 'transparent', color: 'var(--text)', font: 'inherit', cursor: 'pointer',
              }}>
                <span style={{ display: 'block', fontWeight: 600, fontSize: '14px' }}>{r.title}</span>
                {r.sub && <span style={{ display: 'block', fontSize: '12px', color: colors.muted }}>{r.sub}</span>}
              </button>
            ))}
      </div>
    </Modal>
  )
}

// ── Reactions under a message ───────────────────────────────────────────────
export function ReactionBar({ summary, name, onToggle, alignEnd }) {
  if (!summary.length) return null
  return (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '3px', justifyContent: alignEnd ? 'flex-end' : 'flex-start' }}>
      {summary.map(r => (
        <button key={r.emoji} type="button" onClick={onToggle ? () => onToggle(r.emoji) : undefined} disabled={!onToggle}
          aria-pressed={r.mine} title={r.users.map(name).join(', ')}
          aria-label={t('chat.reactionCount', { emoji: r.emoji, count: r.count })}
          style={{
            display: 'flex', alignItems: 'center', gap: '4px', padding: '1px 7px', borderRadius: '10px', font: 'inherit', fontSize: '12px',
            border: `1px solid ${r.mine ? colors.accent : colors.border}`, background: r.mine ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'color-mix(in srgb, var(--fg) min(100%, calc(4% * var(--line-k))), transparent)',
            color: 'var(--text)', cursor: onToggle ? 'pointer' : 'default', opacity: 1,
          }}>{r.emoji} <span>{r.count}</span></button>
      ))}
    </div>
  )
}

// ── Earlier versions of an edited message ──────────────────────────────────
export function HistoryModal({ message, onClose }) {
  const { fmt } = useI18n()
  const [rows, setRows] = useState(null)
  useEffect(() => {
    supabase.from('message_edits').select('body, replaced_at').eq('message_id', message.id).order('replaced_at')
      .then(({ data }) => setRows(data || []))
  }, [message.id])
  return (
    <Modal title={t('chat.history')} onClose={onClose}>
      {!rows ? <Loader2 size={18} color={colors.accentText} style={{ animation: 'spin 1s linear infinite' }} /> : (
        <ol style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {rows.map((r, i) => (
            <li key={i} style={{ fontSize: '13px' }}>
              <div style={{ color: colors.muted, fontSize: '11px' }}>{t('chat.replacedAt', { when: fmt(r.replaced_at, 'd MMM, HH:mm') })}</div>
              <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', padding: '6px 10px', background: 'color-mix(in srgb, var(--fg) min(100%, calc(4% * var(--line-k))), transparent)', borderRadius: '8px' }}>{r.body}</div>
            </li>
          ))}
          <li style={{ fontSize: '13px' }}>
            <div style={{ color: colors.accentText, fontSize: '11px' }}>{t('chat.current')}</div>
            <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', padding: '6px 10px', background: 'color-mix(in srgb, var(--accent) 8%, transparent)', borderRadius: '8px' }}>{message.body}</div>
          </li>
        </ol>
      )}
    </Modal>
  )
}

// ── Who has confirmed an announcement (its author and whoever runs the channel) ──
export function AckStatusModal({ message, onClose }) {
  const { fmt } = useI18n()
  const [rows, setRows] = useState(null)
  useEffect(() => {
    supabase.rpc('announcement_status', { p_id: message.id }).then(({ data, error }) => {
      if (error) logger.warn('messages', 'Announcement status failed', { code: error.code })
      setRows(data || [])
    })
  }, [message.id])
  const done = (rows || []).filter(r => r.acked_at)
  const waiting = (rows || []).filter(r => !r.acked_at)
  const row = (r, ok) => (
    <li key={r.user_id} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '6px 2px', borderBottom: `1px solid ${colors.border}`, fontSize: '14px' }}>
      <span>{r.full_name || t('common.someone')}</span>
      <span style={{ fontSize: '12px', color: ok ? colors.accentText : colors.muted }}>{ok ? fmt(r.acked_at, 'd MMM, HH:mm') : t('chat.ackWaiting')}</span>
    </li>
  )
  return (
    <Modal title={t('chat.ackTitle')} onClose={onClose}>
      <p style={{ fontSize: '13px', color: colors.soft, marginBottom: '12px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{(message.body || '').slice(0, 300)}</p>
      {!rows ? <Loader2 size={18} color={colors.accentText} style={{ animation: 'spin 1s linear infinite' }} /> : (
        <>
          <p style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>{t('chat.ackCount', { done: done.length, total: rows.length })}</p>
          <ul style={{ listStyle: 'none' }}>{waiting.map(r => row(r, false))}{done.map(r => row(r, true))}</ul>
        </>
      )}
    </Modal>
  )
}

// ── Questions and offers in a direct conversation (M4) ───────────────────────
// An availability question or a crew call, with its answer buttons for the person asked. What
// was answered comes from the answer lines that follow it in the conversation (`answers`).
export function EventCard({ message: m, mine, actor, answers }) {
  const { notify } = useToast()
  const p = m.payload || {}
  const [busy, setBusy] = useState(null)
  const [note, setNote] = useState('')
  const [call, setCall] = useState(null)
  const last = answers[answers.length - 1]?.payload
  const isCall = p.event === 'crew_call'

  // Whoever sent a crew call sees how many places are filled, and can close it
  useEffect(() => {
    if (!isCall || !mine) return
    let on = true
    Promise.all([
      supabase.from('crew_calls').select('quantity, closed_at').eq('id', p.call_id).maybeSingle(),
      supabase.from('crew_call_answers').select('answer').eq('call_id', p.call_id),
    ]).then(([{ data: c }, { data: rows }]) => {
      if (on && c) setCall({ ...c, taken: (rows || []).filter(r => r.answer === 'accepted').length })
    })
    return () => { on = false }
  }, [isCall, mine, p.call_id, answers.length])

  async function answerAvailability(status) {
    setBusy(status)
    const { data, error } = await supabase.from('availability_requests')
      .update({ status, reply_note: note.trim() || null }).eq('id', p.request_id).select('id')
    setBusy(null)
    if (error) { logger.error('messages', error, { step: 'availability' }); return notify(userMessage(error), 'error') }
    if (!data?.length) notify(t('requests.gone'), 'info')
    else track(`requests:${status}`)
  }

  async function answerCall(accept) {
    setBusy(accept ? 'accept' : 'decline')
    const { data, error } = await supabase.rpc('answer_crew_call', { p_call: p.call_id, p_accept: accept })
    setBusy(null)
    if (error) { logger.error('messages', error, { step: 'crew call' }); return notify(userMessage(error), 'error') }
    track(`crewcall:${data}`)
    if (data === 'full') notify(t('chat.ev.full'), 'info')
  }

  async function closeCall() {
    setBusy('close')
    const { error } = await supabase.rpc('close_crew_call', { p_call: p.call_id })
    setBusy(null)
    if (error) { logger.error('messages', error, { step: 'close call' }); return notify(userMessage(error), 'error') }
    setCall(c => ({ ...c, closed_at: new Date().toISOString() }))
  }

  const Icon = isCall ? UserPlus : HelpCircle
  const range = isCall ? dayRange(p.start_date, p.end_date, fmt) : (p.from && p.until ? rangeText(p.from, p.until) : '')
  const heading = isCall
    ? t(mine ? 'chat.ev.crewCallSent' : 'chat.ev.crewCall', { actor, title: p.title })
    : t(mine ? 'chat.ev.availabilitySent' : 'chat.ev.availability', { actor })
  let state = null
  if (isCall) {
    if (mine) state = call && (call.closed_at ? t('chat.ev.closedFilled', { taken: call.taken, quantity: call.quantity }) : t('chat.ev.filled', { taken: call.taken, quantity: call.quantity }))
    else if (last) state = t(`chat.ev.you.${last.answer}`)
  } else if (last) {
    state = last.status === 'withdrawn' ? t('chat.ev.withdrawn') : t(`requests.${last.status}`)
  } else if (mine) state = t('chat.ev.waiting')
  const canAnswer = !mine && !last

  return (
    <div style={{ margin: '8px auto', maxWidth: '420px', padding: '12px 14px', borderRadius: '12px', border: `1px solid ${isCall ? 'color-mix(in srgb, var(--accent) 35%, transparent)' : 'color-mix(in srgb, var(--warn) 35%, transparent)'}`, background: isCall ? 'color-mix(in srgb, var(--accent) 6%, transparent)' : 'color-mix(in srgb, var(--warn) 6%, transparent)' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px', color: colors.soft }}>
        <Icon size={16} color={isCall ? colors.accentText : 'var(--warn)'} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1 }}>{heading}</span>
        <span style={{ fontSize: '11px', color: colors.muted }}>{fmt(m.created_at, 'HH:mm')}</span>
      </div>
      <Link to={`/gig/${p.gig_id}`} style={{ display: 'block', color: 'var(--text)', fontWeight: 700, fontSize: '15px', margin: '6px 0 2px', textDecoration: 'none' }}>{p.gig_name}</Link>
      {range && <div style={{ fontSize: '13px', color: colors.soft }}>{range}</div>}
      {p.message && <div style={{ fontSize: '13px', marginTop: '6px', whiteSpace: 'pre-wrap' }}>“{p.message}”</div>}
      {state && <div style={{ fontSize: '13px', fontWeight: 600, marginTop: '8px', color: last?.status === 'unavailable' || last?.answer === 'declined' ? colors.muted : colors.accentText }}>{state}{last?.note ? ` · ${last.note}` : ''}</div>}
      {canAnswer && !isCall && (
        <input value={note} onChange={e => setNote(e.target.value)} placeholder={t('requests.notePlaceholder')} aria-label={t('requests.note')} maxLength={300}
          style={{ ...input, marginTop: '8px', fontSize: '13px', padding: '8px 10px' }} />
      )}
      {canAnswer && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
          <button type="button" disabled={!!busy} onClick={() => (isCall ? answerCall(true) : answerAvailability('available'))} style={{ ...btnPrimary, padding: '8px 14px', fontSize: '13px' }}>
            {busy === 'accept' || busy === 'available' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : t(isCall ? 'chat.ev.accept' : 'requests.available')}
          </button>
          <button type="button" disabled={!!busy} onClick={() => (isCall ? answerCall(false) : answerAvailability('unavailable'))} style={{ ...btn, padding: '8px 14px', fontSize: '13px' }}>
            {busy === 'decline' || busy === 'unavailable' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : t(isCall ? 'chat.ev.decline' : 'requests.unavailable')}
          </button>
        </div>
      )}
      {isCall && mine && call && !call.closed_at && (
        <button type="button" disabled={!!busy} onClick={closeCall} style={{ ...btn, padding: '6px 12px', fontSize: '12px', marginTop: '8px' }}>{t('chat.ev.closeCall')}</button>
      )}
    </div>
  )
}

// ── Report a message (M6a): to whoever runs the conversation, or the AVX team in a direct one ──
const REPORT_REASONS = ['spam', 'abuse', 'other']
export function ReportModal({ message, direct, onClose, onBlock }) {
  const { notify } = useToast()
  const [reason, setReason] = useState('spam')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.rpc('report_message', { p_id: message.id, p_reason: reason, p_note: note.trim() || null })
    setBusy(false)
    if (error) {
      logger.error('messages', error, { step: 'report' })
      return notify(error.code === '54000' ? t('chat.report.tooMany') : userMessage(error), 'error')
    }
    track('messages:reported')
    notify(t('chat.report.sent'), 'success')
    onClose(true)
  }
  return (
    <Modal title={t('chat.report.title')} onClose={() => onClose(false)}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <p style={{ fontSize: '13px', color: colors.soft, lineHeight: 1.5 }}>{t(direct ? 'chat.report.hintDirect' : 'chat.report.hint')}</p>
        <fieldset style={{ border: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <legend style={{ fontSize: '12px', fontWeight: 600, color: colors.muted, marginBottom: '6px' }}>{t('chat.report.why')}</legend>
          {REPORT_REASONS.map(r => (
            <label key={r} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer' }}>
              <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} style={{ accentColor: colors.accent }} />
              {t(`chat.report.reason.${r}`)}
            </label>
          ))}
        </fieldset>
        <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={500} rows={3} placeholder={t('chat.report.note')}
          aria-label={t('chat.report.note')} style={{ ...input, resize: 'vertical', font: 'inherit' }} />
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {direct && onBlock && <button type="button" onClick={onBlock} style={{ ...btn, marginRight: 'auto' }}>{t('chat.block.action')}</button>}
          <button type="submit" disabled={busy} style={btnPrimary}>{busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : null}{t('chat.report.send')}</button>
        </div>
      </form>
    </Modal>
  )
}
