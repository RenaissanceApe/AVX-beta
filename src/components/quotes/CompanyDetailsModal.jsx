import { useEffect, useState } from 'react'
import { Loader2, CheckCircle, ImagePlus, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { useI18n } from '../../i18n'
import { Modal, btn, btnPrimary, input, label, colors } from '../ui'

const FIELDS = ['legal_name', 'tax_id', 'address', 'email', 'phone', 'website']
const MAX_HEADER_BYTES = 320 * 1024 // stored as a data: URL (base64 adds a third)
const HEADER_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml']

// Company details printed on every quote, plus quote defaults. Only admins can change them.
export default function CompanyDetailsModal({ org, canEdit, onClose, onSaved }) {
  const { t } = useI18n()
  const { notify } = useToast()
  const [form, setForm] = useState(() => ({
    ...Object.fromEntries(FIELDS.map(f => [f, org[f] || ''])),
    quote_terms: org.quote_terms || '',
    default_vat_rate: org.default_vat_rate ?? 23,
    quote_validity_days: org.quote_validity_days ?? 30,
    quote_number_prefix: org.quote_number_prefix ?? 'Q',
    quote_next_number: org.quote_next_number ?? '',
  }))
  const [branding, setBranding] = useState({ header_image: null, brand_color: '#1EC878' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('org_branding').select('header_image, brand_color').eq('org_id', org.id).maybeSingle()
      .then(({ data }) => { if (data) setBranding(data) })
  }, [org.id])

  function pickHeader(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!HEADER_TYPES.includes(file.type)) return notify(t('company.headerType'), 'error')
    if (file.size > MAX_HEADER_BYTES) return notify(t('company.headerTooBig'), 'error')
    const reader = new FileReader()
    reader.onload = () => setBranding(b => ({ ...b, header_image: reader.result }))
    reader.readAsDataURL(file)
  }
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    const changes = {
      ...Object.fromEntries(FIELDS.map(f => [f, form[f].trim() || null])),
      quote_terms: form.quote_terms.trim() || null,
      default_vat_rate: Number(form.default_vat_rate) || 0,
      quote_validity_days: Math.max(1, Math.round(Number(form.quote_validity_days) || 30)),
      quote_number_prefix: form.quote_number_prefix.trim(),
      quote_next_number: form.quote_next_number === '' ? null : Math.max(1, Math.round(Number(form.quote_next_number) || 1)),
    }
    const [{ data, error }, { error: brandError }] = await Promise.all([
      supabase.from('organisations').update(changes).eq('id', org.id).select().single(),
      supabase.from('org_branding').upsert({ org_id: org.id, header_image: branding.header_image || null, brand_color: branding.brand_color, updated_at: new Date().toISOString() }),
    ])
    setSaving(false)
    if (error || brandError) {
      const err = error || brandError
      logger.error('quotes', err, { step: 'companyDetails' })
      return notify(userMessage(err), 'error')
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
          <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: '12px' }}>
            <span style={label}>{t('company.header')}</span>
            {branding.header_image ? (
              <div style={{ position: 'relative', background: '#fff', borderRadius: '8px', overflow: 'hidden' }}>
                <img src={branding.header_image} alt={t('company.header')} style={{ display: 'block', width: '100%' }} />
                {canEdit && (
                  <button type="button" onClick={() => setBranding(b => ({ ...b, header_image: null }))} aria-label={t('company.removeHeader')} title={t('company.removeHeader')}
                    style={{ position: 'absolute', top: '6px', right: '6px', background: 'rgba(0,0,0,0.65)', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', padding: '4px', display: 'flex' }}>
                    <X size={14} />
                  </button>
                )}
              </div>
            ) : (
              <p style={{ fontSize: '12px', color: colors.muted, marginBottom: '6px' }}>{t('company.noHeader')}</p>
            )}
            {canEdit && (
              <label style={{ ...btn, marginTop: '8px', background: 'transparent', borderColor: 'rgba(255,255,255,0.12)', color: colors.soft }}>
                <ImagePlus size={14} /> {branding.header_image ? t('company.replaceHeader') : t('company.uploadHeader')}
                <input type="file" accept={HEADER_TYPES.join(',')} onChange={pickHeader} style={{ display: 'none' }} />
              </label>
            )}
            <p style={{ fontSize: '12px', color: colors.muted, marginTop: '6px', lineHeight: 1.5 }}>{t('company.headerHint')}</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
            <div>
              <label style={label} htmlFor="co-color">{t('company.brandColor')}</label>
              <input id="co-color" type="color" value={branding.brand_color} onChange={e => setBranding(b => ({ ...b, brand_color: e.target.value }))}
                style={{ ...input, padding: '4px', height: '42px', cursor: 'pointer' }} />
            </div>
            <div>
              <label style={label} htmlFor="co-prefix">{t('company.numberPrefix')}</label>
              <input id="co-prefix" value={form.quote_number_prefix} onChange={e => set('quote_number_prefix', e.target.value)} maxLength={10} placeholder="Q" style={input} />
            </div>
            <div>
              <label style={label} htmlFor="co-next">{t('company.nextNumber')}</label>
              <input id="co-next" type="number" min="1" value={form.quote_next_number} onChange={e => set('quote_next_number', e.target.value)} style={input} />
            </div>
          </div>
          <p style={{ fontSize: '12px', color: colors.muted, marginTop: '-4px', lineHeight: 1.5 }}>{t('company.numberHint')}</p>
          <div>
            <label style={label} htmlFor="co-terms">{t('company.defaultTerms')}</label>
            <textarea id="co-terms" value={form.quote_terms} onChange={e => set("quote_terms", e.target.value)} rows={8} maxLength={5000}
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
