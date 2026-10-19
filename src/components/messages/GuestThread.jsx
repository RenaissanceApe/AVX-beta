import { useCallback, useEffect, useRef, useState } from 'react'
import { Send, Loader2, MessageSquare } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { logger } from '../../lib/logger'
import { translate, fmtIn } from '../../i18n'

const NAME_KEY = 'avx.guestName'
const readName = () => { try { return localStorage.getItem(NAME_KEY) || '' } catch { return '' } }
const saveName = v => { try { localStorage.setItem(NAME_KEY, v) } catch { /* private mode */ } }

// The conversation on a page opened from a link, for someone without an account: a quote's client
// or a subrental's supplier (docs/MESSAGING.md, M4b). The link's token is the only key. New
// messages are fetched every 20 seconds while the page is visible. onData gets what the
// conversation is about (the supplier page shows the order from it), or null for a link that
// doesn't work.
export default function GuestThread({ token, lang, defaultName = '', onData }) {
  const tr = (key, vars) => translate(lang, key, vars)
  const [data, setData] = useState(undefined)
  const [name, setName] = useState(() => readName() || defaultName)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const list = useRef(null)

  const load = useCallback(async () => {
    const { data: res, error: err } = await supabase.rpc('guest_thread', { p_token: token })
    if (err) { logger.warn('guest', 'Thread failed', { code: err.code }); setData(d => d ?? null); return }
    setData(res)
    onData?.(res)
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load()
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load() }, 20000)
    return () => clearInterval(timer)
  }, [load])

  const count = data?.messages?.length || 0
  useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight }, [count])

  async function send(e) {
    e.preventDefault()
    if (!name.trim() || !text.trim()) return
    setSending(true)
    setError('')
    const { error: err } = await supabase.rpc('guest_post', { p_token: token, p_name: name.trim(), p_body: text.trim() })
    setSending(false)
    if (err) {
      logger.warn('guest', 'Post failed', { code: err.code })
      return setError(err.code === '54000' ? tr('guest.tooMany') : tr('guest.failed'))
    }
    saveName(name.trim())
    setText('')
    load()
  }

  if (data === undefined) return null
  if (data === null) return null
  const org = data.org?.name || ''
  return (
    <section className="no-print" aria-label={tr('guest.title', { org })} style={box}>
      <h2 style={{ fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 4px' }}>
        <MessageSquare size={16} color="#0FA85A" /> {tr('guest.title', { org })}
      </h2>
      <p style={{ fontSize: '12px', color: '#666', margin: '0 0 10px' }}>{tr('guest.intro', { org })}</p>
      <div ref={list} role="log" aria-live="polite" style={{ maxHeight: '340px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', padding: '4px 0' }}>
        {count === 0 && <p style={{ fontSize: '13px', color: '#777', textAlign: 'center', padding: '14px 0' }}>{tr('guest.empty', { org })}</p>}
        {data.messages.map(m => (
          <div key={m.id} style={{ alignSelf: m.guest ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
            <div style={{ fontSize: '11px', color: '#777', margin: '0 4px 2px', textAlign: m.guest ? 'right' : 'left' }}>
              {m.name}{!m.guest && org && m.name !== org ? ` · ${org}` : ''} · {fmtIn(lang, m.at, lang === 'pt' ? 'dd-MM HH:mm' : 'd MMM HH:mm')}
            </div>
            <div style={{ background: m.guest ? '#E7F8EF' : '#F1F3F5', borderRadius: '10px', padding: '8px 11px', fontSize: '14px', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body}</div>
          </div>
        ))}
      </div>
      <form onSubmit={send} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
        <label style={labelStyle}>
          {tr('guest.yourName')}
          <input value={name} onChange={e => setName(e.target.value)} maxLength={80} required autoComplete="name" style={field} />
        </label>
        <label style={labelStyle}>
          {tr('guest.message')}
          <textarea value={text} onChange={e => setText(e.target.value)} maxLength={2000} rows={3} required style={{ ...field, resize: 'vertical' }} />
        </label>
        {error && <p role="alert" style={{ fontSize: '13px', color: '#B91C1C', margin: 0 }}>{error}</p>}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ flex: '1 1 200px', fontSize: '11px', color: '#777', lineHeight: 1.5 }}>
            {tr('guest.privacy', { org })} <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: '#555' }}>{tr('guest.privacyLink')}</a>
          </span>
          <button type="submit" disabled={sending || !name.trim() || !text.trim()} style={sendBtn}>
            {sending ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />} {tr('guest.send')}
          </button>
        </div>
      </form>
    </section>
  )
}

const box = {
  maxWidth: '210mm', margin: '12px auto 0', background: '#fff', color: '#111', borderRadius: '6px', border: '1px solid #d5dbe1',
  padding: '16px', fontFamily: "'Inter', sans-serif",
}
const labelStyle = { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', color: '#333' }
const field = { padding: '9px 11px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '14px', color: '#111', background: '#fff', fontFamily: 'inherit' }
const sendBtn = {
  display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 16px', borderRadius: '6px', border: 'none',
  background: '#0FA85A', color: '#fff', fontWeight: 600, fontSize: '14px', cursor: 'pointer',
}
