import { WifiOff } from 'lucide-react'
import { useOnline } from '../lib/offline'
import { useI18n } from '../i18n'

// Thin bar shown while there's no connection, or when a page is showing its saved copy.
export default function OfflineBanner({ savedAt = null }) {
  const online = useOnline()
  const { t, ago } = useI18n()
  if (online && !savedAt) return null
  return (
    <div role="status" style={{
      position: 'sticky', top: 'var(--safe-top)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
      padding: '7px 12px', background: '#3A2A08', color: '#FBBF24', fontSize: '13px', fontWeight: 600, textAlign: 'center',
    }}>
      <WifiOff size={14} />
      <span>
        {online ? t('offline.savedCopy') : t('offline.banner')}
        {savedAt && ` · ${t('offline.savedAt', { when: ago(savedAt) })}`}
      </span>
    </div>
  )
}
