import { X } from 'lucide-react'

// Shared building blocks and style tokens for new components.
// (Older pages still use inline styles; they move here gradually — see ROADMAP Phase 2b.)

export const colors = {
  bg: '#080C14', panel: '#0F1520', text: '#fff', muted: '#7D93A9', soft: '#8A9BAE',
  accent: '#1EC878', accentDark: '#0FA85A', danger: '#F87171', border: 'rgba(255,255,255,0.07)',
}

export const btn = {
  display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px', borderRadius: '9px',
  border: '1px solid rgba(30,200,120,0.3)', background: 'rgba(30,200,120,0.12)', color: colors.accent,
  fontWeight: 600, fontSize: '13px', cursor: 'pointer', flexShrink: 0,
}
export const btnPrimary = {
  ...btn, border: 'none', color: '#fff', fontWeight: 700, fontSize: '14px', padding: '10px 18px',
  background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentDark})`, boxShadow: '0 4px 16px rgba(30,200,120,0.25)',
}
export const btnDanger = { ...btn, background: 'transparent', borderColor: 'rgba(239,68,68,0.3)', color: colors.danger }
export const iconBtn = {
  background: 'none', border: 'none', cursor: 'pointer', color: colors.muted,
  padding: '6px', display: 'flex', alignItems: 'center', flexShrink: 0, borderRadius: '6px',
}
export const input = {
  width: '100%', padding: '10px 12px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: '9px', color: '#fff', fontSize: '14px', outline: 'none',
}
export const card = {
  background: 'rgba(255,255,255,0.03)', border: `1px solid ${colors.border}`, borderRadius: '14px', padding: '14px 16px',
}
export const label = {
  display: 'block', fontSize: '12px', fontWeight: 600, color: colors.muted,
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px',
}

export function Modal({ title, onClose, children, maxWidth = 480 }) {
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{
      position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'calc(16px + var(--safe-top)) 16px 16px',
    }}>
      <div role="dialog" aria-modal="true" aria-label={title} style={{
        background: colors.panel, border: '1px solid rgba(255,255,255,0.1)', borderRadius: '18px', color: '#fff',
        padding: '22px', width: '100%', maxWidth: `${maxWidth}px`, maxHeight: 'calc(100vh - 32px - var(--safe-top))', overflowY: 'auto',
        animation: 'fadeIn 0.2s ease',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '12px' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h2>
          <button onClick={onClose} aria-label="Close" style={iconBtn}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}
