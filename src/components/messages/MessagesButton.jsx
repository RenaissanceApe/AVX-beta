import { Link } from 'react-router-dom'
import { MessageCircle } from 'lucide-react'
import { useConversations } from '../../lib/useMessages'
import { t } from '../../i18n'
import { iconBtn, colors } from '../ui'

// Top bar link to Messages, with how many messages you haven't read
export default function MessagesButton() {
  const { unread } = useConversations()
  return (
    <Link to="/messages" aria-label={unread ? t('chat.buttonUnread', { count: unread }) : t('chat.title')} title={t('chat.title')}
      style={{ ...iconBtn, position: 'relative', color: unread ? 'var(--text)' : colors.muted }}>
      <MessageCircle size={17} />
      {unread > 0 && (
        <span style={{
          position: 'absolute', top: '1px', right: '0', minWidth: '16px', height: '16px', padding: '0 4px', borderRadius: '8px',
          background: colors.accent, color: 'var(--on-accent)', fontSize: '10px', fontWeight: 800, lineHeight: '16px', textAlign: 'center',
        }}>{unread > 9 ? '9+' : unread}</span>
      )}
    </Link>
  )
}
