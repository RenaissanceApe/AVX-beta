import { useCallback, useEffect, useState } from 'react'
import { Link2, Unlink, ListChecks } from 'lucide-react'
import { logger, userMessage } from '../../lib/logger'
import { useToast } from '../../lib/ToastContext'
import { invoicing, PROGRAM_NAMES } from '../../lib/invoiceApi'
import { useI18n } from '../../i18n'
import { btn, btnPrimary, input, label, card, colors, Modal, AvxLoader } from '../ui'
import { HintLabel, Hint } from '../help/HelpParts'

// The invoicing program panel on the Invoices page (step 11b). Everyone who sees invoices sees
// which program is connected; admins choose one (or by hand), connect it, pick the series, or go
// back to typing by hand. Only programs the owner switched on (INVOICING_PROVIDERS) are offered.
const section = { ...card, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }
const CALLBACK = `${import.meta.env.VITE_SUPABASE_URL || ''}/functions/v1/invoicing`

export default function InvoicingPanel({ orgId, status, providers, isAdmin, onChanged }) {
  const { t } = useI18n()
  const { notify } = useToast()
  const [busy, setBusy] = useState(false)
  const [setup, setSetup] = useState(false)
  const [picked, setPicked] = useState('')
  if (status === undefined) return null
  const current = status?.provider || null
  const name = PROGRAM_NAMES[current] || current
  // Nothing switched on and nothing connected: the panel has nothing to offer
  if (!current && !providers.length) return null

  const fail = (step, error) => { logger.error('invoices', error, { step }); notify(userMessage(error), 'error') }
  const connect = async (provider, keys = {}) => {
    setBusy(true)
    try {
      const res = await invoicing('connect', { org_id: orgId, provider, ...keys })
      if (res.url) { window.location.assign(res.url); return }
      notify(t('invoice.program.connectedToast', { program: PROGRAM_NAMES[provider] }), 'success')
      setPicked('')
      onChanged()
    } catch (error) { fail('program_connect', error) }
    setBusy(false)
  }
  const disconnect = async () => {
    if (!window.confirm(t('invoice.program.disconnectConfirm', { program: name }))) return
    setBusy(true)
    try { await invoicing('disconnect', { org_id: orgId }); onChanged() } catch (error) { fail('program_disconnect', error) } finally { setBusy(false) }
  }

  const statusText = !current ? t('invoice.program.manual')
    : status.ready ? (status.company_name
      ? t('invoice.program.readyCompany', { program: name, company: status.company_name, series: status.document_set_name || '—' })
      : t('invoice.program.ready', { program: name, series: status.document_set_name || t('invoice.program.defaultSeries') }))
      : status.expired ? t('invoice.program.expired', { program: name })
        : status.connected ? t('invoice.program.chooseSeries', { program: name })
          : t('invoice.program.signInPending', { program: name })
  const choosing = picked && picked !== current

  return (
    <section style={section} aria-labelledby="program-title">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <h2 id="program-title" style={{ fontSize: '15px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
            {t('invoice.program.title')}
            <Hint id="invoicing-program" label={t('invoice.program.title')} />
          </h2>
          <p style={{ fontSize: '13px', color: current && !status.ready ? colors.warn : colors.muted, margin: '2px 0 0' }}>{statusText}</p>
        </div>
        {isAdmin && current && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {(status.expired || !status.connected) && (
              <button type="button" onClick={() => setPicked(current)} disabled={busy} style={btnPrimary}><Link2 size={14} /> {t('invoice.program.reconnect')}</button>
            )}
            {status.connected && !status.expired && (
              <button type="button" onClick={() => setSetup(true)} disabled={busy} style={status.ready ? btn : btnPrimary}><ListChecks size={14} /> {t('invoice.program.series')}</button>
            )}
            <button type="button" onClick={disconnect} disabled={busy} style={btn}><Unlink size={14} /> {t('invoice.program.byHand')}</button>
          </div>
        )}
      </div>

      {isAdmin && !current && (
        <div>
          <HintLabel htmlFor="program-pick" hint="invoicing-program">{t('invoice.program.choose')}</HintLabel>
          <select id="program-pick" value={picked} onChange={e => setPicked(e.target.value)} style={{ ...input, cursor: 'pointer', maxWidth: '320px' }}>
            <option value="">{t('invoice.program.manualOption')}</option>
            {providers.map(p => <option key={p} value={p}>{PROGRAM_NAMES[p]}</option>)}
          </select>
        </div>
      )}
      {isAdmin && picked && (choosing || picked === current) && (
        <ConnectForm provider={picked} busy={busy} onConnect={keys => connect(picked, keys)} onCancel={() => setPicked('')} />
      )}
      {setup && <SeriesModal orgId={orgId} provider={current} onClose={() => setSetup(false)} onSaved={() => { setSetup(false); onChanged() }} />}
    </section>
  )
}

// What each program needs to connect
function ConnectForm({ provider, busy, onConnect, onCancel }) {
  const { t } = useI18n()
  const [keys, setKeys] = useState({})
  const setKey = k => e => setKeys(v => ({ ...v, [k]: e.target.value }))
  const name = PROGRAM_NAMES[provider]
  const field = (k, hint, type = 'text', placeholder = '') => (
    <div key={k}>
      {hint ? <HintLabel htmlFor={`pk-${k}`} hint={hint}>{t(`invoice.program.field.${k}`)}</HintLabel>
        : <label htmlFor={`pk-${k}`} style={label}>{t(`invoice.program.field.${k}`)}</label>}
      <input id={`pk-${k}`} type={type} value={keys[k] || ''} onChange={setKey(k)} placeholder={placeholder} required autoComplete="off" spellCheck={false} style={input} />
    </div>
  )
  const submit = e => { e.preventDefault(); onConnect(keys) }
  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: `1px solid ${colors.border}`, paddingTop: '10px' }}>
      <p style={{ fontSize: '13px', margin: 0, lineHeight: 1.5 }}>{t(`invoice.program.how.${provider}`)}</p>
      {provider === 'invoicexpress' && <>
        {field('account', 'invoicexpress-account', 'text', 'lumen-pixel')}
        {field('api_key', 'invoicing-keys', 'password')}
      </>}
      {provider === 'toconline' && <>
        <p style={{ fontSize: '12px', color: colors.muted, margin: 0, overflowWrap: 'anywhere' }}>{t('invoice.program.redirect', { url: CALLBACK })}</p>
        {field('client_id', null)}
        {field('client_secret', 'invoicing-keys', 'password')}
        {field('oauth_url', null, 'url', 'https://…toconline.pt/oauth')}
        {field('api_url', null, 'url', 'https://…toconline.pt')}
      </>}
      <p style={{ fontSize: '12px', color: colors.muted, margin: 0 }}>{t('invoice.program.keysSafe')}</p>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button type="submit" disabled={busy} style={btnPrimary}>
          {busy ? <AvxLoader size={14} /> : <Link2 size={14} />} {t(provider === 'invoicexpress' ? 'invoice.program.connect' : 'invoice.program.signIn', { program: name })}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} style={btn}>{t('common.cancel')}</button>
      </div>
    </form>
  )
}

// The company (Moloni) and invoice series new drafts go to
function SeriesModal({ orgId, provider, onClose, onSaved }) {
  const { t } = useI18n()
  const { notify } = useToast()
  const [lists, setLists] = useState(null)
  const [choice, setChoice] = useState({ company_id: '', document_set_id: '' })
  const [saving, setSaving] = useState(false)
  const fetchLists = useCallback(async companyId => {
    setLists(null)
    try {
      const res = await invoicing('setup', { org_id: orgId, ...(companyId ? { company_id: Number(companyId) } : {}) })
      setLists(res)
      setChoice(c => ({ company_id: String(res.company_id ?? ''), document_set_id: companyId ? '' : String(res.document_set_id ?? c.document_set_id ?? '') }))
    } catch (error) { notify(userMessage(error), 'error'); onClose() }
  }, [orgId, notify, onClose])
  useEffect(() => { fetchLists(null) }, [fetchLists])
  const save = async e => {
    e.preventDefault()
    setSaving(true)
    try {
      await invoicing('save_setup', { org_id: orgId, ...(choice.company_id ? { company_id: Number(choice.company_id) } : {}), document_set_id: Number(choice.document_set_id) })
      notify(t('invoice.program.saved', { program: PROGRAM_NAMES[provider] }), 'success')
      onSaved()
    } catch (error) { notify(userMessage(error), 'error') } finally { setSaving(false) }
  }
  return (
    <Modal title={t('invoice.program.series')} onClose={onClose}>
      {!lists ? <AvxLoader size={20} /> : (
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {lists.companies && (
            <div>
              <label htmlFor="pg-co" style={label}>{t('invoice.moloni.company')}</label>
              <select id="pg-co" value={choice.company_id} onChange={e => fetchLists(e.target.value)} required style={{ ...input, cursor: 'pointer' }}>
                {lists.companies.map(c => <option key={c.company_id} value={c.company_id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <HintLabel htmlFor="pg-set" hint="moloni-series">{t('invoice.moloni.series')}</HintLabel>
            <select id="pg-set" value={choice.document_set_id} onChange={e => setChoice(c => ({ ...c, document_set_id: e.target.value }))} required style={{ ...input, cursor: 'pointer' }}>
              <option value="">{t('quote.vatExemptionPick')}</option>
              {lists.document_sets.map(s => <option key={s.document_set_id} value={s.document_set_id}>{s.name}</option>)}
            </select>
          </div>
          <button type="submit" disabled={saving || !choice.document_set_id} style={btnPrimary}>{t('invoice.moloni.save')}</button>
        </form>
      )}
    </Modal>
  )
}
