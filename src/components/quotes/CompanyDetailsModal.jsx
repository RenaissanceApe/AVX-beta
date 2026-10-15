import { useState } from 'react'
import { Loader2, CheckCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { useI18n } from '../../i18n'
import { Modal, btnPrimary, input, label, colors } from '../ui'

const FIELDS = ['legal_name', 'tax_id', 'address', 'email', 'phone', 'website']

// Company details printed on every quote, plus quote defaults. Only admins can change them.
export default function CompanyDetailsModal({ org, canEdit, onClose, onSaved }) {
  const { t } = useI18n()
  const { notify } = useToast()
  const [form, setForm] = useState(() => ({
    ...Object.fromEntries(FIELDS.map(f => [f, org[f] || ''])),
    quote_terms: org.quote_terms || '',
    default_vat_rate: org.default_vat_rate ?? 23,
    quote_validity_days: org.quote_validity_days ?? 30,
  }))
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    const changes = {
      ...Object.fromEntries(FIELDS.map(f => [f, form[f].trim() || null])),
      quote_terms: form.quote_terms.trim() || null,
      default_vat_rate: Number(form.default_vat_rate) || 0,
      quote_validity_days: Math.max(1, Math.round(Number(form.quote_validity_days) || 30)),
    }
    const { data, error } = await supabase.from('organisations').update(changes).eq('id', org.id).select().single()
    setSaving(false)
    if (error) {
      logger.error('quotes', error, { step: 'companyDetails' })
      return notify(userMessage(error), 'error')
    }
    notify(t('company.saved'), 'success')
    onSaved(data)
    onClose()
  }

  return (
    <Modal title={t('company.title')} onClose={onClose} maxWidth={560}>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5 }}>{canEdit ? t('company.intro') : t('company.adminOnly')}</p>
        <fieldset disabled={!canEdit} style={{ border: 'none', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
            <div>
              <label style={label} htmlFor="co-legal">{t('company.legalName')}</label>
              <input id="co-legal" value={form.legal_name} onChange={e => set('legal_name', e.target.value)} placeholder={org.name} maxLength={200} style={input} />
            </div>
            <div>
              <label style={label} htmlFor="co-tax">{t('company.taxId')}</label>
              <input id="co-tax" value={form.tax_id} onChange={e => set('tax_id', e.target.value)} maxLength={40} style={input} />
            </div>
          </div>
          <div>
            <label style={label} htmlFor="co-address">{t('company.address')}</label>
            <textarea id="co-address" value={form.address} onChange={e => set('address', e.target.value)} rows={2} maxLength={500} style={{ ...input, resize: 'vertical' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
            <div>
              <label style={label} htmlFor="co-email">{t('common.email')}</label>
              <input id="co-email" type="email" value={form.email} onChange={e => set('email', e.target.value)} maxLength={200} style={input} />
            </div>
            <div>
              <label style={label} htmlFor="co-phone">{t('company.phone')}</label>
              <input id="co-phone" value={form.phone} onChange={e => set('phone', e.target.value)} maxLength={60} style={input} />
            </div>
            <div>
              <label style={label} htmlFor="co-web">{t('company.website')}</label>
              <input id="co-web" value={form.website} onChange={e => set('website', e.target.value)} maxLength={200} style={input} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={label} htmlFor="co-vat">{t('company.defaultVat')}</label>
              <input id="co-vat" type="number" min="0" max="100" step="0.01" value={form.default_vat_rate} onChange={e => set('default_vat_rate', e.target.value)} style={input} />
            </div>
            <div>
              <label style={label} htmlFor="co-valid">{t('company.validityDays')}</label>
              <input id="co-valid" type="number" min="1" max="365" value={form.quote_validity_days} onChange={e => set('quote_validity_days', e.target.value)} style={input} />
            </div>
          </div>
          <div>
            <label style={label} htmlFor="co-terms">{t('company.defaultTerms')}</label>
            <textarea id="co-terms" value={form.quote_terms} onChange={e => set('quote_terms', e.target.value)} rows={4} maxLength={5000}
              placeholder={t('company.termsPlaceholder')} style={{ ...input, resize: 'vertical', lineHeight: 1.5 }} />
          </div>
        </fieldset>
        {canEdit && (
          <button type="submit" disabled={saving} style={{ ...btnPrimary, justifyContent: 'center' }}>
            {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={15} />} {t('common.saveChanges')}
          </button>
        )}
      </form>
    </Modal>
  )
}
