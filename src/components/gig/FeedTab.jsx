import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Send, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { useI18n } from '../../i18n'
import { colors } from '../ui'
import { FeedPost, TabHeader } from './parts'

export default function FeedTab({ gigId, posts, userId, isPM, nameOf, onChanged }) {
  const { t } = useI18n()
  const { notify } = useToast()
  const [text, setText] = useState('')
  const [important, setImportant] = useState(false)
  const [posting, setPosting] = useState(false)
  const endRef = useRef()

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [posts.length])

  async function post() {
    if (!text.trim()) return
    setPosting(true)
    const { error } = await supabase.from('feed_posts').insert({ gig_id: gigId, user_id: userId, content: text.trim(), is_important: important })
    setPosting(false)
    if (error) {
      logger.error('feed', error, { step: 'post', gigId })
      return notify(t('feed.postFailed', { reason: userMessage(error) }), 'error')
    }
    setText('')
    setImportant(false)
    onChanged()
  }

  async function remove(p) {
    if (!window.confirm(t('feed.confirmDelete'))) return
    const { error } = await supabase.from('feed_posts').delete().eq('id', p.id)
    if (error) {
      logger.error('feed', error, { step: 'delete', postId: p.id })
      return notify(t('feed.deleteFailed', { reason: userMessage(error) }), 'error')
    }
    onChanged()
  }

  const canPost = text.trim().length > 0

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <TabHeader title={t('feed.title')} subtitle={t('feed.subtitle')} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
        {posts.length === 0 && <div style={{ textAlign: 'center', padding: '40px 20px', color: '#7D93A9', fontSize: '14px' }}>{t('feed.empty')}</div>}
        {posts.map(p => (
          <FeedPost key={p.id} post={p} name={nameOf(p.user_id)} large
            onDelete={(p.user_id === userId || isPM) ? () => remove(p) : null} />
        ))}
        <div ref={endRef} />
      </div>

      <div style={{
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px',
        padding: '16px', position: 'sticky', bottom: '16px', backdropFilter: 'blur(12px)',
      }}>
        <textarea value={text} onChange={e => setText(e.target.value)} aria-label={t('feed.placeholder')}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) post() }}
          placeholder={t('feed.placeholder')} rows={2} maxLength={5000}
          style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: '14px', resize: 'none', lineHeight: 1.6, marginBottom: '10px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={() => setImportant(v => !v)} aria-pressed={important} style={{
            display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer',
            background: important ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)',
            border: important ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(255,255,255,0.08)',
            color: important ? colors.danger : colors.muted, fontSize: '12px', fontWeight: 600,
          }}>
            <AlertCircle size={13} /> {important ? t('feed.important') : t('feed.markImportant')}
          </button>
          <button onClick={post} disabled={posting || !canPost} style={{
            display: 'flex', alignItems: 'center', gap: '6px', border: 'none', borderRadius: '8px', padding: '8px 16px',
            background: canPost ? `linear-gradient(135deg, ${colors.accent}, ${colors.accentDark})` : 'rgba(255,255,255,0.05)',
            color: canPost ? '#fff' : '#7D93A9', cursor: canPost ? 'pointer' : 'default', fontSize: '13px', fontWeight: 700,
          }}>
            {posting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />} {t('feed.post')}
          </button>
        </div>
      </div>
    </div>
  )
}
