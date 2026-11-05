import { X } from 'lucide-react'

// Lumen and Pixel brand system (Brand Book v1.2, DESIGN.md): every corner is square, no gradients,
// no glows, no blur. Names, labels and numbers in Space Mono (var(--font-mono)); sentences in Inter.

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
  display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px', borderRadius: 0,
  border: '1px solid color-mix(in srgb, var(--fg) min(100%, calc(28% * var(--line-k))), transparent)', background: 'transparent', color: 'var(--text)',
  fontWeight: 600, fontSize: '13px', cursor: 'pointer', flexShrink: 0,
}
export const btnPrimary = {
  ...btn, border: '1px solid var(--accent)', color: 'var(--on-accent)', fontWeight: 600, fontSize: '14px', padding: '10px 18px',
  background: colors.accent,
}
export const btnDanger = { ...btn, background: 'transparent', borderColor: 'var(--danger)', color: 'var(--text)' }
export const iconBtn = {
  background: 'none', border: 'none', cursor: 'pointer', color: colors.muted,
  padding: '6px', display: 'flex', alignItems: 'center', flexShrink: 0, borderRadius: 0,
}
export const input = {
  width: '100%', padding: '10px 12px', background: 'color-mix(in srgb, var(--shade) 40%, transparent)', border: '1px solid color-mix(in srgb, var(--fg) min(100%, calc(9% * var(--line-k))), transparent)',
  borderRadius: 0, color: 'var(--text)', fontSize: '14px', outline: 'none',
}
export const card = {
  background: 'color-mix(in srgb, var(--fg) min(100%, calc(3% * var(--line-k))), transparent)', border: `1px solid ${colors.border}`, borderRadius: 0, padding: '14px 16px',
}
export const label = {
  display: 'block', fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, color: colors.muted,
  textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: '6px',
}

export function Modal({ title, onClose, children, maxWidth = 480 }) {
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{
      position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.72)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'calc(16px + var(--safe-top)) 16px 16px',
    }}>
      <div role="dialog" aria-modal="true" aria-label={title} style={{
        background: colors.panel, border: '1px solid color-mix(in srgb, var(--fg) min(100%, calc(18% * var(--line-k))), transparent)', borderRadius: 0, color: 'var(--text)',
        padding: '22px', width: '100%', maxWidth: `${maxWidth}px`, maxHeight: 'calc(100vh - 32px - var(--safe-top))', overflowY: 'auto',
        animation: 'fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '12px' }}>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '17px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h2>
          <button onClick={onClose} aria-label="Close" style={iconBtn}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

// The AVX glyph (Brand Book v1.2 §15): the slanted bolt on the 5×5 grid, cells D1 · B2 C2 · A3–E3 · C4 D4 · B5.
// One colour, square cells, never rounded, outlined or glowing. Colour comes from CSS `color`.
export function AvxMark({ size = 20, title, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 5 5" shapeRendering="crispEdges" role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : 'true'} aria-label={title} style={{ display: 'block', flexShrink: 0, ...style }}>
      <path fill="currentColor" d="M3 0h1v1H3z M1 1h2v1H1z M0 2h5v1H0z M2 3h2v1H2z M1 4h1v1H1z" />
    </svg>
  )
}
