import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { pageZoom } from '../lib/appearance'
import { useAuth } from '../lib/AuthContext'
import { logger } from '../lib/logger'
import { describeNotification, notificationLink, countsAsUnread } from '../lib/notifications'
import { useWorkspace, NOTIFICATIONS_CHANGED } from '../lib/WorkspaceContext'
import { useI18n } from '../i18n'
import { colors, iconBtn } from './ui'

const LIMIT = 30

// Bell with unread count; the list updates live via Supabase Realtime.
export default function NotificationBell() {
  const { user } = useAuth()
  const { mutedIds } = useWorkspace()
  const { t, ago } = useI18n()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [names, setNames] = useState({})
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState(null)
  const panelRef = useRef()
  const buttonRef = useRef()

  async function load() {
    const { data, error } = await supabase.from('notifications').select('*')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(LIMIT)
    if (error) return logger.error('notifications', error, { step: 'load' })
    setItems(data || [])
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED))
    const ids = [...new Set((data || []).map(n => n.actor_id).filter(Boolean))]
    if (ids.length) {
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', ids)
      setNames(Object.fromEntries((profiles || []).map(p => [p.id, p.full_name])))
    }
  }

  useEffect(() => {
    if (!user) return
    load()
    const channel = supabase.channel(`notifications-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // The panel sits under the bell but always inside the screen: on a phone the bell isn't at the
  // right edge (the account button is), so lining it up with the bell pushed it off the left side
  function toggle() {
    if (open) return setOpen(false)
    const r = buttonRef.current.getBoundingClientRect()
    const width = Math.min(360, window.innerWidth - 24)
    const right = Math.max(12, Math.min(window.innerWidth - r.right, window.innerWidth - width - 12))
    const z = pageZoom() // with a larger text size, the page is zoomed: place in its units
    setPlace({ top: (r.bottom + 8) / z, right: right / z, width: width / z })
    setOpen(true)
  }

  // Close on outside click / Escape / a change of screen size
  useEffect(() => {
    if (!open) return
    const onResize = () => setOpen(false)
    window.addEventListener('resize', onResize)
    const onClick = e => { if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false) }
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize) }
  }, [open])

  // Muted organisations stay in the list but don't make the bell light up
  const unread = items.filter(n => countsAsUnread(n, mutedIds)).length
  const unreadAny = items.some(n => !n.read_at)
  const nameOf = id => names[id] || t('common.someone')

  async function markRead(ids) {
    if (!ids.length) return
    const now = new Date().toISOString()
    setItems(list => list.map(n => (ids.includes(n.id) ? { ...n, read_at: n.read_at || now } : n)))
    const { error } = await supabase.from('notifications').update({ read_at: now }).in('id', ids)
    if (error) logger.error('notifications', error, { step: 'markRead' })
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED))
  }

  function openItem(n) {
    markRead(n.read_at ? [] : [n.id])
    setOpen(false)
    navigate(notificationLink(n))
  }

  return (
    <div ref={panelRef} style={{ position: 'relative' }}>
      <button ref={buttonRef} onClick={toggle} aria-expanded={open} aria-haspopup="true"
        aria-label={unread ? t('notif.bellUnread', { count: unread }) : t('notif.bell')} title={t('notif.bell')}
        style={{ ...iconBtn, position: 'relative', color: unread ? 'var(--text)' : colors.muted }}>
        <Bell size={17} />
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: '1px', right: '0', minWidth: '16px', height: '16px', padding: '0 4px', borderRadius: '8px',
            background: colors.accent, color: 'var(--on-accent)', fontSize: '10px', fontWeight: 800, lineHeight: '16px', textAlign: 'center',
          }}>{unread > 9 ? '9+' : unread}</span>
        )}
      </button>

      {open && place && (
        <div role="dialog" aria-label={t('notif.bell')} style={{
          position: 'fixed', right: `${place.right}px`, top: `${place.top}px`, width: `${place.width}px`, maxHeight: '70vh', overflowY: 'auto',
          background: colors.panel, border: '1px solid color-mix(in srgb, var(--fg) min(100%, calc(10% * var(--line-k))), transparent)', borderRadius: '14px', boxShadow: '0 12px 32px rgba(0,0,0,0.5)', zIndex: 200,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: `1px solid ${colors.border}` }}>
            <strong style={{ fontSize: '14px' }}>{t('notif.bell')}</strong>
            {unreadAny && (
              <button onClick={() => markRead(items.filter(n => !n.read_at).map(n => n.id))}
                style={{ background: 'none', border: 'none', color: colors.accentText, fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCheck size={14} /> {t('notif.markAllRead')}
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p style={{ padding: '24px 14px', color: colors.muted, fontSize: '13px', textAlign: 'center' }}>{t('notif.empty')}</p>
          ) : items.map(n => (
            <button key={n.id} onClick={() => openItem(n)} style={{
              display: 'flex', gap: '10px', width: '100%', textAlign: 'left', padding: '11px 14px', cursor: 'pointer', color: 'var(--text)',
              background: n.read_at ? 'transparent' : 'color-mix(in srgb, var(--accent) 6%, transparent)', border: 'none', borderBottom: `1px solid ${colors.border}`,
            }}>
              <span aria-hidden style={{ width: '7px', height: '7px', borderRadius: '50%', marginTop: '6px', flexShrink: 0, background: n.read_at ? 'transparent' : colors.accent }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: '13px', lineHeight: 1.5 }}>{describeNotification(n, nameOf)}</span>
                <span style={{ display: 'block', fontSize: '11px', color: colors.muted, marginTop: '2px' }}>{ago(n.created_at)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
