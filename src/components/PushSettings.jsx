import { useEffect, useState } from 'react'
import { BellRing, Loader2 } from 'lucide-react'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { track } from '../lib/usage'
import { pushSupport, currentSubscription, turnOn, turnOff, sendTest } from '../lib/push'
import { t } from '../i18n'

// Account → Notifications on this device (docs/MESSAGING.md, M5a). Per device: each phone or
// computer turns them on for itself.
export default function PushSettings() {
  const { notify } = useToast()
  const support = pushSupport()
  const [on, setOn] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (support !== 'ok') return
    currentSubscription().then(sub => setOn(!!sub && Notification.permission === 'granted')).catch(() => setOn(false))
  }, [support])

  async function toggle(next) {
    setBusy(true)
    try {
      if (next) {
        const result = await turnOn()
        if (result === 'denied') notify(t('push.denied'), 'error', { duration: 10000 })
        else { setOn(true); track('push:on'); notify(t('push.onNow'), 'success') }
      } else {
        await turnOff()
        setOn(false)
        track('push:off')
      }
    } catch (err) {
      logger.error('push', err, { step: next ? 'on' : 'off' })
      notify(t('push.failed', { reason: userMessage(err) }), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function test() {
    setBusy(true)
    try {
      const sent = await sendTest()
      if (sent === 'rate_limited') notify(t('push.testRateLimited'), 'info')
      else if (!sent) notify(t('push.testNone'), 'info')
    } catch (err) {
      notify(t('push.failed', { reason: userMessage(err) }), 'error')
    } finally {
      setBusy(false)
    }
  }

  const hint = { display: 'block', color: 'var(--muted)', fontSize: '12px', marginTop: '3px', lineHeight: 1.5 }
  if (support !== 'ok') return (
    <div style={{ fontSize: '14px' }}>
      <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}><BellRing size={14} /> {t('push.title')}</span>
      <span style={hint}>{t(support === 'install' ? 'push.installFirst' : 'push.unsupported')}</span>
    </div>
  )
  return (
    <div>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: busy || on === null ? 'default' : 'pointer', fontSize: '14px' }}>
        <input type="checkbox" checked={!!on} disabled={busy || on === null} onChange={e => toggle(e.target.checked)}
          style={{ marginTop: '3px', accentColor: 'var(--accent)' }} />
        <span>
          <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
            {t('push.title')} {busy && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />}
          </span>
          <span style={hint}>{t('push.hint')}</span>
        </span>
      </label>
      {on && (
        <button type="button" onClick={test} disabled={busy} style={{ marginTop: '8px', marginLeft: '26px', background: 'none', border: '1px solid color-mix(in srgb, var(--fg) min(100%, calc(12% * var(--line-k))), transparent)', borderRadius: '8px', color: 'var(--soft)', padding: '5px 10px', fontSize: '12px', cursor: 'pointer' }}>
          {t('push.test')}
        </button>
      )}
    </div>
  )
}
