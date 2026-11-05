import { useMemo, useState } from 'react'
import { Loader2, Plus, Trash2, Send, RefreshCw, ExternalLink, Mail, MessageSquare, Check, Undo2, FileMinus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { logger, userMessage } from '../../lib/logger'
import { useToast } from '../../lib/ToastContext'
import { useI18n, translate, fmt } from '../../i18n'
import { Modal, btn, btnPrimary, btnDanger, input, label, colors, iconBtn, StatusBadge } from '../ui'
import { HintLabel } from '../help/HelpParts'
import { VAT_EXEMPTIONS, normalizeBody, formatMoney, localISODate, quoteNumber } from '../../lib/quotes'
import {
  invoiceTotals, invoiceLineNet, quoteInvoiceLines, depositLines, restLines, creditLines, invoiceClient, invoiceProblems,
  invoiceState, dueDateFor, quoteInvoiceGap,
} from '../../lib/invoices'
import { createInvoice, saveDraft, updateInvoice, removeDraft, moloni, remindClient } from '../../lib/invoiceApi'

const TONES = { draft: 'draft', sent: 'info', issued: 'open', overdue: 'danger', paid: 'ok', credited: 'off' }
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const newLineId = () => globalThis.crypto?.randomUUID?.() ?? `l-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export function InvoiceBadge({ invoice, credits = [] }) {
  const { t } = useI18n()
  const state = invoiceState(invoice, { credits })
  return <StatusBadge small tone={TONES[state] || 'open'}>{t(`invoice.state.${state}`)}</StatusBadge>
}

export const invoiceTitle = (inv, t) => (inv.legal_number || t(inv.kind === 'credit_note' ? 'invoice.creditDraftName' : 'invoice.draftName', { n: inv.number }))

// One invoice or credit note. New: from a quote (quote, client, invoices already made from it) or,
// for a credit note, from an issued invoice (creditOf, with its credit notes). Existing: edit the
// draft, mark it sent to the invoicing program and add its number, mark it paid, credit it, remind
// the client. moloniReady (send to Moloni, read it back) stays false until step 11b turns connectors on.
export default function InvoiceModal({ orgId, invoice: initial = null, quote = null, client = null, siblings = [], creditOf = null, dueDays = 30, moloniReady = false, onClose, onSaved, onCredit }) {
  const { t, lang } = useI18n()
  const { notify } = useToast()
  const [inv, setInv] = useState(initial)
  const isNew = !inv
  const isCredit = isNew ? !!creditOf : inv.kind === 'credit_note'
  const today = localISODate()
  const phases = useMemo(() => (quote ? normalizeBody(quote.body).phases : []), [quote])
  const [scope, setScope] = useState('all')
  const [phaseIds, setPhaseIds] = useState(() => phases.filter(p => !p.optional).map(p => p.id))
  const [depositPct, setDepositPct] = useState('30')
  const quoteLabel = quote ? quoteNumber(quote, quote.prefix ?? 'Q') : ''
  const kindName = k => t(`lineKind.${k}`)

  const [draft, setDraft] = useState(() => {
    if (!isNew) return { ...initial, lines: initial.lines || [] }
    if (creditOf) {
      return {
        ...Object.fromEntries(['client_id', 'client_name', 'client_tax_id', 'client_address', 'client_email', 'language', 'currency', 'quote_id', 'gig_id'].map(k => [k, creditOf[k] ?? null])),
        kind: 'credit_note', credited_invoice_id: creditOf.id, scope: 'credit', issue_date: today, due_date: null, notes: '',
        lines: creditLines(creditOf, siblings, { label: r => t('invoice.creditLeftLine', { rate: r }) }),
      }
    }
    return {
      ...invoiceClient(quote, client), quote_id: quote.id, gig_id: quote.gig_id || null, language: quote.language === 'en' ? 'en' : 'pt',
      currency: quote.currency || 'EUR', issue_date: today, due_date: dueDateFor(today, dueDays), notes: '', scope: 'all', lines: [],
    }
  })

  // A new invoice from a quote: its lines follow the choice of what to invoice
  const deposits = siblings.filter(s => s.kind === 'invoice' && s.scope === 'deposit' && !s.removed_at)
  const builtLines = useMemo(() => {
    if (!isNew || isCredit) return null
    const tr = (k, v) => translate(draft.language, k, v)
    if (scope === 'phases') return quoteInvoiceLines(quote, { phaseIds, fallback: kindName })
    if (scope === 'deposit') return depositLines(quote, num(depositPct), { label: rate => tr('invoice.depositLine', { pct: num(depositPct), quote: quoteLabel, rate }) })
    if (scope === 'rest') return restLines(quote, deposits, { fallback: kindName, label: d => tr('invoice.lessDepositLine', { number: d.legal_number || tr('invoice.draftName', { n: d.number }) }) })
    return quoteInvoiceLines(quote, { fallback: kindName })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, isCredit, scope, phaseIds, depositPct, quote, draft.language, deposits.length])
  const lines = builtLines ?? draft.lines
  const totals = invoiceTotals(lines)
  const editable = isNew || inv.status === 'draft'
  const problems = invoiceProblems({ ...draft, lines })
  const gap = isNew && !isCredit && quote && scope === 'all' ? quoteInvoiceGap(quote, lines) : 0

  const [busy, setBusy] = useState('')
  const [manual, setManual] = useState({ legal_number: '', pdf_url: '' })
  const [paidOn, setPaidOn] = useState(today)
  const set = changes => setDraft(d => ({ ...d, ...changes }))
  const setLine = (i, changes) => set({ lines: draft.lines.map((l, j) => (j === i ? { ...l, ...changes } : l)) })
  const money = v => formatMoney(v, draft.currency || 'EUR', lang)

  async function run(step, fn) {
    setBusy(step)
    try {
      const next = await fn()
      if (next) { setInv(next); setDraft({ ...next, lines: next.lines || [] }); onSaved?.(next) }
      return next
    } catch (error) {
      logger.error('invoices', error, { step })
      notify(userMessage(error), 'error')
      return null
    } finally {
      setBusy('')
    }
  }

  // Numbers from the form go to the database as numbers
  const cleanLines = ls => ls.map(l => ({
    ...l, description: String(l.description || '').trim(), qty: num(l.qty), unit_price: num(l.unit_price),
    discount_pct: Math.min(100, Math.max(0, num(l.discount_pct))), vat_rate: Math.min(100, Math.max(0, num(l.vat_rate))),
    ...(num(l.vat_rate) === 0 && l.vat_exemption ? { vat_exemption: l.vat_exemption } : { vat_exemption: undefined }),
  }))
  const payload = () => ({ ...draft, lines: cleanLines(lines), scope: isCredit ? 'credit' : isNew ? scope : draft.scope, phase_ids: isNew && scope === 'phases' ? phaseIds : draft.phase_ids ?? null, deposit_pct: isNew && scope === 'deposit' ? num(depositPct) : draft.deposit_pct ?? null })
  const save = () => run('save', () => (isNew ? createInvoice(orgId, payload()) : saveDraft(inv.id, payload())))
  const saveIfChanged = async () => (isNew ? save() : editable ? saveDraft(inv.id, payload()) : inv)

  async function sendToMoloni() {
    const saved = await run('save', saveIfChanged)
    if (!saved) return
    await run('push', async () => {
      await moloni('push', { invoice_id: saved.id })
      notify(t('invoice.pushed'), 'success')
      const { data } = await supabase.from('invoices').select('*').eq('id', saved.id).single()
      return { ...saved, ...data }
    })
  }
  const markSentByHand = async () => {
    const saved = await run('save', saveIfChanged)
    if (saved) await run('sent', () => updateInvoice(saved.id, { status: 'sent' }))
  }
  const check = () => run('sync', async () => {
    const res = await moloni('sync', { invoice_id: inv.id })
    if (res.state === 'draft') { notify(t('invoice.stillDraftInMoloni')); return null }
    if (res.state === 'missing') { notify(t('invoice.missingInMoloni'), 'error'); return null }
    notify(t('invoice.issuedToast', { number: res.legal_number }), 'success')
    const { data } = await supabase.from('invoices').select('*').eq('id', inv.id).single()
    return { ...inv, ...data }
  })
  const issueByHand = e => {
    e.preventDefault()
    return run('issue', () => updateInvoice(inv.id, { status: 'issued', legal_number: manual.legal_number.trim(), pdf_url: manual.pdf_url.trim() || null }))
  }
  const remind = () => run('remind', async () => {
    await remindClient(inv.id)
    notify(t('invoice.reminded', { email: inv.client_email }), 'success')
    return null
  })
  const tellClient = () => run('thread', async () => {
    const { data: convId, error } = await supabase.rpc('context_conversation', { p_type: 'quote', p_id: inv.quote_id })
    if (error) throw error
    const tr = (k, v) => translate(inv.language, k, v)
    const body = tr(inv.kind === 'credit_note' ? 'invoice.threadCredit' : 'invoice.threadIssued', { number: inv.legal_number, amount: formatMoney(inv.total, inv.currency, inv.language) })
      + (inv.pdf_url ? `\n${inv.pdf_url}` : '')
      + (inv.due_date && inv.kind === 'invoice' ? `\n${tr('invoice.threadDue', { date: fmt(inv.due_date, 'd MMM yyyy') })}` : '')
    const { error: msgError } = await supabase.from('messages').insert({ conversation_id: convId, body })
    if (msgError) throw msgError
    notify(t('invoice.toldClient'), 'success')
    return null
  })
  const remove = () => {
    if (!window.confirm(t('invoice.removeConfirm'))) return
    run('remove', async () => { await removeDraft(inv.id); onClose(); return null })
  }

  const title = isNew ? t(isCredit ? 'invoice.newCredit' : 'invoice.new') : invoiceTitle(inv, t)
  const state = inv ? invoiceState(inv, { today }) : 'draft'
  const sectionStyle = { borderTop: `1px solid ${colors.border}`, paddingTop: '12px', marginTop: '12px' }

  return (
    <Modal title={title} onClose={onClose} maxWidth={760}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', fontSize: '13px', color: colors.muted }}>
          {inv && <InvoiceBadge invoice={inv} />}
          {inv && <span>{t('invoice.avxRef', { n: inv.number })}</span>}
          {(quote || inv?.quote) && <span>· {t('invoice.fromQuote', { quote: quote ? quoteLabel : `${inv.quote?.title || ''}` })}</span>}
          {isCredit && creditOf && <span>· {t('invoice.credits', { number: creditOf.legal_number })}</span>}
        </div>

        {isNew && !isCredit && (
          <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend style={{ ...label, marginBottom: '6px' }}>{t('invoice.whatToInvoice')}</legend>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {['all', 'phases', 'deposit', ...(deposits.length ? ['rest'] : [])].map(s => (
                <label key={s} style={{ ...btn, padding: '7px 12px', cursor: 'pointer', ...(scope === s ? { background: colors.accent, color: colors.onAccent, borderColor: colors.accent } : {}) }}>
                  <input type="radio" name="inv-scope" value={s} checked={scope === s} onChange={() => setScope(s)} style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }} />
                  {t(`invoice.scope.${s}`)}
                </label>
              ))}
            </div>
            {scope === 'phases' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
                {phases.map((p, i) => (
                  <label key={p.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '14px', minHeight: '32px' }}>
                    <input type="checkbox" checked={phaseIds.includes(p.id)} onChange={e => setPhaseIds(ids => (e.target.checked ? [...ids, p.id] : ids.filter(x => x !== p.id)))} />
                    {p.name || t('quote.phaseN', { n: i + 1 })}{p.optional && <span style={{ color: colors.muted, fontSize: '12px' }}>({t('invoice.optionalPhase')})</span>}
                  </label>
                ))}
              </div>
            )}
            {scope === 'deposit' && (
              <div style={{ marginTop: '8px', maxWidth: '160px' }}>
                <label htmlFor="inv-dep" style={label}>{t('invoice.depositPct')}</label>
                <input id="inv-dep" type="number" min="1" max="100" step="1" value={depositPct} onChange={e => setDepositPct(e.target.value)} style={input} />
              </div>
            )}
            {scope === 'rest' && <p style={{ fontSize: '12px', color: colors.muted, margin: '6px 0 0' }}>{t('invoice.restHint', { count: deposits.length })}</p>}
          </fieldset>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
          <div>
            <label htmlFor="inv-client" style={label}>{t('invoice.client')}</label>
            <input id="inv-client" value={draft.client_name || ''} disabled={!editable} onChange={e => set({ client_name: e.target.value })} maxLength={200} style={input} />
          </div>
          <div>
            <HintLabel htmlFor="inv-nif" hint="invoice-tax-id">{t('invoice.taxId')}</HintLabel>
            <input id="inv-nif" value={draft.client_tax_id || ''} disabled={!editable} onChange={e => set({ client_tax_id: e.target.value })} maxLength={40} style={input} />
          </div>
          <div>
            <label htmlFor="inv-email" style={label}>{t('invoice.email')}</label>
            <input id="inv-email" type="email" value={draft.client_email || ''} disabled={!editable} onChange={e => set({ client_email: e.target.value })} maxLength={200} style={input} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="inv-addr" style={label}>{t('invoice.address')}</label>
            <input id="inv-addr" value={draft.client_address || ''} disabled={!editable} onChange={e => set({ client_address: e.target.value })} maxLength={500} style={input} />
          </div>
          <div>
            <label htmlFor="inv-issue" style={label}>{t('invoice.issueDate')}</label>
            <input id="inv-issue" type="date" value={draft.issue_date || ''} disabled={!editable} onChange={e => set({ issue_date: e.target.value || null, ...(e.target.value && !isCredit ? { due_date: dueDateFor(e.target.value, dueDays) } : {}) })} style={input} />
          </div>
          {!isCredit && (
            <div>
              <HintLabel htmlFor="inv-due" hint="invoice-due">{t('invoice.dueDate')}</HintLabel>
              <input id="inv-due" type="date" value={draft.due_date || ''} min={draft.issue_date || undefined} disabled={!editable} onChange={e => set({ due_date: e.target.value || null })} style={input} />
            </div>
          )}
          <div>
            <label htmlFor="inv-lang" style={label}>{t('invoice.language')}</label>
            <select id="inv-lang" value={draft.language} disabled={!editable} onChange={e => set({ language: e.target.value })} style={{ ...input, cursor: 'pointer' }}>
              <option value="pt">Português</option><option value="en">English</option>
            </select>
          </div>
        </div>

        <div style={sectionStyle}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 6px' }}>{t('invoice.lines')}</h3>
          {lines.length === 0 ? (
            <p style={{ fontSize: '13px', color: colors.muted }}>{t('invoice.noLines')}</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {lines.map((l, i) => (
                <li key={l.id || i} style={{ borderTop: i ? `1px solid ${colors.border}` : 'none', padding: '6px 0' }}>
                  {editable && !builtLines ? (
                    <div className="inv-line">
                      <Cell area="desc" caption={t('quote.col.description')}>
                        <input value={l.description} onChange={e => setLine(i, { description: e.target.value })} maxLength={300} style={cellInput} />
                      </Cell>
                      <Cell area="qty" caption={t('quote.col.qty')}><input inputMode="decimal" value={l.qty} onChange={e => setLine(i, { qty: e.target.value })} style={{ ...cellInput, textAlign: 'right' }} /></Cell>
                      <Cell area="price" caption={t('quote.col.price')}><input inputMode="decimal" value={l.unit_price} onChange={e => setLine(i, { unit_price: e.target.value })} style={{ ...cellInput, textAlign: 'right' }} /></Cell>
                      <Cell area="disc" caption={t('quote.col.discount')}><input inputMode="decimal" value={l.discount_pct ?? 0} onChange={e => setLine(i, { discount_pct: e.target.value })} style={{ ...cellInput, textAlign: 'right' }} /></Cell>
                      <Cell area="vat" caption={t('quote.col.vat')}><input inputMode="decimal" value={l.vat_rate} onChange={e => setLine(i, { vat_rate: e.target.value })} style={{ ...cellInput, textAlign: 'right' }} /></Cell>
                      <span style={{ gridArea: 'total', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums', alignSelf: 'end', padding: '0 0 10px' }}>{money(invoiceLineNet({ ...l, qty: num(l.qty), unit_price: num(l.unit_price), discount_pct: num(l.discount_pct) }))}</span>
                      <button type="button" onClick={() => set({ lines: draft.lines.filter((_, j) => j !== i) })} aria-label={t('invoice.removeLine')} title={t('invoice.removeLine')} style={{ ...iconBtn, gridArea: 'del', alignSelf: 'end' }}><Trash2 size={14} /></button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: '8px', fontSize: '13px' }}>
                      <span style={{ flex: 1, minWidth: 0 }}>{l.description}
                        <span style={{ display: 'block', color: colors.muted, fontSize: '12px' }}>
                          {t('invoice.lineMath', { qty: l.qty, price: money(l.unit_price), vat: l.vat_rate })}{num(l.discount_pct) ? ` · −${Math.round(num(l.discount_pct) * 100) / 100}%` : ''}
                        </span>
                      </span>
                      <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{money(invoiceLineNet(l))}</span>
                    </div>
                  )}
                  {num(l.vat_rate) === 0 && (
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'flex-end', marginTop: '4px', flexWrap: 'wrap' }}>
                      <label htmlFor={`ix-${i}`} style={{ fontSize: '12px', color: l.vat_exemption ? colors.muted : colors.warn }}>{t('quote.vatExemption')}</label>
                      <select id={`ix-${i}`} value={l.vat_exemption || ''} disabled={!editable || !!builtLines}
                        onChange={e => setLine(i, { vat_exemption: e.target.value || undefined })} style={{ ...input, width: 'auto', maxWidth: '100%', height: '32px', padding: '0 6px', fontSize: '12px' }}>
                        <option value="">{t('quote.vatExemptionPick')}</option>
                        {VAT_EXEMPTIONS.map(code => <option key={code} value={code}>{code} · {t(`vatExemption.${code}`)}</option>)}
                      </select>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {editable && !builtLines && (
            <button type="button" onClick={() => set({ lines: [...draft.lines, { id: newLineId(), kind: 'other', description: '', qty: 1, unit_price: 0, discount_pct: 0, vat_rate: draft.lines.at(-1)?.vat_rate ?? 23 }] })}
              style={{ ...btn, marginTop: '6px' }}><Plus size={14} /> {t('invoice.addLine')}</button>
          )}
          {builtLines && <p style={{ fontSize: '12px', color: colors.muted, margin: '6px 0 0' }}>{t('invoice.editAfterSave')}</p>}
          <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '4px 12px', fontSize: '14px', margin: '10px 0 0' }}>
            <dt>{t('invoice.net')}</dt><dd style={{ margin: 0, textAlign: 'right' }}>{money(totals.net)}</dd>
            {totals.byRate.map(r => (
              <FragRow key={r.rate} term={t('quote.vatOfBase', { pct: r.rate, base: money(r.base) }) + (r.exemptions.length ? ` (${r.exemptions.join(', ')})` : '')} value={money(r.vat)} />
            ))}
            <dt style={{ fontWeight: 700 }}>{t('invoice.total')}</dt><dd style={{ margin: 0, textAlign: 'right', fontWeight: 700, color: colors.accentText }}>{money(totals.total)}</dd>
          </dl>
          {gap !== 0 && <p style={{ fontSize: '12px', color: colors.muted, margin: '4px 0 0' }}>{t('invoice.roundingGap', { amount: money(gap) })}</p>}
          {problems.length > 0 && editable && <p style={{ fontSize: '12px', color: colors.warn, margin: '6px 0 0' }}>{problems.map(p => t(`invoice.problem.${p}`)).join(' ')}</p>}
        </div>

        {(editable || draft.notes) && (
          <div>
            <label htmlFor="inv-notes" style={label}>{t('invoice.notes')}</label>
            <textarea id="inv-notes" value={draft.notes || ''} disabled={!editable} onChange={e => set({ notes: e.target.value })} rows={2} maxLength={2000} style={{ ...input, resize: 'vertical' }} />
          </div>
        )}

        {/* Actions for each status */}
        <div style={{ ...sectionStyle, display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {editable && (
            <>
              <p style={{ fontSize: '12px', color: colors.muted, margin: 0 }}>{t(moloniReady ? 'invoice.sendHint' : 'invoice.sendHintNoMoloni')}</p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button type="button" onClick={save} disabled={!!busy || !lines.length} style={btn}>{busy === 'save' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />} {t('invoice.saveDraft')}</button>
                {moloniReady && (
                  <button type="button" onClick={sendToMoloni} disabled={!!busy || problems.length > 0 || draft.currency !== 'EUR'} style={btnPrimary}>
                    {busy === 'push' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />} {t('invoice.sendToMoloni')}
                  </button>
                )}
                <button type="button" onClick={markSentByHand} disabled={!!busy || problems.length > 0} style={moloniReady ? btn : btnPrimary}>{t('invoice.markSent')}</button>
                {!isNew && <button type="button" onClick={remove} disabled={!!busy} style={btnDanger}><Trash2 size={14} /> {t('invoice.removeDraft')}</button>}
              </div>
            </>
          )}

          {inv?.status === 'sent' && (
            <>
              <p style={{ fontSize: '13px', margin: 0 }}>{t(inv.moloni_document_id ? 'invoice.sentMoloni' : 'invoice.sentByHand')}</p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {inv.moloni_document_id && moloniReady && (
                  <button type="button" onClick={check} disabled={!!busy} style={btnPrimary}>{busy === 'sync' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={14} />} {t('invoice.checkMoloni')}</button>
                )}
                <button type="button" onClick={() => run('draft', () => updateInvoice(inv.id, { status: 'draft' }))} disabled={!!busy} style={btn}><Undo2 size={14} /> {t('invoice.backToDraft')}</button>
              </div>
              <form onSubmit={issueByHand} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: '1 1 140px' }}>
                  <HintLabel htmlFor="inv-legal" hint="invoice-legal-number">{t('invoice.legalNumber')}</HintLabel>
                  <input id="inv-legal" value={manual.legal_number} onChange={e => setManual(m => ({ ...m, legal_number: e.target.value }))} placeholder="FT 2026/12" maxLength={60} required style={input} />
                </div>
                <div style={{ flex: '2 1 200px' }}>
                  <label htmlFor="inv-pdf" style={label}>{t('invoice.pdfLink')}</label>
                  <input id="inv-pdf" type="url" value={manual.pdf_url} onChange={e => setManual(m => ({ ...m, pdf_url: e.target.value }))} placeholder="https://…" pattern="https://.*" style={input} />
                </div>
                <button type="submit" disabled={!!busy} style={btn}>{t('invoice.markIssued')}</button>
              </form>
            </>
          )}

          {inv && ['issued', 'paid'].includes(inv.status) && (
            <>
              <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '4px 12px', fontSize: '13px', margin: 0 }}>
                <FragRow term={t('invoice.legalNumber')} value={inv.legal_number} />
                {inv.issue_date && <FragRow term={t('invoice.issueDate')} value={fmt(inv.issue_date, 'd MMM yyyy')} />}
                {inv.due_date && <FragRow term={t('invoice.dueDate')} value={<span style={{ color: state === 'overdue' ? colors.danger : undefined }}>{fmt(inv.due_date, 'd MMM yyyy')}</span>} />}
                {inv.paid_on && <FragRow term={t('invoice.paidOn')} value={fmt(inv.paid_on, 'd MMM yyyy')} />}
                {inv.client_reminded_at && <FragRow term={t('invoice.lastReminder')} value={fmt(inv.client_reminded_at, 'd MMM yyyy')} />}
              </dl>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                {inv.pdf_url && <a href={inv.pdf_url} target="_blank" rel="noopener noreferrer" style={{ ...btn, textDecoration: 'none' }}><ExternalLink size={14} /> {t('invoice.openPdf')}</a>}
                {inv.kind === 'invoice' && inv.status === 'issued' && (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap', flexBasis: '100%' }}>
                    <div>
                      <label htmlFor="inv-paid" style={label}>{t('invoice.paidOn')}</label>
                      <input id="inv-paid" type="date" value={paidOn} max={today} onChange={e => setPaidOn(e.target.value)} style={{ ...input, width: 'auto' }} />
                    </div>
                    <button type="button" onClick={() => run('paid', () => updateInvoice(inv.id, { status: 'paid', paid_on: paidOn || today }))} disabled={!!busy} style={btnPrimary}><Check size={14} /> {t('invoice.markPaid')}</button>
                  </div>
                )}
                {inv.status === 'paid' && <button type="button" onClick={() => run('unpaid', () => updateInvoice(inv.id, { status: 'issued' }))} disabled={!!busy} style={btn}><Undo2 size={14} /> {t('invoice.notPaid')}</button>}
                {inv.kind === 'invoice' && onCredit && <button type="button" onClick={() => onCredit(inv)} disabled={!!busy} style={btn}><FileMinus size={14} /> {t('invoice.creditNote')}</button>}
                {state === 'overdue' && inv.client_email && inv.pdf_url && (
                  <button type="button" onClick={remind} disabled={!!busy} style={btn}>{busy === 'remind' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Mail size={14} />} {t('invoice.emailReminder')}</button>
                )}
                {inv.quote_id && <button type="button" onClick={tellClient} disabled={!!busy} style={btn}><MessageSquare size={14} /> {t('invoice.tellClient')}</button>}
              </div>
            </>
          )}
        </div>
      </div>
      <style>{`
        .inv-line { display: grid; gap: 6px; grid-template-columns: minmax(0, 1fr) 64px 90px 56px 56px 90px auto; grid-template-areas: "desc qty price disc vat total del"; align-items: end; }
        @media (max-width: 640px) { .inv-line { grid-template-columns: repeat(4, minmax(0, 1fr)); grid-template-areas: "desc desc desc del" "qty price disc vat" "total total total total"; } }
      `}</style>
    </Modal>
  )
}

const cellInput = { ...input, minWidth: 0, width: '100%', paddingLeft: '6px', paddingRight: '6px' }

// A field of an invoice line with its small visible caption (also its accessible name)
function Cell({ area, caption, children }) {
  return (
    <label style={{ gridArea: area, display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
      <span style={{ fontSize: '10px', fontWeight: 600, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '.04em', color: colors.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{caption}</span>
      {children}
    </label>
  )
}

function FragRow({ term, value }) {
  return (
    <>
      <dt style={{ color: colors.muted, minWidth: 0 }}>{term}</dt>
      <dd style={{ margin: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{value}</dd>
    </>
  )
}
