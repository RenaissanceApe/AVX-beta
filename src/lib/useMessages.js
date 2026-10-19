import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { logger } from './logger'
import { useAuth } from './AuthContext'
import { totalUnread } from './messages'

// Fired after reading a conversation, so every list and badge refreshes
export const MESSAGES_READ = 'avx:messages-read'

// Each use gets its own realtime channel (the top bar and the Messages page both listen)
let nextChannel = 0

// Your conversations (direct and gig channels), kept up to date live: any new message you
// can see, or reading one somewhere else, reloads the list.
export function useConversations() {
  const { user } = useAuth()
  const [conversations, setConversations] = useState(null)
  const timer = useRef(null)

  const reload = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_inbox')
    if (error) return logger.warn('messages', 'Conversation list failed', { code: error.code })
    setConversations(data || [])
  }, [])

  useEffect(() => {
    if (!user) return
    reload()
    const soon = () => { clearTimeout(timer.current); timer.current = setTimeout(reload, 400) }
    const channel = supabase.channel(`my-messages-${user.id}-${++nextChannel}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, soon)
      .subscribe()
    window.addEventListener(MESSAGES_READ, soon)
    return () => { clearTimeout(timer.current); supabase.removeChannel(channel); window.removeEventListener(MESSAGES_READ, soon) }
  }, [user?.id, reload]) // eslint-disable-line react-hooks/exhaustive-deps

  return { conversations, unread: totalUnread(conversations), reload }
}
