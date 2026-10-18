import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { logger } from '../../lib/logger'
import { t } from '../../i18n'
import Conversation from '../messages/Conversation'
import { card, colors } from '../ui'

// The gig's channel (MESSAGING.md, M1): everyone on the gig talks here, and changes to the
// gig's status, dates and venue show up as they happen. Viewers can read it but not post.
export default function ChatTab({ gigId, canPost }) {
  const [conversationId, setConversationId] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    supabase.rpc('gig_conversation', { p_gig: gigId }).then(({ data, error }) => {
      if (cancelled) return
      if (error) { logger.warn('messages', 'Gig channel failed', { code: error.code }); return setFailed(true) }
      setConversationId(data)
    })
    return () => { cancelled = true }
  }, [gigId])

  if (failed) return <p style={{ color: colors.muted, fontSize: '14px', textAlign: 'center', padding: '40px 16px' }}>{t('chat.unavailable')}</p>
  if (!conversationId) return <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><Loader2 size={20} color={colors.accent} style={{ animation: 'spin 1s linear infinite' }} /></div>
  return (
    <div style={{ ...card, padding: '10px 12px' }}>
      <Conversation conversationId={conversationId} canPost={canPost} height="62vh" emptyText={t('chat.emptyGig')} />
    </div>
  )
}
