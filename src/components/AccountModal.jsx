import { useState } from 'react'
import { X, Loader2, LogOut, CheckCircle, Download, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { removeGigFiles } from '../lib/storage'
import PushSettings from './PushSettings'
import BlockedPeople from './BlockedPeople'
import { Hint } from './help/HelpParts'
import { useI18n, LANGUAGES } from '../i18n'
import AvailabilitySection from './AvailabilitySection'
import AppearanceSettings from './AppearanceSettings'
import TwoStepSection from './TwoStepSection'
import CalendarFeedSection from './CalendarFeedSection'
import { supabase } from '../lib/supabase'
import { useAuth, MIN_PASSWORD_LENGTH } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'

// Account settings: display name, password change, data export, account deletion, sign out.
export default function AccountModal({ onClose }) {
  const { user, profile, updateProfile, signOut } = useAuth()
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
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
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

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="account-title" style={panel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <h2 id="account-title" style={{ fontSize: '18px', fontWeight: 700 }}>{t('account.title')}</h2>
          <button onClick={onClose} aria-label={t('common.close')} style={iconBtn}><X size={18} /></button>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: '13px', marginBottom: '22px', wordBreak: 'break-all' }}>{user?.email}</p>

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
              {savingName ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={14} />} {t('common.save')}
            </button>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '12px', marginTop: '6px' }}>{t('account.phoneHint')}</p>
        </form>

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
            {savingPassword && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />} {t('account.updatePassword')}
          </button>
        </form>

        <div style={section}>
          <TwoStepSection label={label} input={input} smallBtn={smallBtn} />
        </div>

        <div style={section}>
          <AvailabilitySection />
        </div>

        <div style={section}>
          <label style={label} htmlFor="account-language">{t('account.language')}</label>
          <select id="account-language" value={lang} onChange={e => changeLanguage(e.target.value)} style={{ ...input, cursor: 'pointer' }}>
            {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </div>

        <div style={section}>
          <AppearanceSettings />
        </div>

        <div style={section}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}><span style={{ ...label, marginBottom: 0 }} id="account-findable">{t('account.findable')}</span><Hint id="findable" label={t('account.findable')} /></div>
          <div role="radiogroup" aria-labelledby="account-findable" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {['managers', 'crew'].map(v => (
              <label key={v} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', fontSize: '14px' }}>
                <input type="radio" name="findable" checked={(profile?.findable_by || 'managers') === v} onChange={() => changeFindable(v)}
                  style={{ marginTop: '3px', accentColor: 'var(--accent)' }} />
                <span>
                  <span style={{ fontWeight: 600 }}>{t(`account.findableOpt.${v}`)}</span>
                  <span style={{ display: 'block', color: 'var(--muted)', fontSize: '12px', marginTop: '2px', lineHeight: 1.5 }}>{t(`account.findableHint.${v}`)}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div style={section}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', fontSize: '14px' }}>
            <input type="checkbox" checked={profile?.email_digest !== false} onChange={e => changeDigest(e.target.checked)}
              style={{ marginTop: '3px', accentColor: 'var(--accent)' }} />
            <span>
              <span style={{ fontWeight: 600 }}>{t('account.emailDigest')}</span>
              <span style={{ display: 'block', color: 'var(--muted)', fontSize: '12px', marginTop: '3px', lineHeight: 1.5 }}>{t('account.emailDigestHint')}</span>
            </span>
          </label>
        </div>

        <div style={section}>
          <PushSettings />
        </div>

        <div style={section}>
          <CalendarFeedSection label={label} input={input} smallBtn={smallBtn} />
        </div>

        <BlockedPeople style={section} />

        <div style={section}>
          <span style={label}>{t('account.yourData')}</span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={exportData} disabled={exporting} style={smallBtn}>
              {exporting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={14} />} {t('account.export')}
            </button>
            <button onClick={deleteAccount} disabled={deleting} style={{ ...smallBtn, background: 'transparent', borderColor: 'color-mix(in srgb, var(--danger) 30%, transparent)', color: 'var(--danger)' }}>
              {deleting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={14} />} {t('account.delete')}
            </button>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '12px', marginTop: '8px', lineHeight: 1.5 }}>
            {t('account.privacyPrefix')} <a href="/privacy" target="_blank" rel="noopener" style={{ color: 'var(--accent-text)' }}>{t('auth.agreePrivacy')}</a> {t('account.privacySuffix')}
          </p>
        </div>

        <button onClick={signOut} style={{ ...smallBtn, background: 'color-mix(in srgb, var(--danger) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--danger) 25%, transparent)', color: 'var(--danger)', width: '100%', justifyContent: 'center' }}>
          <LogOut size={14} /> {t('account.signOut')}
        </button>
      </div>
    </div>
  )
}

const overlay = {
  position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'calc(16px + var(--safe-top)) 16px 16px'
}
const panel = {
  background: 'var(--panel)', border: '1px solid color-mix(in srgb, var(--fg) min(100%, calc(10% * var(--line-k))), transparent)', borderRadius: '18px',
  padding: '24px', width: '100%', maxWidth: '420px', animation: 'fadeIn 0.2s ease', color: 'var(--text)',
  maxHeight: 'calc(100vh - 32px - var(--safe-top))', overflowY: 'auto'
}
const section = { marginBottom: '22px', paddingBottom: '22px', borderBottom: '1px solid color-mix(in srgb, var(--fg) min(100%, calc(6% * var(--line-k))), transparent)' }
const label = {
  display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted)',
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px'
}
const input = {
  width: '100%', padding: '10px 13px', background: 'color-mix(in srgb, var(--shade) 40%, transparent)', border: '1px solid color-mix(in srgb, var(--fg) min(100%, calc(9% * var(--line-k))), transparent)',
  borderRadius: '9px', color: 'var(--text)', fontSize: '14px', outline: 'none'
}
const smallBtn = {
  display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 14px', borderRadius: '9px',
  border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent-text)',
  fontWeight: 600, fontSize: '13px', cursor: 'pointer', flexShrink: 0
}
const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '4px', display: 'flex' }
