import { useEffect, useState } from 'react'
import { LogOut, CheckCircle, Download, Trash2, Contact, ShieldCheck, ChevronRight, ChevronLeft, User, KeyRound, CalendarOff, Bell, Palette, Shield, CalendarDays, Archive } from 'lucide-react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { removeGigFiles } from '../lib/storage'
import PushSettings from '../components/PushSettings'
import BlockedPeople from '../components/BlockedPeople'
import { Hint } from '../components/help/HelpParts'
import { useI18n, LANGUAGES } from '../i18n'
import AvailabilitySection from '../components/AvailabilitySection'
import AppearanceSettings from '../components/AppearanceSettings'
import TwoStepSection from '../components/TwoStepSection'
import CalendarFeedSection from '../components/CalendarFeedSection'
import DrivingLicenceSection from '../components/DrivingLicenceSection'
import { supabase } from '../lib/supabase'
import { useAuth, MIN_PASSWORD_LENGTH } from '../lib/AuthContext'
import { useWorkspace } from '../lib/WorkspaceContext'
import AppShell from '../components/shell/AppShell'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { AvxLoader } from '../components/ui'

// The sections of the settings page, in order (the AVX reviews one only for AVX admins)
export const SETTINGS_SECTIONS = ['profile', 'security', 'availability', 'notifications', 'preferences', 'privacy', 'calendar', 'data']
const ICONS = { profile: User, security: KeyRound, availability: CalendarOff, notifications: Bell, preferences: Palette, privacy: Shield, calendar: CalendarDays, data: Archive, reviews: ShieldCheck }

// Your settings (was the Account dialog): a list of sections on the left and the chosen one on the
// right on wide screens; on phones the list first, then one section with a way back.
//   /settings            the list (phones) or the first section (wide screens)
//   /settings/:section   one section
export default function SettingsPage() {
  const { section: current } = useParams()
  const { user, profile, updateProfile, signOut } = useAuth()
  const { orgs } = useWorkspace()
  const isAnyAdmin = orgs.some(o => o.myRole === 'admin')
  const { notify } = useToast()
  const [fullName, setFullName] = useState(profile?.full_name || '')
  const [phone, setPhone] = useState(profile?.phone || '')
  const [savingName, setSavingName] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const navigate = useNavigate()
  // AVX admins (docs/CREW_NETWORK.md, N4): how many reviews wait; null for everyone else
  const [queue, setQueue] = useState(null)
  useEffect(() => {
    supabase.rpc('trust_queue_count').then(({ data, error }) => { if (!error) setQueue(data ?? null) })
  }, [])
  const { t, lang, setLang } = useI18n()

  async function saveName(e) {
    e.preventDefault()
    if (!fullName.trim()) return
    setSavingName(true)
    const { error } = await updateProfile({ full_name: fullName.trim(), phone: phone.trim() || null })
    setSavingName(false)
    if (error) {
      logger.error('account', error, { step: 'updateProfile' })
      notify(userMessage(error), 'error')
    } else {
      notify(t('account.profileUpdated'), 'success')
    }
  }

  async function savePassword(e) {
    e.preventDefault()
    setPasswordError('')
    if (password.length < MIN_PASSWORD_LENGTH) return setPasswordError(t('auth.passwordMin', { min: MIN_PASSWORD_LENGTH }))
    if (password !== confirm) return setPasswordError(t('auth.passwordsDiffer'))
    setSavingPassword(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSavingPassword(false)
    if (error) {
      logger.error('account', error, { step: 'updatePassword' })
      setPasswordError(userMessage(error))
    } else {
      setPassword('')
      setConfirm('')
      notify(t('account.passwordChanged'), 'success')
    }
  }

  async function changeLanguage(next) {
    setLang(next)
    const { error } = await updateProfile({ language: next })
    if (error) logger.error('account', error, { step: 'language' })
  }

  async function changeFindable(value) {
    const { error } = await updateProfile({ findable_by: value })
    if (error) {
      logger.error('account', error, { step: 'findableBy' })
      notify(userMessage(error), 'error')
    }
  }

  async function changeWeekly(on) {
    const { error } = await updateProfile({ weekly_numbers: on })
    if (error) {
      logger.error('account', error, { step: 'weeklyNumbers' })
      notify(userMessage(error), 'error')
    }
  }

  async function changeDigest(on) {
    const { error } = await updateProfile({ email_digest: on })
    if (error) {
      logger.error('account', error, { step: 'emailDigest' })
      notify(userMessage(error), 'error')
    }
  }

  // GDPR data access: everything AVX stores about you, as a JSON file
  async function exportData() {
    setExporting(true)
    try {
      const [profileRes, orgsRes, gigsRes, postsRes, assetsRes, messagesRes, savedRes, acksRes, callsRes] = await Promise.all([
        supabase.rpc('my_profile').maybeSingle(),
        supabase.from('org_members').select('role, joined_at, organisations(id, name, created_at)').eq('user_id', user.id),
        supabase.from('gig_members').select('role, function_title, call_time, gigs(id, name, venue, start_date, end_date, status)').eq('user_id', user.id),
        supabase.from('feed_posts').select('id, gig_id, content, is_important, created_at').eq('user_id', user.id),
        supabase.from('assets').select('id, gig_id, type, name, version, file_size, created_at').eq('created_by', user.id),
        supabase.from('messages').select('id, conversation_id, body, reply_to, attachments, payload, mentions, edited_at, deleted_at, needs_ack, created_at').eq('author_id', user.id).order('created_at'),
        supabase.from('saved_messages').select('message_id, conversation_id, saved, saved_at').eq('user_id', user.id),
        supabase.from('message_acks').select('message_id, conversation_id, acked_at').eq('user_id', user.id),
        supabase.from('crew_call_answers').select('call_id, answer, answered_at, crew_calls(title, gig_id, created_at)').eq('user_id', user.id),
      ])
      const firstError = [profileRes, orgsRes, gigsRes, postsRes, assetsRes, messagesRes, savedRes, acksRes, callsRes].find(r => r.error)?.error
      if (firstError) throw firstError
      const data = {
        exported_at: new Date().toISOString(),
        account: { id: user.id, email: user.email, created_at: user.created_at, last_sign_in_at: user.last_sign_in_at },
        profile: profileRes.data,
        organisations: orgsRes.data,
        gigs: gigsRes.data,
        feed_posts: postsRes.data,
        uploaded_assets: assetsRes.data,
        messages_sent: messagesRes.data,
        messages_saved: savedRes.data,
        announcements_confirmed: acksRes.data,
        crew_calls_received: callsRes.data,
      }
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `avx-data-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      logger.error('account', err, { step: 'export' })
      notify(t('account.exportFailed', { reason: userMessage(err) }), 'error')
    } finally {
      setExporting(false)
    }
  }

  async function deleteAccount() {
    setDeleting(true)
    try {
      const { data: plan, error: planError } = await supabase.rpc('account_deletion_plan')
      if (planError) throw planError
      if (plan.blocking_orgs.length) {
        const names = plan.blocking_orgs.map(o => `"${o.name}"`).join(', ')
        notify(t('account.onlyAdmin', { names }), 'error', { duration: 12000 })
        return
      }
      const extra = plan.orgs_to_delete.length
        ? '\n\n' + t('account.onlyMember', { names: plan.orgs_to_delete.map(o => `"${o.name}"`).join(', ') })
        : ''
      const typed = window.prompt(t('account.deletePrompt', { email: user.email, extra, word: t('account.deleteWord') }))
      if (typed === null) return
      if (typed.trim().toUpperCase() !== t('account.deleteWord')) {
        notify(t('account.nothingDeleted'), 'info')
        return
      }
      await removeGigFiles(plan.gig_ids)
      const { error } = await supabase.rpc('delete_my_account')
      if (error) throw error
      // The session is no longer valid; clear it locally
      await supabase.auth.signOut({ scope: 'local' })
      notify(t('account.deleted'), 'success')
      navigate('/auth', { replace: true })
    } catch (err) {
      logger.error('account', err, { step: 'delete' })
      notify(/function .*does not exist|could not find the function/i.test(err.message || '')
        ? t('account.deletionDisabled')
        : t('account.deleteFailed', { reason: userMessage(err) }), 'error')
    } finally {
      setDeleting(false)
    }
  }

  const sections = queue != null ? [...SETTINGS_SECTIONS, 'reviews'] : SETTINGS_SECTIONS
  const wide = useWide()
  if (current && !sections.includes(current)) return <Navigate to="/settings" replace />
  const shown = current || (wide ? 'profile' : null)
  const title = s => t(`settings.section.${s}`)

  const content = {
    profile: <>
      <form onSubmit={saveName} style={section}>
        <label style={label} htmlFor="account-name">{t('auth.fullName')}</label>
        <input id="account-name" value={fullName} onChange={e => setFullName(e.target.value)}
          autoComplete="name" maxLength={120} style={{ ...input, marginBottom: '12px' }} />
        <label style={label} htmlFor="account-phone">{t('account.phone')}</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input id="account-phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)}
            autoComplete="tel" maxLength={40} placeholder="+351 912 345 678" style={input} />
          <button type="submit"
            disabled={savingName || !fullName.trim() || (fullName.trim() === profile?.full_name && phone.trim() === (profile?.phone || ''))}
            style={smallBtn}>
            {savingName ? <AvxLoader size={14} /> : <CheckCircle size={14} />} {t('common.save')}
          </button>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '6px' }}>{t('account.phoneHint')}</p>
      </form>
      <DrivingLicenceSection style={section} smallBtn={smallBtn} />
      <div style={section}>
        <span style={label} id="account-crew-profile">{t('crewProfile.title')}</span>
        <p style={{ color: 'var(--muted)', fontSize: '13px', lineHeight: 1.5, marginBottom: '10px' }}>{t('crewProfile.accountHint')}</p>
        <button type="button" aria-describedby="account-crew-profile" onClick={() => navigate('/me/profile')} style={smallBtn}><Contact size={14} /> {t('crewProfile.open')}</button>
      </div>
    </>,
    security: <>
      <form onSubmit={savePassword} style={section}>
        <label style={label} htmlFor="account-password">{t('account.changePassword')}</label>
        {/* Hidden username field helps password managers update the right entry */}
        <input type="email" value={user?.email || ''} autoComplete="username" readOnly hidden />
        <input id="account-password" type="password" value={password} onChange={e => setPassword(e.target.value)}
          placeholder={t('auth.newPasswordPlaceholder', { min: MIN_PASSWORD_LENGTH })} autoComplete="new-password" style={{ ...input, marginBottom: '8px' }} />
        <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
          placeholder={t('auth.confirmPassword')} autoComplete="new-password" style={{ ...input, marginBottom: '8px' }} />
        {passwordError && <p style={{ color: 'var(--danger)', fontSize: '13px', marginBottom: '8px' }}>{passwordError}</p>}
        <button type="submit" disabled={savingPassword || !password} style={smallBtn}>
          {savingPassword && <AvxLoader size={14} />} {t('account.updatePassword')}
        </button>
      </form>
      <div style={section}>
        <TwoStepSection label={label} input={input} smallBtn={smallBtn} />
      </div>
    </>,
    availability: <div style={section}><AvailabilitySection /></div>,
    notifications: <>
      <div style={section}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer', fontSize: '14px' }}>
          <input type="checkbox" checked={profile?.email_digest !== false} onChange={e => changeDigest(e.target.checked)}
            style={{ marginTop: '3px', accentColor: 'var(--accent)' }} />
          <span>
            <span style={{ fontWeight: 600 }}>{t('account.emailDigest')}</span>
            <span style={{ display: 'block', color: 'var(--muted)', fontSize: '13px', marginTop: '3px', lineHeight: 1.5 }}>{t('account.emailDigestHint')}</span>
          </span>
        </label>
      </div>
      {/* K9: the weekly key numbers, for admins only (off unless they turn it on) */}
      {isAnyAdmin && (
        <div style={section}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer', fontSize: '14px' }}>
            <input type="checkbox" checked={profile?.weekly_numbers === true} onChange={e => changeWeekly(e.target.checked)}
              style={{ marginTop: '3px', accentColor: 'var(--accent)' }} />
            <span>
              <span style={{ fontWeight: 600 }}>{t('account.weeklyNumbers')}</span>
              <span style={{ display: 'block', color: 'var(--muted)', fontSize: '13px', marginTop: '3px', lineHeight: 1.5 }}>{t('account.weeklyNumbersHint')}</span>
            </span>
          </label>
        </div>
      )}
      <div style={section}><PushSettings /></div>
    </>,
    preferences: <>
      <div style={section}>
        <label style={label} htmlFor="account-language">{t('account.language')}</label>
        <select id="account-language" value={lang} onChange={e => changeLanguage(e.target.value)} style={{ ...input, cursor: 'pointer' }}>
          {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      </div>
      <div style={section}><AppearanceSettings /></div>
    </>,
    privacy: <>
      <div style={section}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}><span style={{ ...label, marginBottom: 0 }} id="account-findable">{t('account.findable')}</span><Hint id="findable" label={t('account.findable')} /></div>
        <div role="radiogroup" aria-labelledby="account-findable" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {['managers', 'crew'].map(v => (
            <label key={v} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer', fontSize: '14px' }}>
              <input type="radio" name="findable" checked={(profile?.findable_by || 'managers') === v} onChange={() => changeFindable(v)}
                style={{ marginTop: '3px', accentColor: 'var(--accent)' }} />
              <span>
                <span style={{ fontWeight: 600 }}>{t(`account.findableOpt.${v}`)}</span>
                <span style={{ display: 'block', color: 'var(--muted)', fontSize: '13px', marginTop: '2px', lineHeight: 1.5 }}>{t(`account.findableHint.${v}`)}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
      <BlockedPeople style={section} />
    </>,
    calendar: <div style={section}><CalendarFeedSection label={label} input={input} smallBtn={smallBtn} /></div>,
    data: <div style={section}>
      <span style={label}>{t('account.yourData')}</span>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button onClick={exportData} disabled={exporting} style={smallBtn}>
          {exporting ? <AvxLoader size={14} /> : <Download size={14} />} {t('account.export')}
        </button>
        <button onClick={deleteAccount} disabled={deleting} style={{ ...smallBtn, background: 'transparent', borderColor: 'var(--danger)', color: 'var(--danger)' }}>
          {deleting ? <AvxLoader size={14} /> : <Trash2 size={14} />} {t('account.delete')}
        </button>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '8px', lineHeight: 1.5 }}>
        {t('account.privacyPrefix')} <a href="/privacy" target="_blank" rel="noopener" style={{ color: 'var(--accent-text)' }}>{t('auth.agreePrivacy')}</a> {t('account.privacySuffix')}
      </p>
    </div>,
    reviews: <div style={section}>
      <span style={label} id="account-trust">{t('trust.admin.title')}</span>
      <p style={{ color: 'var(--muted)', fontSize: '13px', lineHeight: 1.5, marginBottom: '10px' }}>{t('trust.admin.accountHint', { count: queue ?? 0 })}</p>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button type="button" aria-describedby="account-trust" onClick={() => navigate('/admin/trust')} style={smallBtn}><ShieldCheck size={14} /> {t('trust.admin.open')}</button>
        <button type="button" onClick={() => navigate('/admin/truss')} style={smallBtn}><ShieldCheck size={14} /> {t('trussReview.open')}</button>
      </div>
    </div>,
  }

  const signOutBtn = (
    <button onClick={signOut} style={{ ...smallBtn, background: 'var(--danger-soft)', borderColor: 'var(--danger)', color: 'var(--danger)', width: '100%', justifyContent: 'center' }}>
      <LogOut size={14} /> {t('account.signOut')}
    </button>
  )

  return (
    <AppShell>
      <style>{SETTINGS_CSS}</style>
      <div className="settings">
        {(wide || !shown) && (
          <nav className="settings-nav" aria-labelledby="settings-title">
            <h1 id="settings-title" style={{ fontSize: '22px', fontWeight: 700 }}>{t('settings.title')}</h1>
            <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '4px 0 16px', wordBreak: 'break-all' }}>{user?.email}</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {sections.map(s => {
                const Icon = ICONS[s]
                const on = s === shown
                return (
                  <li key={s}>
                    <Link to={`/settings/${s}`} aria-current={on ? 'page' : undefined} className={`settings-link${on ? ' on' : ''}`}>
                      <Icon size={16} aria-hidden="true" />
                      <span style={{ flex: 1, minWidth: 0 }}>{title(s)}{s === 'reviews' && queue > 0 && <span className="settings-badge"> {queue}</span>}</span>
                      {!wide && <ChevronRight size={16} aria-hidden="true" />}
                    </Link>
                  </li>
                )
              })}
            </ul>
            <div style={{ marginTop: '24px' }}>{signOutBtn}</div>
          </nav>
        )}
        {shown && (
          <section className="settings-body" aria-labelledby="settings-section-title">
            {!wide && <Link to="/settings" className="settings-back"><ChevronLeft size={16} aria-hidden="true" /> {t('settings.title')}</Link>}
            <h2 id="settings-section-title" style={{ fontSize: '22px', fontWeight: 700, marginBottom: '4px' }}>{title(shown)}</h2>
            <p style={{ color: 'var(--muted)', fontSize: '13px', lineHeight: 1.5, marginBottom: '32px' }}>{t(`settings.hint.${shown}`)}</p>
            {content[shown]}
          </section>
        )}
      </div>
    </AppShell>
  )
}

// Wide enough for the list and a section side by side
function useWide() {
  const query = '(min-width: 760px)'
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(query).matches)
  useEffect(() => {
    const m = window.matchMedia?.(query)
    if (!m) return
    const on = () => setWide(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return wide
}

const SETTINGS_CSS = `
.settings { max-width: 1040px; margin: 0 auto; padding: var(--space-5) var(--gutter) var(--space-7); display: grid; gap: var(--space-6) var(--space-7); grid-template-columns: minmax(0, 1fr); }
@media (min-width: 760px) { .settings { grid-template-columns: 240px minmax(0, 1fr); } .settings-nav { position: sticky; top: 76px; align-self: start; } }
.settings-link { display: flex; align-items: center; gap: 12px; padding: 12px 12px 12px 10px; min-height: 44px; border-left: 2px solid transparent; color: var(--text); text-decoration: none; font-size: 14px; font-weight: 600; }
.settings-link:hover { background: color-mix(in srgb, var(--fg) 6%, transparent); }
/* The open section: text colour with a 2px accent bar, not a wash (DESIGN.md rule 3) */
.settings-link.on { color: var(--text); border-left-color: var(--accent); background: color-mix(in srgb, var(--fg) 4%, transparent); }
.settings-link:focus-visible, .settings-back:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.settings-badge { color: var(--accent-text); }
.settings-back { display: inline-flex; align-items: center; gap: 4px; color: var(--accent-text); text-decoration: none; font-size: 14px; font-weight: 600; margin-bottom: 12px; }
.settings-body { min-width: 0; max-width: 620px; }
`

// One group of settings: space shows where it ends, no rule under it (DESIGN.md "Room to breathe")
const section = { marginBottom: 'var(--space-section)' }
const label = {
  display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--muted)',
  fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: '8px'
}
const input = {
  width: '100%', padding: '10px 13px', background: 'var(--shade)', border: '1px solid var(--line)',
  color: 'var(--text)', fontSize: '14px', outline: 'none'
}
// A plain button: settings have no single loud action, so none of them is green (rule 3)
const smallBtn = {
  display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 16px', minHeight: '36px',
  border: '1px solid var(--line-strong)', background: 'transparent', color: 'var(--text)',
  fontWeight: 600, fontSize: '14px', cursor: 'pointer', flexShrink: 0
}
