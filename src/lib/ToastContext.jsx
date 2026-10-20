import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react'
import { t } from '../i18n'

// Lightweight in-app notifications, replacing window.alert().
const ToastContext = createContext({ notify: () => {} })

const KIND = {
  success: { icon: CheckCircle, color: 'var(--accent-text)', border: 'color-mix(in srgb, var(--accent) 35%, transparent)' },
  error:   { icon: AlertCircle, color: 'var(--danger)', border: 'color-mix(in srgb, var(--danger) 35%, transparent)' },
  info:    { icon: Info,        color: 'var(--info)', border: 'color-mix(in srgb, var(--info) 35%, transparent)' },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const nextId = useRef(1)

  const dismiss = useCallback(id => setToasts(list => list.filter(item => item.id !== id)), [])

  const notify = useCallback((message, kind = 'info', { duration } = {}) => {
    const id = nextId.current++
    setToasts(list => [...list.slice(-3), { id, message, kind }])
    const ms = duration ?? (kind === 'error' ? 8000 : 5000)
    if (ms > 0) setTimeout(() => dismiss(id), ms)
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div aria-live="polite" style={{
        position: 'fixed', bottom: '16px', left: '50%', transform: 'translateX(-50%)',
        display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 1000,
        width: 'min(440px, calc(100vw - 32px))', pointerEvents: 'none'
      }}>
        {toasts.map(toast => {
          const cfg = KIND[toast.kind] || KIND.info
          const Icon = cfg.icon
          return (
            <div key={toast.id} role={toast.kind === 'error' ? 'alert' : 'status'} style={{
              pointerEvents: 'auto', display: 'flex', alignItems: 'flex-start', gap: '10px',
              background: 'var(--panel)', border: `1px solid ${cfg.border}`, borderRadius: '12px',
              padding: '12px 14px', color: 'var(--text)', fontSize: '14px', lineHeight: '1.5',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)', whiteSpace: 'pre-line', wordBreak: 'break-word'
            }}>
              <Icon size={18} color={cfg.color} style={{ flexShrink: 0, marginTop: '1px' }} />
              <div style={{ flex: 1 }}>{toast.message}</div>
              <button onClick={() => dismiss(toast.id)} aria-label={t('common.dismiss')} style={{
                background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 0, display: 'flex'
              }}>
                <X size={15} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
