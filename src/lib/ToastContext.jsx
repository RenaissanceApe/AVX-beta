import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react'

// Lightweight in-app notifications, replacing window.alert().
const ToastContext = createContext({ notify: () => {} })

const KIND = {
  success: { icon: CheckCircle, color: '#1EC878', border: 'rgba(30,200,120,0.35)' },
  error:   { icon: AlertCircle, color: '#F87171', border: 'rgba(239,68,68,0.35)' },
  info:    { icon: Info,        color: '#60A5FA', border: 'rgba(59,130,246,0.35)' },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const nextId = useRef(1)

  const dismiss = useCallback(id => setToasts(list => list.filter(t => t.id !== id)), [])

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
        {toasts.map(t => {
          const cfg = KIND[t.kind] || KIND.info
          const Icon = cfg.icon
          return (
            <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'} style={{
              pointerEvents: 'auto', display: 'flex', alignItems: 'flex-start', gap: '10px',
              background: '#0F1520', border: `1px solid ${cfg.border}`, borderRadius: '12px',
              padding: '12px 14px', color: '#fff', fontSize: '14px', lineHeight: '1.5',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)', whiteSpace: 'pre-line', wordBreak: 'break-word'
            }}>
              <Icon size={18} color={cfg.color} style={{ flexShrink: 0, marginTop: '1px' }} />
              <div style={{ flex: 1 }}>{t.message}</div>
              <button onClick={() => dismiss(t.id)} aria-label="Dismiss" style={{
                background: 'none', border: 'none', color: '#4A6070', cursor: 'pointer', padding: 0, display: 'flex'
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
