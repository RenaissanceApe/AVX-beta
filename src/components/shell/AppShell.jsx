import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Zap, ChevronDown, Check, Briefcase, List, CalendarDays, CalendarOff, Building2, Plus, FileText, Tags,
  LayoutTemplate, Users, Settings, MoreHorizontal, X, LogOut, BellOff, Package, MapPin, History, QrCode, Wrench, Handshake, BarChart3, HelpCircle,
} from 'lucide-react'
import { useAuth } from '../../lib/AuthContext'
import { useWorkspace } from '../../lib/WorkspaceContext'
import { navSections, splitItems, phoneTabs, isActive, homePath, MY_WORK } from '../../lib/nav'
import { useI18n } from '../../i18n'
import NotificationBell from '../NotificationBell'
import MessagesButton from '../messages/MessagesButton'
import AccountModal from '../AccountModal'
import { colors, iconBtn } from '../ui'

export const ICONS = {
  briefcase: Briefcase, list: List, calendar: CalendarDays, calendarOff: CalendarOff, building: Building2, plus: Plus,
  fileText: FileText, tags: Tags, layoutTemplate: LayoutTemplate, users: Users, settings: Settings,
  package: Package, mapPin: MapPin, history: History, qrCode: QrCode, wrench: Wrench, handshake: Handshake, barChart: BarChart3,
}
// Each section has its own tint so the menus are easy to tell apart at a glance
const TINTS = { work: 'var(--accent-text)', gigs: 'var(--accent-text)', quotes: 'var(--sky)', inventory: 'var(--orange)', organisation: 'var(--purple)', organisations: 'var(--yellow)' }

// Signed-in screens share this frame: the logo (always home), the workspace switcher,
// section menus (desktop) or a bottom tab bar (phones), notifications and account.
export default function AppShell({ children }) {
  const { user, profile } = useAuth()
  const { workspace, role } = useWorkspace()
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()
  const [accountOpen, setAccountOpen] = useState(false)
  const showAccount = accountOpen || params.get('panel') === 'account'
  const closeAccount = () => {
    setAccountOpen(false)
    if (params.get('panel') === 'account') { params.delete('panel'); setParams(params, { replace: true }) }
  }

  const sections = navSections({ workspace, role })
  const displayName = profile?.full_name || user?.email?.split('@')[0] || ''
  const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '·'

  return (
    <div className="shell">
      <style>{SHELL_CSS}</style>
      <header className="shell-bar">
        <Link to={homePath(workspace)} className="shell-logo" aria-label={`AVX — ${t('nav.home')}`} title={t('nav.home')}>
          <span className="shell-logo-mark"><Zap size={15} color="var(--on-accent)" fill="var(--on-accent)" /></span>
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
          <button onClick={() => setAccountOpen(true)} className="shell-avatar" aria-label={`${initials} — ${t('account.title')}`} title={t('account.title')}>{initials}</button>
        </div>
      </header>
      <main className="shell-main">{children}</main>
      <PhoneTabs sections={sections} onAccount={() => setAccountOpen(true)} />
      {showAccount && <AccountModal onClose={closeAccount} />}
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

function OrgMark({ name, size = 22 }) {
  return (
    <span className="shell-orgmark" style={{ width: size, height: size, fontSize: size * 0.45 }} aria-hidden="true">
      {(name || '?').trim().slice(0, 1).toUpperCase()}
    </span>
  )
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
        {currentOrg ? <OrgMark name={currentOrg.name} /> : <span className="shell-orgmark shell-orgmark-me" aria-hidden="true"><Briefcase size={12} /></span>}
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
            <span className="shell-orgmark shell-orgmark-me" aria-hidden="true"><Briefcase size={12} /></span>
            <span className="shell-ws-text"><strong>{t('nav.myWork')}</strong><small>{t('nav.myWorkDesc')}</small></span>
            <UnreadMark count={unreadMyWork} />
            {workspace === MY_WORK && <Check size={15} color={colors.accentText} />}
          </button>
          {orgs.map(o => (
            <button key={o.id} role="menuitemradio" aria-checked={workspace === o.id} className="shell-ws" onClick={() => pick(o.id)}>
              <OrgMark name={o.name} />
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
  const tint = TINTS[section.key] || TINTS.work

  return (
    <div className="shell-section" ref={ref} onMouseEnter={() => hover(true)} onMouseLeave={() => hover(false)}>
      <button className={`shell-section-btn${active ? ' is-active' : ''}`} onClick={() => { clearTimeout(timer.current); setOpen(o => !o) }}
        aria-haspopup="true" aria-expanded={open}>
        {t(`nav.section.${section.key}`)} <ChevronDown size={13} className="shell-chevron" />
      </button>
      {open && (
        <div className="shell-pop shell-panel" style={{ '--tint': tint }}>
          <div className="shell-cards" style={{ '--cols': cards.length <= 3 ? cards.length : 2 }}>
            {cards.map(item => <NavCard key={item.key} item={item} tint={tint} onPick={() => setOpen(false)} />)}
          </div>
          {list.length > 0 && (
            <div className="shell-sidelist">
              {list.map(item => {
                const Icon = ICONS[item.icon] || List
                return <Link key={item.key} to={item.to} className="shell-sidelink" onClick={() => setOpen(false)}><Icon size={14} /> {t(`nav.${item.key}`)}</Link>
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function NavCard({ item, tint, onPick }) {
  const { t } = useI18n()
  const Icon = ICONS[item.icon] || List
  return (
    <Link to={item.to} className="shell-card" style={{ '--tint': tint }} onClick={onPick}>
      <span className="shell-card-icon"><Icon size={18} strokeWidth={2.2} /></span>
      <strong>{t(`nav.${item.key}`)}</strong>
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
              <Icon size={20} /> <span>{t(`nav.${tab.key}Short`)}</span>
            </Link>
          )
        })}
        <button className={`shell-tab${more ? ' is-active' : ''}`} onClick={() => setMore(m => !m)} aria-expanded={more}>
          <MoreHorizontal size={20} /> <span>{t('nav.more')}</span>
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
                <div className="shell-cards shell-cards-sheet">
                  {s.items.map(item => <NavCard key={item.key} item={item} tint={TINTS[s.key] || TINTS.work} onPick={() => setMore(false)} />)}
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

// Faint film grain for the frosted panels (tiny inline SVG, no download)
const GRAIN = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .07 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

const SHELL_CSS = `
  .shell { min-height: 100vh; background: ${colors.bg}; color: var(--text); }
  .shell-bar { position: sticky; top: var(--safe-top); z-index: 60; height: 60px; display: flex; align-items: center; gap: 10px;
    padding: 0 18px; background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
    border-bottom: 1px solid color-mix(in srgb, var(--fg) min(100%, calc(6% * var(--line-k))), transparent); }
  .shell-logo { display: flex; align-items: center; gap: 8px; text-decoration: none; color: var(--text); border-radius: 10px; padding: 4px; }
  .shell-logo:hover .shell-logo-mark { box-shadow: 0 0 18px color-mix(in srgb, var(--accent) 55%, transparent); }
  .shell-logo-mark { width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center;
    background: linear-gradient(135deg, var(--accent), var(--accent-2)); box-shadow: 0 0 12px color-mix(in srgb, var(--accent) 30%, transparent); transition: box-shadow .2s; }
  .shell-logo-text { font-weight: 800; font-size: 18px; letter-spacing: -0.3px; }
  .shell-divider { width: 1px; height: 22px; background: color-mix(in srgb, var(--fg) min(100%, calc(8% * var(--line-k))), transparent); }
  .shell-switcher, .shell-section { position: relative; }
  .shell-switch-btn { display: flex; align-items: center; gap: 8px; max-width: 380px; padding: 6px 10px; border-radius: 10px; cursor: pointer;
    background: color-mix(in srgb, var(--fg) min(100%, calc(4% * var(--line-k))), transparent); border: 1px solid color-mix(in srgb, var(--fg) min(100%, calc(8% * var(--line-k))), transparent); color: var(--text); font-size: 14px; font-weight: 700; }
  .shell-switch-btn:hover { border-color: color-mix(in srgb, var(--accent) 35%, transparent); }
  .shell-switch-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .shell-chevron { color: ${colors.soft}; flex-shrink: 0; }
  .shell-orgmark { flex-shrink: 0; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; font-weight: 800;
    background: linear-gradient(135deg, color-mix(in srgb, var(--purple) 90%, transparent), color-mix(in srgb, var(--purple) 90%, transparent)); color: var(--on-accent); }
  .shell-orgmark-me { width: 22px; height: 22px; background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: var(--on-accent); }
  .shell-role { flex-shrink: 0; font-size: 10px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; padding: 2px 7px; border-radius: 20px; }
  .shell-role-admin { color: var(--yellow); background: color-mix(in srgb, var(--yellow) 14%, transparent); }
  .shell-role-member { color: var(--sky); background: color-mix(in srgb, var(--sky) 14%, transparent); }
  .shell-role-viewer { color: ${colors.soft}; background: color-mix(in srgb, var(--soft) 14%, transparent); }
  .shell-sections { display: flex; gap: 2px; margin-left: 8px; }
  .shell-section-btn { display: flex; align-items: center; gap: 4px; padding: 8px 12px; border-radius: 9px; border: none; cursor: pointer;
    background: transparent; color: ${colors.soft}; font-size: 14px; font-weight: 600; }
  .shell-section-btn:hover, .shell-section-btn[aria-expanded="true"] { color: var(--text); background: color-mix(in srgb, var(--fg) min(100%, calc(5% * var(--line-k))), transparent); }
  .shell-section-btn.is-active { color: ${colors.accentText}; }
  .shell-right { margin-left: auto; display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
  .shell-avatar { width: 32px; height: 32px; border-radius: 50%; border: none; cursor: pointer; font-size: 12px; font-weight: 700; color: var(--on-accent);
    background: linear-gradient(135deg, var(--accent), var(--accent-2)); }
  .shell-pop { position: absolute; top: calc(100% + 10px); left: 0; z-index: 70; border-radius: 18px; padding: 14px; color: var(--text);
    background-color: color-mix(in srgb, var(--panel) 97%, transparent); background-image: ${GRAIN}, linear-gradient(160deg, color-mix(in srgb, var(--tint, var(--accent)) 12%, transparent), color-mix(in srgb, var(--fg) min(100%, calc(2% * var(--line-k))), transparent) 55%);
    backdrop-filter: blur(22px) saturate(140%); -webkit-backdrop-filter: blur(22px) saturate(140%);
    border: 1px solid color-mix(in srgb, var(--fg) min(100%, calc(9% * var(--line-k))), transparent); box-shadow: 0 24px 60px rgba(0,0,0,0.55); animation: shellIn .16s ease; }
  @keyframes shellIn { from { opacity: 0; transform: translateY(-4px) } to { opacity: 1; transform: none } }
  .shell-switch-pop { width: 330px; }
  .shell-pop-title { font-size: 11px; font-weight: 700; color: ${colors.muted}; text-transform: uppercase; letter-spacing: .08em; margin: 2px 6px 8px; }
  .shell-ws { width: 100%; display: flex; align-items: center; gap: 10px; padding: 9px 8px; border-radius: 11px; border: none; cursor: pointer;
    background: transparent; color: var(--text); text-align: left; }
  .shell-ws:hover { background: color-mix(in srgb, var(--fg) min(100%, calc(6% * var(--line-k))), transparent); }
  .shell-ws-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .shell-ws-text strong { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .shell-ws-text small { font-size: 12px; color: ${colors.soft}; }
  .shell-unread { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: ${colors.accent}; color: var(--on-accent);
    font-size: 11px; font-weight: 800; line-height: 18px; text-align: center; flex-shrink: 0; }
  .shell-muted { color: ${colors.muted}; display: inline-flex; flex-shrink: 0; }
  .shell-unread-dot { width: 7px; height: 7px; border-radius: 50%; background: ${colors.accent}; flex-shrink: 0; }
  .shell-pop-sep { height: 1px; background: color-mix(in srgb, var(--fg) min(100%, calc(7% * var(--line-k))), transparent); margin: 8px 4px; }
  .shell-pop-link { display: flex; align-items: center; gap: 8px; padding: 8px; border-radius: 9px; color: ${colors.soft}; font-size: 13px; font-weight: 600;
    text-decoration: none; background: none; border: none; cursor: pointer; width: 100%; text-align: left; }
  .shell-pop-link:hover { color: var(--text); background: color-mix(in srgb, var(--fg) min(100%, calc(5% * var(--line-k))), transparent); }
  .shell-panel { display: flex; gap: 14px; width: max-content; max-width: min(760px, calc(100vw - 40px)); }
  .shell-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; min-width: 330px; flex: 1; }
  .shell-panel .shell-cards { grid-template-columns: repeat(var(--cols, 3), 158px); min-width: 0; }
  .shell-card { position: relative; display: flex; flex-direction: column; gap: 4px; padding: 14px; border-radius: 15px; text-decoration: none; color: var(--text);
    background-image: ${GRAIN}, linear-gradient(145deg, color-mix(in srgb, var(--tint) 22%, transparent), color-mix(in srgb, var(--tint) 5%, transparent) 70%);
    border: 1px solid color-mix(in srgb, var(--tint) 22%, transparent); transition: transform .15s, border-color .15s, background-color .15s; }
  .shell-card:hover, .shell-card:focus-visible { transform: translateY(-2px); border-color: color-mix(in srgb, var(--tint) 55%, transparent); background-color: color-mix(in srgb, var(--tint) 6%, transparent); outline: none; }
  .shell-card-icon { width: 36px; height: 36px; border-radius: 11px; display: flex; align-items: center; justify-content: center; margin-bottom: 6px;
    background: color-mix(in srgb, var(--tint) 22%, var(--panel)); color: var(--tint); box-shadow: 0 6px 16px color-mix(in srgb, var(--tint) 20%, transparent); }
  .shell-card strong { font-size: 14px; }
  .shell-card small { font-size: 12px; color: ${colors.soft}; line-height: 1.4; }
  .shell-sidelist { display: flex; flex-direction: column; gap: 2px; min-width: 170px; padding-left: 14px; border-left: 1px solid color-mix(in srgb, var(--fg) min(100%, calc(7% * var(--line-k))), transparent); }
  .shell-sidelink { display: flex; align-items: center; gap: 8px; padding: 8px; border-radius: 9px; font-size: 13px; color: ${colors.soft}; text-decoration: none; }
  .shell-sidelink:hover { color: var(--text); background: color-mix(in srgb, var(--fg) min(100%, calc(5% * var(--line-k))), transparent); }
  .shell-main { padding-bottom: 0; }
  .shell-tabs { display: none; }
  .shell-icon-btn { background: none; border: none; color: ${colors.soft}; cursor: pointer; display: flex; padding: 4px; }
  @media (max-width: 899px) {
    .shell-help { display: none !important; }
    .shell-sections { display: none; }
    .shell-bar { padding: 0 12px; gap: 8px; }
    .shell-logo-text { display: none; }
    .shell-switch-btn { max-width: none; width: 100%; min-width: 0; padding: 6px 8px; }
    .shell-switch-name { flex: 1; min-width: 0; text-align: left; }
    .shell-switch-btn .shell-role { display: none; }
    .shell-switcher { flex: 1; min-width: 0; }
    .shell-switch-pop { width: calc(100vw - 24px); left: -48px; }
    .shell-main { padding-bottom: calc(76px + env(safe-area-inset-bottom)); }
    .shell-tabs { display: flex; position: fixed; left: 0; right: 0; bottom: 0; z-index: 60; padding: 6px 6px calc(6px + env(safe-area-inset-bottom));
      background: color-mix(in srgb, var(--bg) 94%, transparent); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border-top: 1px solid color-mix(in srgb, var(--fg) min(100%, calc(7% * var(--line-k))), transparent); }
    .shell-tab { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 6px 2px; border-radius: 10px; border: none;
      background: none; color: ${colors.muted}; font-size: 11px; font-weight: 600; text-decoration: none; cursor: pointer; }
    .shell-tab.is-active { color: ${colors.accentText}; }
    .shell-sheet-backdrop { position: fixed; inset: 0; z-index: 80; background: rgba(0,0,0,0.55); display: flex; align-items: flex-end; }
    .shell-sheet { width: 100%; max-height: 82vh; overflow-y: auto; border-radius: 22px 22px 0 0; padding: 16px 16px calc(20px + env(safe-area-inset-bottom));
      background: var(--chrome); background-image: ${GRAIN}; border-top: 1px solid color-mix(in srgb, var(--fg) min(100%, calc(9% * var(--line-k))), transparent); animation: shellUp .2s ease; }
    @keyframes shellUp { from { transform: translateY(30px); opacity: .6 } to { transform: none; opacity: 1 } }
    .shell-sheet-head { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
    .shell-sheet-head strong { font-size: 16px; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .shell-sheet-head .shell-role + .shell-icon-btn, .shell-sheet-head strong + .shell-icon-btn { margin-left: auto; }
    .shell-sheet-ws { display: flex; gap: 6px; overflow-x: auto; overflow-y: hidden; padding-bottom: 6px; margin-bottom: 8px; scrollbar-width: none; }
    .shell-chip { flex-shrink: 0; padding: 7px 12px; border-radius: 20px; border: 1px solid color-mix(in srgb, var(--fg) min(100%, calc(10% * var(--line-k))), transparent); background: color-mix(in srgb, var(--fg) min(100%, calc(4% * var(--line-k))), transparent);
      color: ${colors.soft}; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
    .shell-chip.is-active { color: ${colors.accentText}; border-color: color-mix(in srgb, var(--accent) 40%, transparent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
    .shell-sheet-section { margin-top: 12px; }
    .shell-cards-sheet { grid-template-columns: 1fr 1fr; min-width: 0; }
    .shell-cards-sheet .shell-card { background-image: linear-gradient(145deg, color-mix(in srgb, var(--tint) 20%, transparent), color-mix(in srgb, var(--tint) 4%, transparent) 70%); }
    .shell-sheet-foot { margin-top: 16px; padding-top: 10px; border-top: 1px solid color-mix(in srgb, var(--fg) min(100%, calc(7% * var(--line-k))), transparent); }
  }
  @media (max-width: 899px) and (prefers-reduced-transparency: reduce), (max-width: 899px) and (update: slow) {
    .shell-bar, .shell-tabs { backdrop-filter: none; -webkit-backdrop-filter: none; background: var(--chrome); }
  }
`
