import { useCallback, useEffect, useState } from 'react'
import { Loader2, Send, X, PauseCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { sendInvite } from '../lib/invites'
import { track } from '../lib/usage'
import { useI18n } from '../i18n'

const ROLES = ['admin', 'member', 'viewer']

// Crew imported from another tool (docs/SWITCHING.md, S3a), held until an admin sends the
// invitations: nobody is e-mailed by an import. Each can get its role checked first; sending
// goes through the normal invitation, one person at a time. Discarding keeps a record.
export default function HeldInvites({ org, onSent }) {
  const { notify } = useToast()
  const { t } = useI18n()
  const [held, setHeld] = useState([])
  const [picked, setPicked] = useState(() => new Set())
  const [progress, setProgress] = useState(null) // { done, total } while sending

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('held_invites').select('id, email, full_name, phone, functions, role, import_file')
      .eq('org_id', org.id).eq('status', 'held').order('full_name', { nullsFirst: false })
    if (error) logger.error('org', error, { step: 'heldInvites' })
    setHeld(data || [])
    setPicked(new Set())
  }, [org.id])
  useEffect(() => { load() }, [load])

  if (!held.length) return null
  const toggle = id => setPicked(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const allPicked = picked.size === held.length
  const chosen = held.filter(h => picked.has(h.id))

  async function setRole(h, role) {
    const { error } = await supabase.from('held_invites').update({ role }).eq('id', h.id)
    if (error) return notify(userMessage(error), 'error')
    setHeld(list => list.map(x => (x.id === h.id ? { ...x, role } : x)))
  }

  async function discard(list) {
    if (!window.confirm(t('held.confirmDiscard', { count: list.length }))) return
    const { error } = await supabase.from('held_invites').update({ status: 'discarded' }).in('id', list.map(h => h.id))
    if (error) return notify(userMessage(error), 'error')
    track('held:discard')
    load()
  }

  // One at a time, so a problem with one address doesn't stop the others
  async function send() {
    if (!window.confirm(t('held.confirmSend', { count: chosen.length, org: org.name }))) return
    const failed = []
    setProgress({ done: 0, total: chosen.length })
    for (const [i, h] of chosen.entries()) {
      try {
        const outcome = await sendInvite({ kind: 'org', targetId: org.id, email: h.email, role: h.role })
        const { error } = await supabase.from('held_invites').update({ status: 'sent', result: outcome.result }).eq('id', h.id)
        if (error) logger.error('org', error, { step: 'heldMarkSent' })
      } catch (err) {
        logger.error('org', err, { step: 'heldSend' })
        failed.push(h.email)
      }
      setProgress({ done: i + 1, total: chosen.length })
    }
    setProgress(null)
    track('held:send')
    const sent = chosen.length - failed.length
    if (sent) notify(t('held.sent', { count: sent }), 'success')
    if (failed.length) notify(t('held.failed', { emails: failed.join(', ') }), 'error', { duration: 15000 })
    load()
    onSent?.()
  }

  return (
    <section aria-labelledby="held-title" style={box}>
      <h3 id="held-title" style={{ fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
        <PauseCircle size={15} color="var(--warn)" aria-hidden="true" /> {t('held.title', { count: held.length })}
      </h3>
      <p style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.5, margin: '4px 0 8px' }}>{t('held.intro')}</p>
      <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px', marginBottom: '6px', cursor: 'pointer' }}>
        <input type="checkbox" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(held.map(h => h.id)))} style={{ accentColor: 'var(--accent)' }} />
        {t('held.selectAll')}
      </label>
      <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '30vh', overflowY: 'auto' }}>
        {held.map(h => (
          <li key={h.id} style={row}>
            <input type="checkbox" checked={picked.has(h.id)} onChange={() => toggle(h.id)} aria-label={t('held.pick', { name: h.full_name || h.email })} style={{ accentColor: 'var(--accent)', flexShrink: 0 }} />
            <span style={{ flex: '1 1 150px', minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 600, fontSize: '13px', overflowWrap: 'anywhere' }}>{h.full_name || h.email}</span>
              <span style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', overflowWrap: 'anywhere' }}>{[h.full_name && h.email, h.functions].filter(Boolean).join(' · ')}</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' }}>
              <select value={h.role} onChange={e => setRole(h, e.target.value)} disabled={!!progress} aria-label={t('org.roleFor', { name: h.full_name || h.email })} style={select}>
                {ROLES.map(r => <option key={r} value={r}>{t(`orgRole.${r}`)}</option>)}
              </select>
              <button type="button" onClick={() => discard([h])} disabled={!!progress} aria-label={t('held.discardNamed', { name: h.full_name || h.email })} title={t('held.discard')} style={iconBtn}>
                <X size={15} />
              </button>
            </span>
          </li>
        ))}
      </ul>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px', alignItems: 'center' }}>
        <button type="button" onClick={send} disabled={!chosen.length || !!progress} style={sendBtn}>
          {progress ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />}
          {progress ? t('held.sending', { done: progress.done, total: progress.total }) : chosen.length ? t('held.send', { count: chosen.length }) : t('held.selectToSend')}
        </button>
        {chosen.length > 1 && !progress && <button type="button" onClick={() => discard(chosen)} style={plainBtn}>{t('held.discardSelected', { count: chosen.length })}</button>}
      </div>
    </section>
  )
}

const box = { border: '1px solid color-mix(in srgb, var(--warn) 35%, transparent)', borderRadius: '12px', padding: '12px', marginBottom: '16px' }
const row = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', padding: '8px 10px', border: '1px solid color-mix(in srgb, var(--fg) min(100%, calc(7% * var(--line-k))), transparent)', borderRadius: '10px' }
const select = { padding: '6px 8px', background: 'color-mix(in srgb, var(--shade) 40%, transparent)', border: '1px solid color-mix(in srgb, var(--fg) min(100%, calc(9% * var(--line-k))), transparent)', borderRadius: '8px', color: 'var(--text)', fontSize: '13px', cursor: 'pointer' }
const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '4px', display: 'flex', flexShrink: 0 }
const sendBtn = {
  display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px', borderRadius: '9px', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
  background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent-text)', fontWeight: 600, fontSize: '13px', cursor: 'pointer',
}
const plainBtn = { ...sendBtn, background: 'none', border: '1px solid color-mix(in srgb, var(--fg) min(100%, calc(9% * var(--line-k))), transparent)', color: 'var(--soft)' }
