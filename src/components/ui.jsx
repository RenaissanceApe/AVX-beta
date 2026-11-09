import { Children, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { X, MoreHorizontal, ChevronRight } from 'lucide-react'
import { useI18n } from '../i18n'
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

// The one loading sign (DESIGN.md "Motion"): the AVX glyph building cell by cell, looping (CSS in index.html).
// Colour follows the text around it unless given. With label it is announced (role="status"); without, it is
// decoration next to words that already say what is happening.
const GLYPH_CELLS = [[3, 0], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [2, 3], [3, 3], [1, 4]]
// The size snaps to a multiple of 5 px so every cell is whole pixels (no seams between cells).
export function AvxLoader({ size = 18, color, label, style }) {
  const px = Math.max(10, Math.round(size / 5) * 5)
  return (
    <svg className="avx-loader" width={px} height={px} viewBox="0 0 5 5" shapeRendering="crispEdges"
      role={label ? 'status' : undefined} aria-label={label} aria-hidden={label ? undefined : 'true'}
      style={{ display: 'inline-block', flexShrink: 0, verticalAlign: 'middle', color, ...style }}>
      {GLYPH_CELLS.map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="currentColor" />)}
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

// ── Layout pieces (DESIGN.md "Room to breathe"; DR1). CSS in src/theme/brand.css, spacing steps in index.html.

// The spacing steps as CSS values: space[3] → 'var(--space-3)' (12px), space.section → 40px phone / 48px desktop.
export const space = {
  1: 'var(--space-1)', 2: 'var(--space-2)', 3: 'var(--space-3)', 4: 'var(--space-4)',
  5: 'var(--space-5)', 6: 'var(--space-6)', 7: 'var(--space-7)', section: 'var(--space-section)',
}

// True below 768px (DESIGN.md "Responsive Behavior"), and follows the window as it changes.
const PHONE_QUERY = '(max-width: 767px)'
export function usePhone() {
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(PHONE_QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia?.(PHONE_QUERY)
    if (!mq) return
    const on = () => setPhone(mq.matches)
    on()
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return phone
}

// Items in a column (or a row) with a gap from the spacing steps (1 to 7, or 'section').
//   <Stack gap={2}><Name /><Meta /></Stack>        within an item: 4–8 (1–2)
//   <Stack gap={3}>{rows}</Stack>                 between items: 12–16 (3–4)
//   <Stack direction="row" gap={2} align="center" wrap>…</Stack>
export function Stack({ gap = 3, direction = 'column', align, justify, wrap, as = 'div', style, children, ...rest }) {
  const Tag = as
  return (
    <Tag {...rest} style={{ display: 'flex', flexDirection: direction, gap: space[gap] ?? space[3], alignItems: align, justifyContent: justify,
      flexWrap: wrap ? 'wrap' : undefined, minWidth: 0, ...style }}>
      {children}
    </Tag>
  )
}

// A page section: a 16px heading, an optional link on the right, then the content on the page ground (no card).
// Sections that follow each other sit 40px (phone) / 48px (desktop) apart on their own.
//   <Section id="key-numbers" title={t('reports.keyNumbers')} link={{ to: '/org/1/reports', label: t('reports.allReports') }}>…</Section>
// id names the heading (aria-labelledby); `aside` takes any other element for the right (a button, a Hint);
// sectionRef reaches the <section> (to scroll to it).
export function Section({ id, title, link, aside, level = 2, sectionRef, children, style, className = '', ...rest }) {
  const H = `h${level}`
  return (
    <section {...rest} ref={sectionRef} className={`avx-section ${className}`.trim()} aria-labelledby={title ? id : undefined} style={style}>
      {(title || link || aside) && (
        <div className="avx-section__head">
          {title && <H id={id} className="avx-section__title">{title}</H>}
          {link && <Link to={link.to} className="avx-section__link">{link.label} <ChevronRight size={14} aria-hidden="true" /></Link>}
          {aside}
        </div>
      )}
      {children}
    </section>
  )
}

// A page header (rule 4 and 5): the title, at most one short line, the ⓘ, one primary action and up to two
// secondary ones; anything more goes in the ⋯ menu. On phone the secondary actions move into the ⋯ menu too.
//   <PageHeader title="Quotes" line="12 open" help={<PageHelp page="quotes" />}
//     primary={<button style={btnPrimary}>New quote</button>}
//     secondary={[{ label: 'Export', icon: <Download size={15} />, onClick }]}
//     more={[{ label: 'Settings', onClick }]} />
// eyebrow: a small line above the title (the home's greeting). after: chips next to the title (a role chip).
// An action: { label, icon?, onClick, disabled? }.
export function PageHeader({ title, eyebrow, line, help, after, primary, secondary = [], more = [], className = '' }) {
  const phone = usePhone()
  const shown = phone ? [] : secondary.slice(0, 2)
  const menu = [...(phone ? secondary : secondary.slice(2)), ...more]
  return (
    <header className={`avx-page-head ${className}`.trim()}>
      <div className="avx-page-head__text">
        {eyebrow && <p className="avx-page-head__eyebrow">{eyebrow}</p>}
        {/* The ⓘ sits beside the heading, not inside it, so the heading's name is just the title */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: space[2], minWidth: 0 }}>
          <h1 className="avx-page-head__title">{title}{after}</h1>{help}
        </div>
        {line && <p className="avx-page-head__line">{line}</p>}
      </div>
      {(primary || shown.length > 0 || menu.length > 0) && (
        <div className="avx-page-head__actions">
          {shown.map(a => (
            <button key={a.label} type="button" onClick={a.onClick} disabled={a.disabled} style={btn}>{a.icon}{a.label}</button>
          ))}
          {primary}
          <MoreMenu items={menu} />
        </div>
      )}
    </header>
  )
}

// A row of tiles: on phone a sideways swipe row (scroll-snap, the next tile shows cut off), from 768px a grid.
// It is a focusable region with a label, and the arrow keys scroll it. Each child becomes a list item.
//   <SwipeRow label={t('reports.keyNumbers')} cols={3}>{tiles}</SwipeRow>
// item: a tile's width on phone (default 44%, so two and a bit show); cols: columns on desktop.
export function SwipeRow({ label, cols = 3, item, children, style }) {
  const ref = useRef(null)
  const onKeyDown = e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const el = ref.current
    const first = el?.querySelector('li')
    if (!el || !first || el.scrollWidth <= el.clientWidth) return
    e.preventDefault()
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.documentElement.hasAttribute('data-comfort')
    el.scrollBy({ left: (e.key === 'ArrowRight' ? 1 : -1) * (first.offsetWidth + 12), behavior: still ? 'auto' : 'smooth' })
  }
  return (
    <div ref={ref} role="region" aria-label={label} tabIndex={0} onKeyDown={onKeyDown} className="avx-swipe"
      style={{ '--swipe-cols': cols, ...(item ? { '--swipe-item': item } : {}), ...style }}>
      <ul className="avx-swipe__list">
        {Children.toArray(children).filter(Boolean).map((child, i) => <li key={child.key ?? i}>{child}</li>)}
      </ul>
    </div>
  )
}

// The ⋯ button with a menu of actions past the visible ones ("More actions"). Nothing to show: renders nothing.
//   <MoreMenu items={[{ label: 'Duplicate', icon: <Copy size={15} />, onClick }, { label: 'Archive', onClick, disabled: true }]} />
// Opens on click or Enter; ↑ ↓ move between items, Escape or a click outside closes and returns focus to ⋯.
export function MoreMenu({ items = [], label }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  const button = useRef(null)
  useEffect(() => {
    if (!open) return
    box.current?.querySelector('[role="menuitem"]')?.focus()
    const onDown = e => { if (!box.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('touchstart', onDown) }
  }, [open])
  if (!items.length) return null
  const close = () => { setOpen(false); button.current?.focus() }
  const onKeyDown = e => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return
    const all = [...box.current.querySelectorAll('[role="menuitem"]')]
    const at = all.indexOf(document.activeElement)
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : (at + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length
    e.preventDefault()
    all[next]?.focus()
  }
  const name = label || t('common.moreActions')
  return (
    <div ref={box} className="avx-more" onKeyDown={open ? onKeyDown : undefined}>
      <button ref={button} type="button" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open}
        aria-label={name} title={name} style={{ ...btn, padding: '8px' }}>
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>
      {open && (
        <ul role="menu" aria-label={name} className="avx-more__menu">
          {items.map(a => (
            <li key={a.label} role="none">
              <button type="button" role="menuitem" tabIndex={-1} className="avx-more__item" aria-disabled={a.disabled || undefined}
                onClick={() => { if (a.disabled) return; setOpen(false); button.current?.focus(); a.onClick?.() }}>
                {a.icon}{a.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
