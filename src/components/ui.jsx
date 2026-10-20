import { X } from 'lucide-react'

// Shared building blocks and style tokens for new components.
// (Older pages still use inline styles; they move here gradually — see ROADMAP Phase 2b.)

// Colours are CSS variables set by the theme (src/theme/tokens.js), so they follow the theme the
// person chose. accent is for fills and borders; accentText for green text and icons.
export const colors = {
  bg: 'var(--bg)', panel: 'var(--panel)', text: 'var(--text)', muted: 'var(--muted)', soft: 'var(--soft)',
  accent: 'var(--accent)', accentText: 'var(--accent-text)', accentDark: 'var(--accent-2)', onAccent: 'var(--on-accent)', danger: 'var(--danger)',
  border: 'color-mix(in srgb, var(--fg) min(100%, calc(7% * var(--line-k))), transparent)',
}

// A see-through version of a colour (any CSS colour, variables included), e.g. tint(colors.accent, 12)
export const tint = (color, percent) => `color-mix(in srgb, ${color} ${percent}%, transparent)`

export const btn = {
  display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px', borderRadius: '9px',
  border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: colors.accentText,
  fontWeight: 600, fontSize: '13px', cursor: 'pointer', flexShrink: 0,
}
export const btnPrimary = {
  ...btn, border: 'none', color: 'var(--on-accent)', fontWeight: 700, fontSize: '14px', padding: '10px 18px',
  background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentDark})`, boxShadow: '0 4px 16px color-mix(in srgb, var(--accent) 25%, transparent)',
}
export const btnDanger = { ...btn, background: 'transparent', borderColor: 'color-mix(in srgb, var(--danger) 30%, transparent)', color: colors.danger }
export const iconBtn = {
  background: 'none', border: 'none', cursor: 'pointer', color: colors.muted,
  padding: '6px', display: 'flex', alignItems: 'center', flexShrink: 0, borderRadius: '6px',
}
export const input = {
  width: '100%', padding: '10px 12px', background: 'color-mix(in srgb, var(--shade) 40%, transparent)', border: '1px solid color-mix(in srgb, var(--fg) min(100%, calc(9% * var(--line-k))), transparent)',
  borderRadius: '9px', color: 'var(--text)', fontSize: '14px', outline: 'none',
}
export const card = {
  background: 'color-mix(in srgb, var(--fg) min(100%, calc(3% * var(--line-k))), transparent)', border: `1px solid ${colors.border}`, borderRadius: '14px', padding: '14px 16px',
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
        background: colors.panel, border: '1px solid color-mix(in srgb, var(--fg) min(100%, calc(10% * var(--line-k))), transparent)', borderRadius: '18px', color: 'var(--text)',
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
