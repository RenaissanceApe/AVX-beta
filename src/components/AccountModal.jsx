import { useState } from 'react'
import { X, Loader2, LogOut, CheckCircle, Download, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { removeGigFiles } from '../lib/storage'
import { useI18n, LANGUAGES } from '../i18n'
import AvailabilitySection from './AvailabilitySection'
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

  // GDPR data access: everything AVX stores about you, as a JSON file
  async function exportData() {
    setExporting(true)
    try {
      const [profileRes, orgsRes, gigsRes, postsRes, assetsRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        supabase.from('org_members').select('role, joined_at, organisations(id, name, created_at)').eq('user_id', user.id),
        supabase.from('gig_members').select('role, function_title, call_time, gigs(id, name, venue, start_date, end_date, status)').eq('user_id', user.id),
        supabase.from('feed_posts').select('id, gig_id, content, is_important, created_at').eq('user_id', user.id),
        supabase.from('assets').select('id, gig_id, type, name, version, file_size, created_at').eq('created_by', user.id),
      ])
      const firstError = [profileRes, orgsRes, gigsRes, postsRes, assetsRes].find(r => r.error)?.error
      if (firstError) throw firstError
      const data = {
        exported_at: new Date().toISOString(),
        account: { id: user.id, email: user.email, created_at: user.created_at, last_sign_in_at: user.last_sign_in_at },
        profile: profileRes.data,
        organisations: orgsRes.data,
        gigs: gigsRes.data,
        feed_posts: postsRes.data,
        uploaded_assets: assetsRes.data,
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
        <p style={{ color: '#4A6070', fontSize: '13px', marginBottom: '22px', wordBreak: 'break-all' }}>{user?.email}</p>

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
          <p style={{ color: '#4A6070', fontSize: '12px', marginTop: '6px' }}>{t('account.phoneHint')}</p>
        </form>

        <form onSubmit={savePassword} style={section}>
          <label style={label} htmlFor="account-password">{t('account.changePassword')}</label>
          {/* Hidden username field helps password managers update the right entry */}
          <input type="email" value={user?.email || ''} autoComplete="username" readOnly hidden />
          <input id="account-password" type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder={t('auth.newPasswordPlaceholder', { min: MIN_PASSWORD_LENGTH })} autoComplete="new-password" style={{ ...input, marginBottom: '8px' }} />
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
            placeholder={t('auth.confirmPassword')} autoComplete="new-password" style={{ ...input, marginBottom: '8px' }} />
          {passwordError && <p style={{ color: '#F87171', fontSize: '13px', marginBottom: '8px' }}>{passwordError}</p>}
          <button type="submit" disabled={savingPassword || !password} style={smallBtn}>
            {savingPassword && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />} {t('account.updatePassword')}
          </button>
        </form>

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
          <span style={label}>{t('account.yourData')}</span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={exportData} disabled={exporting} style={smallBtn}>
              {exporting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={14} />} {t('account.export')}
            </button>
            <button onClick={deleteAccount} disabled={deleting} style={{ ...smallBtn, background: 'transparent', borderColor: 'rgba(239,68,68,0.3)', color: '#F87171' }}>
              {deleting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={14} />} {t('account.delete')}
            </button>
          </div>
          <p style={{ color: '#4A6070', fontSize: '12px', marginTop: '8px', lineHeight: 1.5 }}>
            {t('account.privacyPrefix')} <a href="/privacy" target="_blank" rel="noopener" style={{ color: '#1EC878' }}>{t('auth.agreePrivacy')}</a> {t('account.privacySuffix')}
          </p>
        </div>

        <button onClick={signOut} style={{ ...smallBtn, background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.25)', color: '#F87171', width: '100%', justifyContent: 'center' }}>
          <LogOut size={14} /> {t('account.signOut')}
        </button>
      </div>
    </div>
  )
}

const overlay = {
  position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
}
const panel = {
  background: '#0F1520', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '18px',
  padding: '24px', width: '100%', maxWidth: '420px', animation: 'fadeIn 0.2s ease', color: '#fff',
  maxHeight: 'calc(100vh - 32px)', overflowY: 'auto'
}
const section = { marginBottom: '22px', paddingBottom: '22px', borderBottom: '1px solid rgba(255,255,255,0.06)' }
const label = {
  display: 'block', fontSize: '12px', fontWeight: 600, color: '#4A6070',
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px'
}
const input = {
  width: '100%', padding: '10px 13px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: '9px', color: '#fff', fontSize: '14px', outline: 'none'
}
const smallBtn = {
  display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 14px', borderRadius: '9px',
  border: '1px solid rgba(30,200,120,0.3)', background: 'rgba(30,200,120,0.12)', color: '#1EC878',
  fontWeight: 600, fontSize: '13px', cursor: 'pointer', flexShrink: 0
}
const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', color: '#4A6070', padding: '4px', display: 'flex' }
