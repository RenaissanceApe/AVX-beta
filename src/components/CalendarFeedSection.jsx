import { useState } from 'react'
import { CalendarPlus, Copy, RefreshCw, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { track } from '../lib/usage'
import { useI18n } from '../i18n'

// The person's gigs in their phone's own calendar (docs/SWITCHING.md, S4): a private feed link the
// calendar subscribes to (the calendar-feed Edge Function). The link is shown on request, can be
// added to Apple or Google Calendar, copied, or replaced when it was shared by mistake.
export const feedUrl = token => `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calendar-feed?t=${token}`

export default function CalendarFeedSection({ label, input, smallBtn }) {
  const { notify } = useToast()
  const { t } = useI18n()
  const [token, setToken] = useState(null)
  const [busy, setBusy] = useState(false)

  async function load(fresh) {
    if (fresh && !window.confirm(t('calFeed.newConfirm'))) return
    setBusy(true)
    const { data, error } = await supabase.rpc('calendar_feed', { p_new: !!fresh })
    setBusy(false)
    if (error) { logger.error('feed', error, { step: fresh ? 'new' : 'show' }); return notify(userMessage(error), 'error') }
    setToken(data)
    track(fresh ? 'feed:new' : 'feed:show')
    if (fresh) notify(t('calFeed.replaced'), 'success')
  }
  async function copy() {
    try { await navigator.clipboard.writeText(feedUrl(token)); notify(t('calFeed.copied'), 'success') } catch { /* not allowed */ }
  }

  const url = token ? feedUrl(token) : ''
  const webcal = url.replace(/^https?:/, 'webcal:')
  return (
    <div>
      <span style={label} id="feed-title">{t('calFeed.title')}</span>
      <p style={{ color: 'var(--muted)', fontSize: '12px', lineHeight: 1.5, marginBottom: '10px' }}>{t('calFeed.intro')}</p>
      {!token ? (
        <button type="button" onClick={() => load(false)} disabled={busy} style={smallBtn}>
          {busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CalendarPlus size={14} />} {t('calFeed.show')}
        </button>
      ) : (
        <>
          <input readOnly value={url} aria-labelledby="feed-title" onFocus={e => e.target.select()} style={{ ...input, fontSize: '12px', fontFamily: 'var(--font-mono)', marginBottom: '8px' }} />
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <a href={webcal} style={{ ...smallBtn, textDecoration: 'none' }}><CalendarPlus size={14} /> {t('calFeed.apple')}</a>
            <a href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`} target="_blank" rel="noopener noreferrer" style={{ ...smallBtn, textDecoration: 'none' }}>
              <CalendarPlus size={14} /> {t('calFeed.google')}
            </a>
            <button type="button" onClick={copy} style={smallBtn}><Copy size={14} /> {t('calFeed.copy')}</button>
            <button type="button" onClick={() => load(true)} disabled={busy} style={{ ...smallBtn, background: 'transparent' }}>
              {busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={14} />} {t('calFeed.new')}
            </button>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '12px', lineHeight: 1.5, marginTop: '8px' }}>{t('calFeed.private')}</p>
        </>
      )}
    </div>
  )
}
