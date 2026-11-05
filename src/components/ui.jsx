import { X } from 'lucide-react'
import { labelVar } from '../lib/labelColours'

// Lumen and Pixel brand system (Brand Book v1.2, DESIGN.md): every corner is square, no gradients,
// no glows, no blur. Names, labels and numbers in Space Mono (var(--font-mono)); sentences in Inter.

// Shared building blocks and style tokens for new components.
// (Older pages still use inline styles; they move here gradually — see ROADMAP Phase 2b.)

// Colours are CSS variables set by the theme (src/theme/tokens.js), so they follow the theme the
// person chose. accent is for fills and borders; accentText for green text and icons.
export const colors = {
  bg: 'var(--bg)', panel: 'var(--panel)', text: 'var(--text)', muted: 'var(--muted)', soft: 'var(--soft)',
  accent: 'var(--accent)', accentText: 'var(--accent-text)', accentDark: 'var(--accent-2)', onAccent: 'var(--on-accent)', danger: 'var(--danger)',
  border: 'var(--line)', line: 'var(--line)', lineStrong: 'var(--line-strong)', fill: 'var(--fill)', hover: 'var(--hover)',
  chrome: 'var(--chrome)', selection: 'var(--selection)', text2: 'var(--text-2)',
  warn: 'var(--warn)', info: 'var(--info)', dangerSoft: 'var(--danger-soft)', warnSoft: 'var(--warn-soft)', overlay: 'var(--overlay)', focus: 'var(--focus)',
}

// A see-through version of a colour (any CSS colour, variables included), e.g. tint(colors.accent, 12)
export const tint = (color, percent) => `color-mix(in srgb, ${color} ${percent}%, transparent)`

export const btn = {
  display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px',
  border: '1px solid var(--line-strong)', background: 'transparent', color: 'var(--text)',
  fontWeight: 600, fontSize: '13px', cursor: 'pointer', flexShrink: 0, fontFamily: 'var(--font-ui)',
}
export const btnPrimary = {
  ...btn, border: '1px solid var(--accent)', color: 'var(--on-accent)', fontWeight: 600, fontSize: '14px', padding: '10px 18px',
  background: colors.accent,
}
export const btnDanger = { ...btn, background: 'transparent', borderColor: 'var(--danger)', color: 'var(--text)' }
export const iconBtn = {
  background: 'none', border: 'none', cursor: 'pointer', color: colors.muted,
  padding: '6px', display: 'flex', alignItems: 'center', flexShrink: 0,
}
export const input = {
  width: '100%', padding: '10px 12px', background: 'var(--shade)', border: '1px solid var(--line-strong)',
  color: 'var(--text)', fontSize: '14px', outline: 'none',
}
export const card = {
  background: 'var(--panel)', border: '1px solid var(--line)', padding: '14px 16px',
}
// Anything you could copy into a spreadsheet (times, dates, money, quantities, serials, codes)
export const mono = { fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }
export const label = {
  display: 'block', fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, color: colors.muted,
  textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: '6px',
}

export function Modal({ title, onClose, children, maxWidth = 480 }) {
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{
      position: 'fixed', inset: 0, zIndex: 100, background: 'var(--overlay)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'calc(16px + var(--safe-top)) 16px 16px',
    }}>
      <div role="dialog" aria-modal="true" aria-label={title} style={{
        background: colors.panel, border: '1px solid var(--line-strong)', color: 'var(--text)',
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

// Every state is a square + the word (DESIGN.md "StatusBadge"). tone: ok · info · warn · danger · open · draft · off;
// colour: a label colour key for an organisation's own status (its square takes that colour).
export function StatusBadge({ tone = 'open', colour, small, struck, title, children }) {
  const cls = `avx-status avx-status--${tone}${small ? ' avx-status--sm' : ''}${struck ? ' avx-status--struck' : ''}`
  return <span className={cls} title={title} style={colour ? { '--c': labelVar(colour) } : undefined}><span>{children}</span></span>
}


// A label: a square in the label colour + the label's word, on fill. role: Space Mono uppercase, no colour.
export function LabelChip({ colour, role, large, title, children }) {
  if (role) return <span className={`avx-chip avx-chip--role${large ? ' avx-chip--lg' : ''}`} title={title}><span>{children}</span></span>
  return <span className="avx-chip" title={title} style={{ '--c': labelVar(colour) }}><i aria-hidden="true" /><span>{children}</span></span>
}

// A call time: key (CALL, DOORS…) + time. me: the viewer's own call, with the accent key cell.
export function CallChip({ label, time, me, small, title }) {
  return <span className={`avx-call${me ? ' avx-call--me' : ''}${small ? ' avx-call--sm' : ''}`} title={title}><span>{label}</span><b>{time}</b></span>
}

// A person's initials in a square (never coloured)
export function Avatar({ name, size = 32 }) {
  const initials = (name || '?').split(' ').filter(Boolean).map(x => x[0]).join('').toUpperCase().slice(0, 2) || '?'
  return <span aria-hidden="true" className="avx-avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}>{initials}</span>
}
