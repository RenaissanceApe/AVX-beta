import { useEffect, useState } from 'react'
import { MessagesSquare, ChevronDown, ChevronRight, Loader2, Eye } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { t } from '../../i18n'
import { colors } from '../ui'
import Conversation from './Conversation'

// The team's conversation about one thing — an equipment item, a repair, a subrental
// (docs/MESSAGING.md, M4) — or the conversation with someone outside who has a link: a quote's
// client ('quote') or a subrental's supplier ('supplier'), M4b. For the organisation's admins and
// members. Closed until opened; opening it the first time starts the conversation.
const GUEST_TYPES = new Set(['quote', 'supplier'])

export default function ContextThread({ type, id, height = '320px', children }) {
  const guest = GUEST_TYPES.has(type)
  const { notify } = useToast()
  const [open, setOpen] = useState(false)
  const [convId, setConvId] = useState(null)
  const [count, setCount] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let on = true
    setOpen(false); setConvId(null); setCount(null)
    ;(async () => {
      const { data: conv } = await supabase.from('conversations').select('id')
        .eq('kind', 'context').eq('context_type', type).eq('context_id', id).maybeSingle()
      if (!conv) { if (on) setCount(0); return }
      const { count: n } = await supabase.from('messages').select('id', { count: 'exact', head: true }).eq('conversation_id', conv.id)
      if (on) { setConvId(conv.id); setCount(n || 0) }
    })()
    return () => { on = false }
  }, [type, id])

  async function toggle() {
    if (open) return setOpen(false)
    if (!convId) {
      setBusy(true)
      const { data, error } = await supabase.rpc('context_conversation', { p_type: type, p_id: id })
      setBusy(false)
      if (error) { logger.error('messages', error, { step: 'context' }); return notify(userMessage(error), 'error') }
      setConvId(data)
    }
    setOpen(true)
  }

  return (
    <div style={{ border: `1px solid ${colors.border}`, borderRadius: '12px', overflow: 'hidden' }}>
      <button type="button" onClick={toggle} aria-expanded={open} style={{
        display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '10px 12px', background: 'color-mix(in srgb, var(--fg) min(100%, calc(2% * var(--line-k))), transparent)',
        border: 'none', color: 'var(--text)', font: 'inherit', fontSize: '14px', fontWeight: 600, cursor: 'pointer', textAlign: 'left',
      }}>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <MessagesSquare size={16} color={colors.accentText} />
        <span style={{ flex: 1 }}>{guest ? t(`chat.guest.title.${type}`) : t('chat.context.title')}</span>
        {busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
          : count > 0 && <span style={{ fontSize: '12px', fontWeight: 400, color: colors.muted }}>{t('chat.context.count', { count })}</span>}
      </button>
      {open && (guest || children) && (
        <div style={{ padding: '8px 12px 0' }}>
          {guest && (
            <p style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', fontSize: '12px', color: 'var(--warn)', lineHeight: 1.5, marginBottom: children ? '8px' : 0 }}>
              <Eye size={13} style={{ flexShrink: 0, marginTop: '2px' }} /> {t(`chat.guest.notice.${type}`)}
            </p>
          )}
          {children}
        </div>
      )}
      {open && convId && (
        <div style={{ padding: '0 8px 8px' }}>
          <Conversation conversationId={convId} height={height} emptyText={t(`chat.context.empty.${type}`)} />
        </div>
      )}
    </div>
  )
}
