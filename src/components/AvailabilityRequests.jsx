import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { MessageCircleQuestion, Check, X, Building2, MapPin } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { track } from '../lib/usage'
import { rangeText } from '../lib/clashes'
import { useI18n, t } from '../i18n'
import { btn, btnPrimary, input, colors, label, AvxLoader, Section, space } from './ui'

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
    <Section id="requests-title" sectionRef={ref} title={<><MessageCircleQuestion size={16} color="var(--warn)" aria-hidden="true" /> {t('requests.title', { count: requests.length })}</>}>
      <div id="requests" style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        {requests.map(r => (
          <RequestCard key={r.id} request={r} onDone={() => { setRequests(list => list.filter(x => x.id !== r.id)); onAnswered?.() }} />
        ))}
      </div>
    </Section>
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
    // The question card (DESIGN.md "AvailabilityAsk"): company eyebrow, the gig in Space Mono, the dates as
    // square day cells, and two 44px answers side by side with "available" on the thumb side
    <div style={{ padding: '16px', background: 'var(--panel)', border: '1px solid var(--line-strong)' }}>
      <div style={{ ...label, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <Building2 size={12} aria-hidden="true" /> {r.company}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '16px', lineHeight: '22px', marginBottom: '4px' }}>{r.gig_name}</div>
      <div style={{ fontSize: '13px', color: colors.soft, marginBottom: '8px' }}>
        {t('requests.asks', { name: r.asked_by_name || t('common.someone'), when: ago(r.created_at) })}
      </div>
      <div style={{ display: 'flex', gap: '4px 16px', flexWrap: 'wrap', fontSize: '13px', color: 'var(--text-2)' }}>
        {r.starts_at && <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{rangeText(r.starts_at, r.ends_at)}</span>}
        {r.venue && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={13} aria-hidden="true" /> {r.venue}</span>}
      </div>
      {r.starts_at && <DayStrip from={r.starts_at} until={r.ends_at || r.starts_at} />}
      {r.message && <p style={{ fontSize: '13px', marginTop: '10px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>“{r.message}”</p>}
      <input value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder={t('requests.notePlaceholder')}
        aria-label={t('requests.note')} style={{ ...input, marginTop: '12px', padding: '8px 10px', fontSize: '13px' }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '10px' }}>
        <button onClick={() => answer('unavailable')} disabled={!!saving} style={{ ...btn, minHeight: '44px', justifyContent: 'center' }}>
          {saving === 'unavailable' ? <AvxLoader size={14} /> : <X size={14} aria-hidden="true" />} {t('requests.unavailable')}
        </button>
        <button onClick={() => answer('available')} disabled={!!saving} style={{ ...btnPrimary, minHeight: '44px', justifyContent: 'center' }}>
          {saving === 'available' ? <AvxLoader size={14} /> : <Check size={14} aria-hidden="true" />} {t('requests.available')}
        </button>
      </div>
    </div>
  )
}

// The asked-for days as square cells (weekday + day number), up to two weeks
function DayStrip({ from, until }) {
  const { fmt } = useI18n()
  const days = []
  const start = new Date(String(from).slice(0, 10) + 'T12:00:00')
  const end = new Date(String(until).slice(0, 10) + 'T12:00:00')
  for (let d = new Date(start); d <= end && days.length < 14; d.setDate(d.getDate() + 1)) days.push(new Date(d))
  if (!days.length) return null
  return (
    <div aria-hidden="true" style={{ display: 'flex', gap: '4px', marginTop: '10px', flexWrap: 'wrap' }}>
      {days.map(d => (
        <span key={d.toISOString()} style={{ width: '40px', padding: '4px 0', textAlign: 'center', background: 'var(--fill)', border: '1px solid var(--line-strong)', fontFamily: 'var(--font-mono)' }}>
          <span style={{ display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: colors.muted }}>{fmt(d, 'EEE')}</span>
          <span style={{ display: 'block', fontSize: '16px', fontWeight: 700 }}>{fmt(d, 'd')}</span>
        </span>
      ))}
    </div>
  )
}
