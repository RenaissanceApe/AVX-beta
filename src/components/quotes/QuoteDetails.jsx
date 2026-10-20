import { useI18n } from '../../i18n'
import { input, label, colors } from '../ui'
import { HintLabel } from '../help/HelpParts'

// Client, dates, money settings and texts of a quote.
export default function QuoteDetails({ quote, gigs, onChange }) {
  const { t } = useI18n()
  const set = (k, v) => onChange({ [k]: v })
  const field = (key, labelKey, props = {}) => (
    <div style={props.wide ? { gridColumn: '1 / -1' } : undefined}>
      <label style={label} htmlFor={`qd-${key}`}>{t(labelKey)}</label>
      <input id={`qd-${key}`} value={quote[key] ?? ''} onChange={e => set(key, e.target.value)} maxLength={props.max || 200}
        type={props.type || 'text'} style={input} />
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', animation: 'fadeIn 0.2s ease' }}>
      <fieldset style={box}>
        <legend style={legend}>{t('quote.client')}</legend>
        <div style={grid}>
          {field('client_company', 'quotes.clientCompany')}
          {field('client_name', 'quotes.clientName')}
          {field('client_email', 'common.email', { type: 'email' })}
          {field('client_tax_id', 'quote.clientTaxId', { max: 40 })}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={label} htmlFor="qd-address">{t('quote.clientAddress')}</label>
            <textarea id="qd-address" value={quote.client_address ?? ''} onChange={e => set('client_address', e.target.value)} rows={2} maxLength={500} style={{ ...input, resize: 'vertical' }} />
          </div>
        </div>
      </fieldset>

      <fieldset style={box}>
        <legend style={legend}>{t('quote.conditions')}</legend>
        <div style={grid}>
          {field('manager_name', 'quote.managerName', { max: 120 })}
          {field('payment_terms', 'quote.paymentTerms', { max: 500, wide: true })}
          {field('issue_date', 'quote.issueDate', { type: 'date' })}
          {field('valid_until', 'quote.validUntil', { type: 'date' })}
          <div>
            <label style={label} htmlFor="qd-lang">{t('quotes.language')}</label>
            <select id="qd-lang" value={quote.language} onChange={e => set('language', e.target.value)} style={{ ...input, cursor: 'pointer' }}>
              <option value="pt">Português</option>
              <option value="en">English</option>
            </select>
          </div>
          <div>
            <label style={label} htmlFor="qd-currency">{t('quote.currency')}</label>
            <select id="qd-currency" value={quote.currency} onChange={e => set('currency', e.target.value)} style={{ ...input, cursor: 'pointer' }}>
              {['EUR', 'GBP', 'USD', 'CHF', 'BRL'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <HintLabel htmlFor="qd-vat" hint="vat">{t('quote.vatRate')}</HintLabel>
            <input id="qd-vat" type="number" min="0" max="100" step="0.01" value={quote.vat_rate} onChange={e => set('vat_rate', e.target.value)} style={input} />
          </div>
          <div>
            <label style={label} htmlFor="qd-disc">{t('quote.quoteDiscount')}</label>
            <input id="qd-disc" type="number" min="0" max="100" step="0.5" value={quote.discount_pct} onChange={e => set('discount_pct', e.target.value)} style={input} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={label} htmlFor="qd-gig">{t('quote.linkedGig')}</label>
            <select id="qd-gig" value={quote.gig_id || ''} onChange={e => set('gig_id', e.target.value || null)} style={{ ...input, cursor: 'pointer' }}>
              <option value="">{t('quote.noGig')}</option>
              {gigs.map(g => <option key={g.id} value={g.id}>{g.name}{g.start_date ? ` · ${g.start_date}` : ''}</option>)}
            </select>
          </div>
          <label style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '14px', cursor: 'pointer' }}>
            <input type="checkbox" checked={quote.show_line_prices} onChange={e => set('show_line_prices', e.target.checked)} style={{ marginTop: '3px', accentColor: colors.accent }} />
            <span>
              {t('quote.showLinePrices')}
              <span style={{ display: 'block', fontSize: '12px', color: colors.muted, marginTop: '2px' }}>{t('quote.showLinePricesHint')}</span>
            </span>
          </label>
        </div>
      </fieldset>

      <fieldset style={box}>
        <legend style={legend}>{t('quote.texts')}</legend>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={label} htmlFor="qd-intro">{t('quote.intro')}</label>
            <textarea id="qd-intro" value={quote.intro ?? ''} onChange={e => set('intro', e.target.value)} rows={3} maxLength={5000}
              placeholder={t('quote.introPlaceholder')} style={{ ...input, resize: 'vertical', lineHeight: 1.5 }} />
          </div>
          <div>
            <label style={label} htmlFor="qd-terms">{t('quote.terms')}</label>
            <textarea id="qd-terms" value={quote.terms ?? ''} onChange={e => set('terms', e.target.value)} rows={5} maxLength={5000}
              placeholder={t('company.termsPlaceholder')} style={{ ...input, resize: 'vertical', lineHeight: 1.5 }} />
          </div>
        </div>
      </fieldset>
    </div>
  )
}

const box = { border: '1px solid color-mix(in srgb, var(--fg) min(100%, calc(7% * var(--line-k))), transparent)', borderRadius: '14px', padding: '14px 16px 16px', minWidth: 0 }
const legend = { padding: '0 6px', fontSize: '13px', fontWeight: 700, color: colors.soft }
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }
