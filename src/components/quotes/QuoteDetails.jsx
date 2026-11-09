import { useState } from 'react'
import { Link } from 'react-router-dom'
import { UserPlus, Check } from 'lucide-react'
import { useI18n } from '../../i18n'
import { input, label, colors, btn, AvxLoader, space } from '../ui'
import { HintLabel } from '../help/HelpParts'

// A client from the contacts directory as the quote's client fields. The quote keeps its own
// copy, so changing the contact later doesn't change a quote already sent.
export const clientFields = c => ({
  client_id: c.id, client_company: c.name, client_name: c.contact_name || '', client_email: c.email || '',
  client_address: c.address || '', client_tax_id: c.tax_id || '',
})

// Client, dates, money settings and texts of a quote. clients: the organisation's contacts
// directory; onSaveClient: adds the client typed here to it (and links the quote).
export default function QuoteDetails({ quote, gigs, clients = [], onChange, onSaveClient, onApplyVat }) {
  const { t } = useI18n()
  const [savingClient, setSavingClient] = useState(false)
  const linked = clients.find(c => c.id === quote.client_id)
  const typed = (quote.client_company || '').trim() || (quote.client_name || '').trim()
  function pick(id) {
    const c = clients.find(x => x.id === id)
    onChange(c ? clientFields(c) : { client_id: null })
  }
  async function saveClient() {
    setSavingClient(true)
    await onSaveClient()
    setSavingClient(false)
  }
  const set = (k, v) => onChange({ [k]: v })
  const field = (key, labelKey, props = {}) => (
    <div style={props.wide ? { gridColumn: '1 / -1' } : undefined}>
      <label style={label} htmlFor={`qd-${key}`}>{t(labelKey)}</label>
      <input id={`qd-${key}`} value={quote[key] ?? ''} onChange={e => set(key, e.target.value)} maxLength={props.max || 200}
        type={props.type || 'text'} style={input} />
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space.section, animation: 'fadeIn 0.2s ease' }}>
      <fieldset style={box}>
        <legend style={legend}>{t('quote.client')}</legend>
        <div style={{ display: 'flex', gap: space[2], alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: space[3] }}>
          <div style={{ flex: '1 1 240px', minWidth: 0 }}>
            <HintLabel htmlFor="qd-client" hint="quote-client">{t('contacts.pick')}</HintLabel>
            <select id="qd-client" value={quote.client_id || ''} onChange={e => pick(e.target.value)} style={{ ...input, cursor: 'pointer' }}>
              <option value="">{t('contacts.pickNone')}</option>
              {clients.filter(c => !c.archived_at || c.id === quote.client_id).map(c => (
                <option key={c.id} value={c.id}>{c.name}{c.contact_name ? ` · ${c.contact_name}` : ''}</option>
              ))}
            </select>
          </div>
          {!linked && typed && onSaveClient && (
            <button type="button" onClick={saveClient} disabled={savingClient} style={btn}>
              {savingClient ? <AvxLoader size={14} /> : <UserPlus size={14} />} {t('contacts.saveToContacts')}
            </button>
          )}
          {linked && (
            <Link to={`/org/${linked.org_id}/contacts`} style={{ fontSize: '13px', color: colors.accentText, display: 'flex', alignItems: 'center', gap: space[1], paddingBottom: space[3] }}>
              <Check size={13} aria-hidden="true" /> {t('contacts.inContacts')}
            </Link>
          )}
        </div>
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
            {onApplyVat && (
              <button type="button" onClick={onApplyVat} style={{ background: 'none', border: 'none', padding: '6px 0', minHeight: '32px', color: colors.accentText, fontSize: '13px', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>
                {t('quote.applyVat')}
              </button>
            )}
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
              <span style={{ display: 'block', fontSize: '13px', color: colors.muted, marginTop: space[1] }}>{t('quote.showLinePricesHint')}</span>
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

// One box deep (DESIGN.md "Room to breathe"): each group is a heading on the page ground, no border
const box = { border: 'none', padding: 0, margin: 0, minWidth: 0 }
const legend = { padding: 0, marginBottom: space[4], font: '700 16px/24px var(--font-mono)', color: 'var(--text)' }
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: `${space[3]} ${space[4]}` }
