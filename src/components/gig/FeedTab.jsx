import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Send, MessageSquare } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { useI18n } from '../../i18n'
import { colors, AvxLoader } from '../ui'
import EmptyState from '../EmptyState'
import { FeedPost, TabHeader, rowLine } from './parts'

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
      <TabHeader title={t('feed.title')} hint={t('feed.subtitle')} />
      <div style={{ marginBottom: 'var(--space-5)' }}>
        {posts.length === 0 && <EmptyState compact icon={<MessageSquare size={24} />} title={t('feed.empty')} />}
        {/* Posts as rows with hairlines between them, not a card each (DESIGN.md "One box deep") */}
        {posts.map((p, i) => (
          <div key={p.id} style={rowLine(i)}>
            <FeedPost post={p} name={nameOf(p.user_id)} large
              onDelete={(p.user_id === userId || isPM) ? () => remove(p) : null} />
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div style={{
        background: 'var(--panel)', border: '1px solid var(--line-strong)',
        padding: 'var(--space-4)', position: 'sticky', bottom: 'var(--space-4)',
      }}>
        <textarea value={text} onChange={e => setText(e.target.value)} aria-label={t('feed.placeholder')}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) post() }}
          placeholder={t('feed.placeholder')} rows={2} maxLength={5000}
          style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: '14px', resize: 'none', lineHeight: 1.6, marginBottom: 'var(--space-3)' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <button onClick={() => setImportant(v => !v)} aria-pressed={important} style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', cursor: 'pointer',
            background: important ? 'var(--danger-soft)' : 'transparent',
            border: important ? '1px solid var(--danger)' : '1px solid var(--line-strong)',
            color: important ? colors.danger : colors.muted, fontSize: '13px', fontWeight: 600,
          }}>
            <AlertCircle size={14} aria-hidden="true" /> {important ? t('feed.important') : t('feed.markImportant')}
          </button>
          <button onClick={post} disabled={posting || !canPost} style={{
            display: 'flex', alignItems: 'center', gap: '8px', border: 'none', padding: '8px 16px',
            background: canPost ? colors.accent : 'var(--line)',
            color: canPost ? 'var(--on-accent)' : 'var(--muted)', cursor: canPost ? 'pointer' : 'default', fontSize: '14px', fontWeight: 600,
          }}>
            {posting ? <AvxLoader size={14} /> : <Send size={14} />} {t('feed.post')}
          </button>
        </div>
      </div>
    </div>
  )
}
