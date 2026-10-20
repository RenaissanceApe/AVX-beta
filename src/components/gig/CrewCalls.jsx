import { useEffect, useState } from 'react'
import { Megaphone, X, Loader2, Send, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { useI18n, t } from '../../i18n'
import { Modal, btn, btnPrimary, iconBtn, input, label, colors } from '../ui'
import { NetworkPicker } from '../NetworkPicker'

// Crew calls (docs/MESSAGING.md, M4): offer a place on the gig to several people from your
// network at once. Each gets it in their direct conversation with you and answers there; the
// first to accept get the places, and the call closes when they're all taken.

export function CrewCallModal({ gigId, preset = {}, onClose, onSent }) {
  const { notify } = useToast()
  const [title, setTitle] = useState(preset.title || '')
  const [quantity, setQuantity] = useState(preset.quantity || 1)
  const [note, setNote] = useState('')
  const [people, setPeople] = useState([])
  const [sending, setSending] = useState(false)

  const pick = p => setPeople(list => (list.some(x => x.user_id === p.user_id) ? list : [...list, p]))
  const invalid = !title.trim() || !people.length

  async function send(e) {
    e.preventDefault()
    if (invalid) return
    setSending(true)
    const { data, error } = await supabase.rpc('send_crew_call', {
      p_gig: gigId, p_title: title.trim(), p_quantity: Math.min(20, Math.max(1, Math.round(Number(quantity) || 1))),
      p_note: note.trim() || null, p_people: people.map(p => p.user_id),
    })
    setSending(false)
    if (error) {
      logger.error('crewcall', error, { gigId })
      return notify(error.code === '22023' ? t('crewCall.nobody') : userMessage(error), 'error')
    }
    track('crewcall:send')
    notify(t('crewCall.sent', { count: data }), 'success')
    onSent()
    onClose()
  }

  return (
    <Modal title={t('crewCall.title')} onClose={onClose} maxWidth={560}>
      <form onSubmit={send} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.6 }}>{t('crewCall.intro')}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 90px', gap: '10px' }}>
          <div>
            <label style={label} htmlFor="cc-title">{t('crewCall.function')} *</label>
            <input id="cc-title" value={title} onChange={e => setTitle(e.target.value)} maxLength={120} placeholder={t('crew.functionPlaceholder')} autoFocus style={input} />
          </div>
          <div>
            <label style={label} htmlFor="cc-qty">{t('crewCall.places')}</label>
            <input id="cc-qty" type="number" min={1} max={20} value={quantity} onChange={e => setQuantity(e.target.value)} style={input} />
          </div>
        </div>
        <div>
          <label style={label} htmlFor="cc-note">{t('crewCall.note')}</label>
          <input id="cc-note" value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder={t('crewCall.notePlaceholder')} style={input} />
        </div>
        <div>
          <div style={{ ...label, display: 'flex', alignItems: 'center', gap: '6px' }}><Users size={13} /> {t('crewCall.people', { count: people.length })}</div>
          {people.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
              {people.map(p => (
                <span key={p.user_id} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 4px 4px 10px', borderRadius: '999px', background: 'color-mix(in srgb, var(--accent) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)', fontSize: '13px' }}>
                  {p.full_name || t('common.someone')}
                  <button type="button" onClick={() => setPeople(list => list.filter(x => x.user_id !== p.user_id))}
                    aria-label={t('crewCall.removeNamed', { name: p.full_name || t('common.someone') })} style={{ ...iconBtn, padding: '2px' }}><X size={13} /></button>
                </span>
              ))}
            </div>
          )}
          <NetworkPicker gigId={gigId} onPick={pick} hint={t('crewCall.networkHint')} />
        </div>
        <button type="submit" disabled={sending || invalid} style={{ ...btnPrimary, justifyContent: 'center' }}>
          {sending ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={15} />} {t('crewCall.send', { count: people.length })}
        </button>
      </form>
    </Modal>
  )
}

// The gig's crew calls, for its managers: who was asked, who answered, close one early
export function CrewCallList({ gigId, nameOf, refreshKey }) {
  const { notify } = useToast()
  const { ago } = useI18n()
  const [calls, setCalls] = useState([])
  const [names, setNames] = useState({})

  async function load() {
    const { data, error } = await supabase.from('crew_calls').select('*, answers:crew_call_answers(user_id, answer)')
      .eq('gig_id', gigId).order('created_at', { ascending: false }).limit(20)
    if (error) return logger.error('crewcall', error, { step: 'list', gigId })
    setCalls(data || [])
    const ids = [...new Set((data || []).flatMap(c => c.answers.map(a => a.user_id)))]
    if (ids.length) {
      const { data: people } = await supabase.from('profiles').select('id, full_name').in('id', ids)
      setNames(Object.fromEntries((people || []).map(p => [p.id, p.full_name || ''])))
    }
  }
  useEffect(() => { load() }, [gigId, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  async function close(call) {
    const { error } = await supabase.rpc('close_crew_call', { p_call: call.id })
    if (error) return notify(userMessage(error), 'error')
    load()
  }

  if (!calls.length) return null
  const nameFor = id => names[id] || nameOf(id)
  return (
    <section style={{ marginBottom: '26px' }} aria-labelledby="crewcalls-title">
      <h3 id="crewcalls-title" style={{ ...label, display: 'flex', alignItems: 'center', gap: '6px' }}><Megaphone size={13} /> {t('crewCall.heading')}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {calls.map(c => {
          const taken = c.answers.filter(a => a.answer === 'accepted').length
          const by = answer => c.answers.filter(a => a.answer === answer).map(a => nameFor(a.user_id)).join(', ')
          return (
            <div key={c.id} style={{ padding: '9px 12px', borderRadius: '10px', border: `1px solid ${colors.border}`, background: 'color-mix(in srgb, var(--fg) min(100%, calc(2% * var(--line-k))), transparent)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>{c.title}</div>
                  <div style={{ fontSize: '12px', color: colors.muted }}>{t('crewCall.asked', { count: c.answers.length, when: ago(c.created_at) })}</div>
                </div>
                <span style={{ fontSize: '12px', fontWeight: 700, color: taken >= c.quantity ? colors.accentText : 'var(--warn)', whiteSpace: 'nowrap' }}>
                  {c.closed_at ? t('chat.ev.closedFilled', { taken, quantity: c.quantity }) : t('chat.ev.filled', { taken, quantity: c.quantity })}
                </span>
                {!c.closed_at && <button onClick={() => close(c)} style={{ ...btn, padding: '5px 10px', fontSize: '12px' }}>{t('chat.ev.closeCall')}</button>}
              </div>
              {['accepted', 'declined', 'invited'].map(answer => by(answer) && (
                <div key={answer} style={{ fontSize: '12px', color: answer === 'accepted' ? colors.accentText : colors.muted, marginTop: '4px' }}>
                  {t(`crewCall.answer.${answer}`)}: {by(answer)}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </section>
  )
}
