import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Info, HelpCircle, X, BookOpen, ListChecks, ChevronRight, ArrowLeft } from 'lucide-react'
import { term, hint, page, guide, guidesFor, GUIDE_ROLES, GUIDES, PAGE_TERMS } from '../../help'
import GuideView from './GuideView'
import { useI18n } from '../../i18n'
import { label as labelStyle, colors } from '../ui'

// Help where you are (docs/HELP.md, H1):
//   <Hint id="prep-days" />            ⓘ next to a field; opens a short explanation
//   <Term id="call-time">call time</Term>  a word with a dotted underline; opens its definition
//   <PageHelp page="gig" />           ? on a page header; opens what the page is for, in a side panel
//   <HintLabel htmlFor hint>Text</HintLabel>  a form label with its ⓘ
// Everything opens on tap or with the keyboard (never hover alone) and closes with Escape.

// A small panel under the button that stays inside the screen
function usePopover() {
  const [place, setPlace] = useState(null)
  const button = useRef(null)
  const panel = useRef(null)
  const open = !!place
  function toggle() {
    if (open) return setPlace(null)
    const r = button.current.getBoundingClientRect()
    const width = Math.min(300, window.innerWidth - 24)
    const left = Math.min(Math.max(12, r.left + r.width / 2 - width / 2), window.innerWidth - width - 12)
    const below = r.bottom + 8 + 180 < window.innerHeight || r.top < 220
    setPlace({ left, width, ...(below ? { top: r.bottom + 6 } : { bottom: window.innerHeight - r.top + 6 }) })
  }
  useEffect(() => {
    if (!open) return
    const close = () => setPlace(null)
    const onKey = e => { if (e.key === 'Escape') { setPlace(null); button.current?.focus() } }
    const onDown = e => { if (!panel.current?.contains(e.target) && !button.current?.contains(e.target)) setPlace(null) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])
  return { open, place, toggle, button, panel }
}

const popStyle = place => ({
  position: 'fixed', zIndex: 300, left: `${place.left}px`, width: `${place.width}px`,
  ...(place.top != null ? { top: `${place.top}px` } : { bottom: `${place.bottom}px` }),
  background: '#141C29', color: '#E6EDF3', border: '1px solid rgba(255,255,255,0.14)', borderRadius: '12px',
  padding: '12px 14px', fontSize: '13px', lineHeight: 1.55, boxShadow: '0 12px 32px rgba(0,0,0,0.55)',
  textTransform: 'none', letterSpacing: 'normal', fontWeight: 400, textAlign: 'left', whiteSpace: 'normal',
})

export function Hint({ id, label }) {
  const { t } = useI18n()
  const { open, place, toggle, button, panel } = usePopover()
  const popId = useId()
  const text = hint(id)
  if (!text) return null
  return (
    <>
      <button ref={button} type="button" onClick={e => { e.preventDefault(); toggle() }} aria-expanded={open} aria-controls={open ? popId : undefined}
        aria-label={label ? t('help.hintFor', { field: label }) : t('help.hint')} title={t('help.hint')}
        style={{ background: 'none', border: 'none', padding: '2px', margin: '-2px 0', cursor: 'pointer', color: open ? colors.accent : colors.muted, display: 'inline-flex', verticalAlign: 'middle', borderRadius: '50%' }}>
        <Info size={14} aria-hidden="true" />
      </button>
      {open && <div ref={panel} id={popId} role="note" style={popStyle(place)}>{text}</div>}
    </>
  )
}

// A label with its ⓘ next to it (the ⓘ sits outside the <label> so tapping it doesn't focus the field)
export function HintLabel({ htmlFor, hint: hintId, children, style }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px', ...style }}>
      <label style={{ ...labelStyle, marginBottom: 0 }} htmlFor={htmlFor}>{children}</label>
      <Hint id={hintId} label={typeof children === 'string' ? children : undefined} />
    </div>
  )
}

export function Term({ id, children }) {
  const { t } = useI18n()
  const { open, place, toggle, button, panel } = usePopover()
  const popId = useId()
  const entry = term(id)
  if (!entry) return children
  return (
    <>
      <button ref={button} type="button" onClick={e => { e.preventDefault(); toggle() }} aria-expanded={open} aria-controls={open ? popId : undefined}
        aria-label={t('help.termFor', { term: entry.term })}
        style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit', cursor: 'help', textDecoration: 'underline dotted', textUnderlineOffset: '3px', display: 'inline' }}>
        {children || entry.term}
      </button>
      {open && (
        <div ref={panel} id={popId} role="note" style={popStyle(place)}>
          <strong style={{ display: 'block', marginBottom: '3px', color: '#fff' }}>{entry.term}</strong>
          {entry.definition}
          <span style={{ display: 'block', marginTop: '6px', color: colors.soft }}>{t('help.example')}: {entry.example}</span>
          <Link to={`/help#${id}`} style={{ display: 'inline-block', marginTop: '8px', color: colors.accent, fontSize: '12px' }}>{t('help.inGlossary')}</Link>
        </div>
      )}
    </>
  )
}

// The ? on a page header: what the page is for, its how-to guides (read in the panel) and the
// words used on it, without leaving the page
export function PageHelp({ page: pageId }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [reading, setReading] = useState(null) // a guide id, shown in the panel
  const panel = useRef(null)
  const button = useRef(null)
  const closeBtn = useRef(null)
  const entry = page(pageId)
  useEffect(() => { if (panel.current) panel.current.scrollTop = 0 }, [reading])
  useEffect(() => {
    if (!open) return
    closeBtn.current?.focus()
    const onKey = e => { if (e.key === 'Escape') { setOpen(false); setReading(null); button.current?.focus() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
  if (!entry) return null
  const close = () => { setOpen(false); setReading(null); button.current?.focus() }
  const guides = guidesFor(pageId)
  return (
    <>
      <button ref={button} type="button" onClick={() => setOpen(true)} aria-label={t('help.aboutPage', { page: entry.title })} title={t('help.aboutPage', { page: entry.title })}
        style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${colors.border}`, borderRadius: '50%', width: '28px', height: '28px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: colors.soft, flexShrink: 0, verticalAlign: 'middle' }}>
        <HelpCircle size={16} aria-hidden="true" />
      </button>
      {open && (
        <div onClick={e => e.target === e.currentTarget && close()} style={{ position: 'fixed', inset: 0, zIndex: 250, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'flex-end' }}>
          <aside ref={panel} role="dialog" aria-modal="true" aria-label={entry.title} style={{
            width: 'min(400px, 100vw)', height: '100%', overflowY: 'auto', background: colors.panel, borderLeft: `1px solid ${colors.border}`,
            padding: 'calc(18px + var(--safe-top)) 20px calc(24px + env(safe-area-inset-bottom, 0px))', color: '#fff', animation: 'fadeIn .15s ease',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <HelpCircle size={18} color={colors.accent} aria-hidden="true" />
              <h2 style={{ fontSize: '17px', fontWeight: 700, flex: 1 }}>{entry.title}</h2>
              <button ref={closeBtn} type="button" onClick={close} aria-label={t('common.close')} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', padding: '4px', display: 'flex' }}><X size={18} /></button>
            </div>
            {reading ? (
              <>
                <button type="button" onClick={() => setReading(null)} style={{ background: 'none', border: 'none', padding: '4px 0', marginBottom: '10px', color: colors.soft, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '14px' }}>
                  <ArrowLeft size={14} aria-hidden="true" /> {t('help.backToPage')}
                </button>
                <GuideView id={reading} compact />
              </>
            ) : (
              <>
                <p style={{ fontSize: '14px', lineHeight: 1.6, color: '#D5DEE7' }}>{entry.summary}</p>
                {guides.length > 0 && (
                  <>
                    <h3 style={{ ...labelStyle, marginTop: '20px', display: 'flex', alignItems: 'center', gap: '6px' }}><ListChecks size={13} aria-hidden="true" /> {t('help.guidesHere')}</h3>
                    {GUIDE_ROLES.map(role => ({ role, list: guides.filter(id => GUIDES[id].role === role) })).filter(g => g.list.length).map(({ role, list }) => (
                      <div key={role} style={{ marginBottom: '10px' }}>
                        <p style={{ fontSize: '12px', color: colors.soft, margin: '0 0 6px' }}>{t(`help.role.${role}`)}</p>
                        <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {list.map(id => (
                            <li key={id}>
                              <button type="button" onClick={() => setReading(id)} style={{
                                width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', borderRadius: '10px', cursor: 'pointer', textAlign: 'left',
                                background: 'rgba(255,255,255,0.04)', border: `1px solid ${colors.border}`, color: '#fff', fontSize: '14px', fontWeight: 600,
                              }}>
                                <span style={{ flex: 1 }}>{guide(id).title}</span> <ChevronRight size={15} color={colors.soft} aria-hidden="true" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </>
                )}
                <h3 style={{ ...labelStyle, marginTop: '20px' }}>{t('help.wordsHere')}</h3>
                <dl style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {(PAGE_TERMS[pageId] || []).map(id => {
                    const x = term(id)
                    return (
                      <div key={id}>
                        <dt style={{ fontWeight: 700, fontSize: '14px' }}>{x.term}</dt>
                        <dd style={{ fontSize: '13px', color: colors.soft, lineHeight: 1.55 }}>{x.definition}</dd>
                      </div>
                    )
                  })}
                </dl>
                <Link to="/help" onClick={() => setOpen(false)} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '20px', color: colors.accent, fontSize: '14px', fontWeight: 600 }}>
                  <BookOpen size={15} aria-hidden="true" /> {t('help.allHelp')}
                </Link>
              </>
            )}
          </aside>
        </div>
      )}
    </>
  )
}
