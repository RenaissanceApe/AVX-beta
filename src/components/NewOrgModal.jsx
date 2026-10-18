import { useState } from 'react'
import { Loader2, CheckCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { logger, userMessage } from '../lib/logger'
import { useI18n } from '../i18n'
import { Modal, btnPrimary, input, label, colors } from './ui'

// Create an organisation; the creator becomes its admin (database trigger).
export default function NewOrgModal({ onClose, onCreated }) {
  const { user } = useAuth()
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    const { data, error: err } = await supabase.from('organisations').insert({ name: name.trim(), created_by: user.id }).select().single()
    setSaving(false)
    if (err) {
      logger.error('orgs', err, { step: 'create' })
      return setError(userMessage(err))
    }
    onCreated(data)
  }

  return (
    <Modal title={t('dash.newOrg')} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <label style={label} htmlFor="new-org-name">{t('dash.orgName')}</label>
          <input id="new-org-name" value={name} onChange={e => setName(e.target.value)} placeholder={t('dash.orgNamePlaceholder')}
            maxLength={120} style={input} autoFocus />
        </div>
        {error && (
          <div role="alert" style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: colors.danger, fontSize: '13px' }}>
            {error}
          </div>
        )}
        <button type="submit" disabled={saving || !name.trim()} style={{ ...btnPrimary, justifyContent: 'center', padding: '13px' }}>
          {saving ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={16} />} {t('dash.createOrg')}
        </button>
      </form>
    </Modal>
  )
}
