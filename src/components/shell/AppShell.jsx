import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ChevronDown, Check, Briefcase, List, CalendarDays, CalendarOff, Building2, Plus, FileText, Tags,
  LayoutTemplate, Users, Settings, MoreHorizontal, X, LogOut, BellOff, Package, MapPin, History, QrCode, Wrench, Handshake, BarChart3, HelpCircle, Contact, Search, ListTodo, Clock, Receipt, FileCheck, TrendingUp } from 'lucide-react'
import { useAuth } from '../../lib/AuthContext'
import { useWorkspace } from '../../lib/WorkspaceContext'
import { navSections, splitItems, phoneTabs, isActive, homePath, MY_WORK } from '../../lib/nav'
import { useI18n } from '../../i18n'
import NotificationBell from '../NotificationBell'
import MessagesButton from '../messages/MessagesButton'
import { colors, iconBtn, AvxMark } from '../ui'

export const ICONS = {
  briefcase: Briefcase, list: List, calendar: CalendarDays, calendarOff: CalendarOff, building: Building2, plus: Plus,
  fileText: FileText, tags: Tags, layoutTemplate: LayoutTemplate, users: Users, settings: Settings,
  package: Package, mapPin: MapPin, history: History, qrCode: QrCode, wrench: Wrench, listTodo: ListTodo, handshake: Handshake, barChart: BarChart3, contact: Contact, search: Search, clock: Clock, receipt: Receipt, trendingUp: TrendingUp, fileCheck: FileCheck,
}

// Signed-in screens share this frame: the logo (always home), the workspace switcher,
// section menus (desktop) or a bottom tab bar (phones), notifications and account.
export default function AppShell({ children }) {
  const { user, profile } = useAuth()
  const { workspace, role } = useWorkspace()
  const { t } = useI18n()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  // Old links (?panel=account) open the settings page
  useEffect(() => {
    if (params.get('panel') === 'account') navigate('/settings', { replace: true })
  }, [params, navigate])
  const openSettings = () => navigate('/settings')

  const sections = navSections({ workspace, role })
  const displayName = profile?.full_name || user?.email?.split('@')[0] || ''
  const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '·'

  return (
    <div className="shell">
      <style>{SHELL_CSS}</style>
      <header className="shell-bar">
        <Link to={homePath(workspace)} className="shell-logo" aria-label={`AVX — ${t('nav.home')}`} title={t('nav.home')}>
          <span className="shell-logo-mark"><AvxMark size={22} /></span>
          <span className="shell-logo-text">AVX</span>
        </Link>
        <span className="shell-divider" aria-hidden="true" />
        <WorkspaceSwitcher />
        <nav className="shell-sections" aria-label={t('nav.main')}>
          {sections.map(s => <SectionMenu key={s.key} section={s} />)}
        </nav>
        <div className="shell-right">
          <Link to="/help" className="shell-help" aria-label={t('help.title')} title={t('help.title')} style={{ ...iconBtn, color: colors.muted }}><HelpCircle size={17} /></Link>
          <MessagesButton />
          <NotificationBell />
          <button onClick={openSettings} className="shell-avatar" aria-label={`${initials} — ${t('account.title')}`} title={t('account.title')}>{initials}</button>
        </div>
      </header>
      <main className="shell-main">{children}</main>
      <PhoneTabs sections={sections} onAccount={openSettings} />
    </div>
  )
}

function useOutside(ref, open, onClose) {
  useEffect(() => {
    if (!open) return
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [ref, open, onClose])
}

export function RoleChip({ role }) {
  const { t } = useI18n()
  if (!role) return null
  return <span className={`shell-role shell-role-${role}`}>{t(`orgRole.${role}`)}</span>
}

// A workspace's monogram: two letters in a square, never in the organisation's own colour
// (initials of the capitalised words, so "Lumen and Pixel" is LP; one word gives its first two letters)
export const monogram = name => {
  const words = (name || '?').trim().split(/\s+/).filter(w => /[\p{L}\d]/u.test(w[0]))
  const big = words.filter(w => /[\p{Lu}\d]/u.test(w[0]))
  const pick = big.length > 1 ? big : words
  const letters = pick.length > 1 ? pick[0][0] + pick[1][0] : (pick[0] || '?').slice(0, 2)
  return letters.toUpperCase()
}

function OrgMark({ name, size = 24 }) {
  return (
    <span className="shell-orgmark" style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }} aria-hidden="true">
      {monogram(name)}
    </span>
  )
}

function MyWorkMark({ size = 24 }) {
  return <span className="shell-orgmark" style={{ width: size, height: size }} aria-hidden="true"><AvxMark size={Math.round(size * 0.5)} /></span>
}

// Unread updates in a workspace, or a muted sign
function UnreadMark({ count, muted }) {
  const { t } = useI18n()
  if (muted) return <span className="shell-muted" title={t('mute.muted')} aria-label={t('mute.muted')}><BellOff size={13} /></span>
  if (!count) return null
  return <span className="shell-unread" aria-label={t('notif.bellUnread', { count })}>{count > 99 ? '99+' : count}</span>
}

// The button next to the logo: which workspace you're in and your role there.
function WorkspaceSwitcher() {
  const { orgs, workspace, currentOrg, setWorkspace, unreadIn, unreadMyWork, mutedIds } = useWorkspace()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useOutside(ref, open, () => setOpen(false))

  const pick = id => {
    setWorkspace(id)
    setOpen(false)
    navigate(homePath(id))
  }

  return (
    <div className="shell-switcher" ref={ref}>
      {/* Named by what it shows (company, role) so voice control can use the visible words */}
      <button className="shell-switch-btn" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open}
        title={t('nav.switchWorkspace', { name: currentOrg?.name || t('nav.myWork') })}>
        {currentOrg ? <OrgMark name={currentOrg.name} /> : <MyWorkMark />}
        <span className="shell-switch-name">{currentOrg?.name || t('nav.myWork')}</span>
        {currentOrg && <RoleChip role={currentOrg.myRole} />}
        {(workspace !== MY_WORK && unreadMyWork > 0) || orgs.some(o => o.id !== workspace && unreadIn(o.id) > 0)
          ? <span className="shell-unread-dot" title={t('nav.unreadElsewhere')} aria-label={t('nav.unreadElsewhere')} /> : null}
        <ChevronDown size={14} className="shell-chevron" />
      </button>
      {open && (
        <div className="shell-pop shell-switch-pop" role="menu">
          <p className="shell-pop-title">{t('nav.workspaces')}</p>
          <button role="menuitemradio" aria-checked={workspace === MY_WORK} className="shell-ws" onClick={() => pick(MY_WORK)}>
            <MyWorkMark size={32} />
            <span className="shell-ws-text"><strong>{t('nav.myWork')}</strong><small>{t('nav.myWorkDesc')}</small></span>
            <UnreadMark count={unreadMyWork} />
            {workspace === MY_WORK && <Check size={15} color={colors.accentText} />}
          </button>
          {orgs.map(o => (
            <button key={o.id} role="menuitemradio" aria-checked={workspace === o.id} className="shell-ws" onClick={() => pick(o.id)}>
              <OrgMark name={o.name} size={32} />
              <span className="shell-ws-text"><strong>{o.name}</strong></span>
              <RoleChip role={o.myRole} />
              <UnreadMark count={unreadIn(o.id)} muted={mutedIds?.has(o.id)} />
              {workspace === o.id && <Check size={15} color={colors.accentText} />}
            </button>
          ))}
          <div className="shell-pop-sep" />
          <Link role="menuitem" className="shell-pop-link" to="/orgs" onClick={() => setOpen(false)}><Building2 size={14} /> {t('nav.allOrgs')}</Link>
          <Link role="menuitem" className="shell-pop-link" to="/orgs?new=1" onClick={() => setOpen(false)}><Plus size={14} /> {t('nav.newOrg')}</Link>
        </div>
      )}
    </div>
  )
}

// A top-bar section that opens a panel of cards (and a side list once it grows).
// Opens on hover after a short pause, or on click / Enter; Esc or clicking away closes it.
function SectionMenu({ section }) {
  const { t } = useI18n()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const timer = useRef(null)
  useOutside(ref, open, () => setOpen(false))
  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => { setOpen(false) }, [location.pathname, location.search])

  const hover = next => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setOpen(next), next ? 120 : 220)
  }
  const active = section.items.some(i => isActive(i, location.pathname, location.search))
  const { cards, list } = splitItems(section.items)
  const here = item => isActive(item, location.pathname, location.search)

  return (
    <div className="shell-section" ref={ref} onMouseEnter={() => hover(true)} onMouseLeave={() => hover(false)}>
      <button className={`shell-section-btn${active ? ' is-active' : ''}`} onClick={() => { clearTimeout(timer.current); setOpen(o => !o) }}
        aria-haspopup="true" aria-expanded={open}>
        {t(`nav.section.${section.key}`)} <ChevronDown size={13} className="shell-chevron" />
      </button>
      {open && (
        <div className={`shell-pop shell-panel${list.length ? ' has-list' : ''}`}>
          <div className="shell-cards" style={{ '--cols': cards.length === 1 ? 1 : 2 }}>
            {cards.map(item => <NavCard key={item.key} item={item} current={here(item)} onPick={() => setOpen(false)} />)}
          </div>
          {list.length > 0 && (
            <div className="shell-sidelist">
              {list.map(item => {
                const Icon = ICONS[item.icon] || List
                return <Link key={item.key} to={item.to} className="shell-sidelink" aria-current={here(item) ? 'page' : undefined} onClick={() => setOpen(false)}><Icon size={16} /> {t(`nav.${item.key}`)}</Link>
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function NavCard({ item, current, onPick }) {
  const { t } = useI18n()
  const Icon = ICONS[item.icon] || List
  return (
    <Link to={item.to} className="shell-card" aria-current={current ? 'page' : undefined} onClick={onPick}>
      <strong><Icon size={16} aria-hidden="true" /> {t(`nav.${item.key}`)}</strong>
      <small>{t(`nav.${item.key}Desc`)}</small>
    </Link>
  )
}

// Phones: three everyday places plus "More", which holds every section as cards.
function PhoneTabs({ sections, onAccount }) {
  const { workspace, role, orgs, setWorkspace, currentOrg } = useWorkspace()
  const { signOut } = useAuth()
  const { t } = useI18n()
  const location = useLocation()
  const navigate = useNavigate()
  const [more, setMore] = useState(false)
  useEffect(() => { setMore(false) }, [location.pathname, location.search])
  const tabs = phoneTabs({ workspace, role })

  return (
    <>
      <nav className="shell-tabs" aria-label={t('nav.main')}>
        {tabs.map(tab => {
          const Icon = ICONS[tab.icon] || List
          const active = isActive(tab, location.pathname, location.search)
          return (
            <Link key={tab.key} to={tab.to} className={`shell-tab${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined}>
              <Icon size={20} aria-hidden="true" /> <span>{t(`nav.${tab.key}Short`)}</span>
            </Link>
          )
        })}
        <button className={`shell-tab${more ? ' is-active' : ''}`} onClick={() => setMore(m => !m)} aria-expanded={more}>
          <MoreHorizontal size={20} aria-hidden="true" /> <span>{t('nav.more')}</span>
        </button>
      </nav>
      {more && (
        <div className="shell-sheet-backdrop" onClick={e => e.target === e.currentTarget && setMore(false)}>
          <div className="shell-sheet" role="dialog" aria-modal="true" aria-label={t('nav.more')}>
            <div className="shell-sheet-head">
              <strong>{currentOrg?.name || t('nav.myWork')}</strong>
              {currentOrg && <RoleChip role={currentOrg.myRole} />}
              <button onClick={() => setMore(false)} className="shell-icon-btn" aria-label={t('common.close')}><X size={18} /></button>
            </div>
            <div className="shell-sheet-ws" role="group" aria-label={t('nav.workspaces')}>
              {[{ id: MY_WORK, name: t('nav.myWork') }, ...orgs].map(o => (
                <button key={o.id} className={`shell-chip${workspace === o.id ? ' is-active' : ''}`}
                  onClick={() => { setWorkspace(o.id); navigate(homePath(o.id)) }}>
                  {o.name}{o.myRole ? ` · ${t(`orgRole.${o.myRole}`)}` : ''}
                </button>
              ))}
            </div>
            {sections.map(s => (
              <div key={s.key} className="shell-sheet-section">
                <p className="shell-pop-title">{t(`nav.section.${s.key}`)}</p>
                <div className="shell-sheet-list">
                  {s.items.map(item => {
                    const Icon = ICONS[item.icon] || List
                    const current = isActive(item, location.pathname, location.search)
                    return (
                      <Link key={item.key} to={item.to} className="shell-sheet-link" aria-current={current ? 'page' : undefined} onClick={() => setMore(false)}>
                        <Icon size={18} aria-hidden="true" /> {t(`nav.${item.key}`)}
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
            <div className="shell-sheet-foot">
              <button className="shell-pop-link" onClick={() => { setMore(false); onAccount() }}><Users size={14} /> {t('account.title')}</button>
              <Link className="shell-pop-link" to="/help" onClick={() => setMore(false)}><HelpCircle size={14} /> {t('help.title')}</Link>
              <button className="shell-pop-link" onClick={signOut}><LogOut size={14} /> {t('account.signOut')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const SHELL_CSS = `
  .shell { min-height: 100vh; background: var(--bg); color: var(--text); }
  .shell-bar { position: sticky; top: var(--safe-top); z-index: 60; height: 56px; display: flex; align-items: center; gap: 8px;
    padding: 0 16px; background: var(--chrome); border-bottom: 1px solid var(--line); }
  .shell-logo { display: flex; align-items: center; gap: 12px; text-decoration: none; color: var(--text); padding: 4px; margin-right: 4px; }
  .shell-logo-mark { display: flex; align-items: center; justify-content: center; color: var(--accent-text); }
  :root[data-theme="light"] .shell-logo-mark { color: var(--text); }
  .shell-logo-text { font-family: var(--font-mono); font-weight: 700; font-size: 16px; letter-spacing: 0.06em; }
  .shell-divider { width: 1px; height: 24px; background: var(--line); }
  .shell-switcher, .shell-section { position: relative; }
  .shell-switch-btn { display: flex; align-items: center; gap: 8px; max-width: 380px; height: 36px; padding: 0 10px 0 6px; cursor: pointer;
    background: transparent; border: 1px solid var(--line-strong); color: var(--text); font-size: 14px; font-weight: 600; transition: background-color .15s; }
  .shell-switch-btn:hover, .shell-switch-btn[aria-expanded="true"] { background: var(--hover); }
  .shell-switch-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .shell-chevron { color: var(--muted); flex-shrink: 0; }
  .shell-orgmark { flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; font-family: var(--font-mono); font-weight: 700;
    background: transparent; border: 1px solid var(--line-strong); color: var(--text); line-height: 1; }
  .shell-role { flex-shrink: 0; display: inline-flex; align-items: center; height: 18px; padding: 0 6px; border: 1px solid var(--line);
    font-family: var(--font-mono); font-size: 11px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--text); background: transparent; }
  .shell-sections { display: flex; gap: 4px; margin-left: 8px; align-self: stretch; align-items: center; }
  .shell-section-btn { position: relative; display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 12px; border: none; cursor: pointer;
    background: transparent; color: var(--muted); font-size: 14px; font-weight: 500; transition: color .15s, background-color .15s; }
  .shell-section-btn:hover, .shell-section-btn[aria-expanded="true"] { color: var(--text); background: var(--hover); }
  .shell-section-btn.is-active { color: var(--text); }
  .shell-section-btn.is-active::after { content: ''; position: absolute; left: 12px; right: 12px; bottom: -10px; height: 2px; background: var(--accent); }
  .shell-right { margin-left: auto; display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .shell-avatar { width: 32px; height: 32px; border: 1px solid var(--line-strong); cursor: pointer; font-family: var(--font-mono); font-size: 13px; font-weight: 700;
    color: var(--text); background: var(--fill); margin-left: 4px; }
  .shell-avatar:hover { background: var(--hover); }
  .shell-pop { position: absolute; top: calc(100% + 10px); left: 0; z-index: 70; color: var(--text); background: var(--panel);
    border: 1px solid var(--line-strong); animation: shellIn .25s cubic-bezier(0.16, 1, 0.3, 1); }
  @keyframes shellIn { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
  .shell-switch-pop { width: 340px; padding: 6px 0; }
  .shell-pop-title { font-family: var(--font-mono); font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: .16em; padding: 6px 16px; }
  .shell-ws { width: 100%; display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 8px 16px; border: none; cursor: pointer;
    background: transparent; color: var(--text); text-align: left; }
  .shell-ws:hover { background: var(--hover); }
  .shell-ws[aria-checked="true"] { background: var(--selection); }
  .shell-ws-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  .shell-ws-text strong { font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .shell-ws-text small { font-size: 13px; color: var(--muted); }
  .shell-unread { min-width: 18px; height: 18px; padding: 0 5px; background: var(--text); color: var(--bg);
    font-family: var(--font-mono); font-size: 11px; font-weight: 700; line-height: 18px; text-align: center; flex-shrink: 0; }
  .shell-muted { color: var(--muted); display: inline-flex; flex-shrink: 0; }
  .shell-unread-dot { width: 8px; height: 8px; background: var(--accent-text); flex-shrink: 0; }
  .shell-pop-sep { height: 1px; background: var(--line); margin: 6px 0; }
  .shell-pop-link { display: flex; align-items: center; gap: 12px; min-height: 36px; padding: 0 16px; color: var(--text-2); font-size: 13px; font-weight: 500;
    text-decoration: none; background: none; border: none; cursor: pointer; width: 100%; text-align: left; }
  .shell-pop-link:hover { color: var(--text); background: var(--hover); }
  .shell-panel { display: grid; grid-template-columns: auto; width: max-content; max-width: min(720px, calc(100vw - 32px)); }
  .shell-panel.has-list { grid-template-columns: auto 200px; }
  .shell-cards { display: grid; grid-template-columns: repeat(var(--cols, 2), 240px); gap: 1px; background: var(--line); align-content: start; }
  .shell-card { display: flex; flex-direction: column; gap: 8px; padding: 16px; text-decoration: none; color: var(--text); background: var(--panel); transition: background-color .15s; }
  .shell-card:hover { background: var(--hover); }
  .shell-card strong { display: flex; align-items: center; gap: 8px; font-family: var(--font-mono); font-size: 14px; font-weight: 700; line-height: 18px; }
  .shell-card[aria-current="page"] strong { color: var(--accent-text); }
  .shell-card small { font-size: 13px; color: var(--muted); line-height: 17px; }
  .shell-sidelist { display: flex; flex-direction: column; padding: 12px 0; border-left: 1px solid var(--line); }
  .shell-sidelink { display: flex; align-items: center; gap: 12px; min-height: 36px; padding: 0 16px; font-size: 13px; color: var(--text-2); text-decoration: none; }
  .shell-sidelink:hover { color: var(--text); background: var(--hover); }
  .shell-sidelink[aria-current="page"] { color: var(--accent-text); }
  .shell-main { padding-bottom: 0; }
  .shell-tabs { display: none; }
  .shell-icon-btn { background: none; border: none; color: var(--muted); cursor: pointer; display: flex; align-items: center; justify-content: center; min-width: 44px; min-height: 44px; }
  @media (max-width: 899px) {
    .shell-help { display: none !important; }
    .shell-sections { display: none; }
    .shell-bar { height: 52px; padding: 0 12px; gap: 8px; }
    .shell-logo-text { display: none; }
    .shell-divider { display: none; }
    .shell-avatar { display: none; }
    .shell-switch-btn { max-width: none; width: 100%; min-width: 0; height: 40px; padding: 0 8px 0 4px; border-color: transparent; }
    .shell-switch-name { flex: 1; min-width: 0; text-align: left; font-family: var(--font-mono); font-weight: 700; font-size: 16px; }
    .shell-switch-btn .shell-role { display: none; }
    /* The switcher's list drops down from the top bar, full width of the bar (the bar is its containing block),
       and scrolls when it would run under the bottom tab bar. */
    .shell-switcher { flex: 1; min-width: 0; position: static; }
    .shell-switch-pop { top: calc(100% + 1px); left: 0; right: 0; width: auto; overflow-y: auto; overscroll-behavior: contain;
      max-height: calc(100vh - 52px - 64px - 16px - var(--safe-top) - env(safe-area-inset-bottom));
      max-height: calc(100dvh - 52px - 64px - 16px - var(--safe-top) - env(safe-area-inset-bottom));
      border-width: 0 0 1px; animation-name: shellDown; }
    @keyframes shellDown { from { transform: translateY(-8px); opacity: 0 } to { transform: none; opacity: 1 } }
    .shell-ws, .shell-pop-link { min-height: 44px; }
    .shell-main { padding-bottom: calc(64px + env(safe-area-inset-bottom)); }
    .shell-tabs { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; position: fixed; left: 0; right: 0; bottom: 0; z-index: 60;
      height: calc(64px + env(safe-area-inset-bottom)); padding-bottom: env(safe-area-inset-bottom);
      background: var(--chrome); border-top: 1px solid var(--line); }
    .shell-tab { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; border: none;
      background: none; color: var(--muted); font-family: var(--font-mono); font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
      line-height: 12px; text-decoration: none; cursor: pointer; min-width: 0; }
    .shell-tab span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 2px; }
    .shell-tab.is-active { color: var(--text); }
    .shell-tab.is-active::before { content: ''; position: absolute; top: -1px; left: 25%; right: 25%; height: 2px; background: var(--accent); }
    .shell-sheet-backdrop { position: fixed; inset: 0; z-index: 80; background: var(--overlay); display: flex; align-items: flex-end; }
    .shell-sheet { width: 100%; max-height: 82vh; overflow-y: auto; padding: 8px 0 calc(16px + env(safe-area-inset-bottom));
      background: var(--panel); border-top: 1px solid var(--line-strong); animation: shellUp .25s cubic-bezier(0.16, 1, 0.3, 1); }
    @keyframes shellUp { from { transform: translateY(10px); opacity: 0 } to { transform: none; opacity: 1 } }
    .shell-sheet-head { display: flex; align-items: center; gap: 8px; padding: 0 4px 0 16px; border-bottom: 1px solid var(--line); }
    .shell-sheet-head strong { font-family: var(--font-mono); font-size: 16px; font-weight: 700; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .shell-sheet-ws { display: flex; gap: 8px; overflow-x: auto; overflow-y: hidden; padding: 12px 16px; scrollbar-width: none; border-bottom: 1px solid var(--line); }
    .shell-chip { flex-shrink: 0; min-height: 36px; padding: 0 12px; border: 1px solid var(--line-strong); background: transparent;
      color: var(--text-2); font-size: 13px; font-weight: 500; cursor: pointer; white-space: nowrap; }
    .shell-chip.is-active { color: var(--text); border-color: var(--accent); background: var(--selection); }
    .shell-sheet-section { padding-top: 8px; }
    .shell-sheet-section .shell-pop-title { padding: 8px 16px 4px; }
    .shell-sheet-list { display: flex; flex-direction: column; }
    .shell-sheet-link { display: flex; align-items: center; gap: 12px; min-height: 44px; padding: 0 16px; color: var(--text); text-decoration: none; font-size: 14px; }
    .shell-sheet-link:hover { background: var(--hover); }
    .shell-sheet-link svg { color: var(--muted); }
    .shell-sheet-link[aria-current="page"] { color: var(--accent-text); }
    .shell-sheet-foot { margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--line); }
  }
  @media (prefers-reduced-motion: reduce) { .shell-pop, .shell-sheet { animation: none; } }
  :root[data-comfort] .shell-pop, :root[data-comfort] .shell-sheet { animation: none; }
`
