import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { MessageCircleQuestion, Check, X, Building2, MapPin, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { track } from '../lib/usage'
import { rangeText } from '../lib/clashes'
import { useI18n, t } from '../i18n'
import { btn, input, colors } from './ui'

// My work: "are you available?" requests waiting for an answer. Answering notifies
// whoever asked; nothing is booked until they add you to the gig.
export default function AvailabilityRequests({ onAnswered }) {
  const { user } = useAuth()
  const [requests, setRequests] = useState([])
  const location = useLocation()
  const ref = useRef(null)

  async function load() {
    const { data, error } = await supabase.rpc('my_availability_requests', { p_include_answered: false })
    if (error) return logger.error('requests', error, { step: 'load' })
    setRequests(data || [])
  }
  useEffect(() => {
    if (!user) return
    load()
    // New requests arrive as notifications; reload when one does
    const channel = supabase.channel(`requests-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, p => {
        if (p.new?.kind === 'availability_request') load()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Opened from a notification (/me#requests): bring the list into view
  useEffect(() => {
    if (requests.length && location.hash === '#requests') ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [requests.length, location.hash])

  if (!requests.length) return null
  return (
    <section id="requests" ref={ref} aria-labelledby="requests-title" style={{ marginBottom: '24px' }}>
      <h2 id="requests-title" style={{ fontSize: '12px', fontWeight: 700, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <MessageCircleQuestion size={14} /> {t('requests.title', { count: requests.length })}
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {requests.map(r => (
          <RequestCard key={r.id} request={r} onDone={() => { setRequests(list => list.filter(x => x.id !== r.id)); onAnswered?.() }} />
        ))}
      </div>
    </section>
  )
}

function RequestCard({ request: r, onDone }) {
  const { ago } = useI18n()
  const { notify } = useToast()
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(null)

  async function answer(status) {
    setSaving(status)
    const { data, error } = await supabase.from('availability_requests')
      .update({ status, reply_note: note.trim() || null }).eq('id', r.id).select('id')
    setSaving(null)
    if (error) {
      logger.error('requests', error, { step: 'answer' })
      return notify(userMessage(error), 'error')
    }
    // No row: it was withdrawn or answered in the meantime
    if (!data?.length) notify(t('requests.gone'), 'info')
    else {
      track(`requests:${status}`)
      notify(t('requests.answered', { name: r.asked_by_name || t('common.someone') }), 'success')
    }
    onDone()
  }

  return (
    <div style={{ padding: '14px 16px', borderRadius: '14px', background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.3)' }}>
      <div style={{ fontSize: '13px', color: colors.soft, marginBottom: '4px' }}>
        {t('requests.asks', { name: r.asked_by_name || t('common.someone'), when: ago(r.created_at) })}
      </div>
      <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '4px' }}>{r.gig_name}</div>
      <div style={{ display: 'flex', gap: '4px 14px', flexWrap: 'wrap', fontSize: '13px', color: colors.muted }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Building2 size={12} /> {r.company}</span>
        {r.starts_at && <strong style={{ color: '#fff' }}>{rangeText(r.starts_at, r.ends_at)}</strong>}
        {r.venue && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={12} /> {r.venue}</span>}
      </div>
      {r.message && <p style={{ fontSize: '13px', marginTop: '8px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>“{r.message}”</p>}
      <input value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder={t('requests.notePlaceholder')}
        aria-label={t('requests.note')} style={{ ...input, marginTop: '10px', padding: '8px 10px', fontSize: '13px' }} />
      <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
        <button onClick={() => answer('available')} disabled={!!saving} style={btn}>
          {saving === 'available' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />} {t('requests.available')}
        </button>
        <button onClick={() => answer('unavailable')} disabled={!!saving} style={{ ...btn, background: 'transparent', borderColor: 'rgba(239,68,68,0.35)', color: colors.danger }}>
          {saving === 'unavailable' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <X size={14} />} {t('requests.unavailable')}
        </button>
      </div>
    </div>
  )
}
