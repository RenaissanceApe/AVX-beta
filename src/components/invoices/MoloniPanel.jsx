import { useCallback, useEffect, useState } from 'react'
import { Loader2, Link2, Unlink } from 'lucide-react'
import { logger, userMessage } from '../../lib/logger'
import { useToast } from '../../lib/ToastContext'
import { moloni } from '../../lib/invoiceApi'
import { useI18n } from '../../i18n'
import { btn, btnPrimary, input, label, card, colors, Modal } from '../ui'
import { HintLabel, Hint } from '../help/HelpParts'

// SWITCHED OFF (step 11b): not imported anywhere yet. The Moloni connector's panel for the
// Invoices page: connected or not, the company and series, and (admins) connect, choose,
// disconnect. Step 11b turns connectors on per provider (docs/BUSINESS.md "Planned → 11b") and
// must first test it against a real Moloni account. Also needed then: the moloni_status call,
// the ?moloni= return toast, and passing moloniReady to InvoiceModal.
const section = { ...card, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }

export default function MoloniPanel({ orgId, status, isAdmin, onChanged }) {
  const { t } = useI18n()
  const { notify } = useToast()
  const [busy, setBusy] = useState(false)
  const [setup, setSetup] = useState(null)
  if (status === undefined) return null
  const connect = async () => {
    setBusy(true)
    try {
      const { url } = await moloni('connect', { org_id: orgId })
      window.location.assign(url)
    } catch (error) { logger.error('invoices', error, { step: 'moloni_connect' }); notify(userMessage(error), 'error'); setBusy(false) }
  }
  const disconnect = async () => {
    if (!window.confirm(t('invoice.moloni.disconnectConfirm'))) return
    setBusy(true)
    try { await moloni('disconnect', { org_id: orgId }); onChanged() } catch (error) { notify(userMessage(error), 'error') } finally { setBusy(false) }
  }
  const connected = status?.connected && !status?.expired
  return (
    <section style={{ ...section, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }} aria-labelledby="moloni-title">
      <div style={{ flex: '1 1 240px', minWidth: 0 }}>
        <h2 id="moloni-title" style={{ fontSize: '15px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
          {t('invoice.moloni.title')}
          <Hint id="moloni" label={t('invoice.moloni.title')} />
        </h2>
        <p style={{ fontSize: '13px', color: status?.ready ? colors.muted : colors.warn, margin: '2px 0 0' }}>
          {status?.ready ? t('invoice.moloni.ready', { company: status.company_name, series: status.document_set_name })
            : status?.expired ? t('invoice.moloni.expired')
              : connected ? t('invoice.moloni.chooseSeries')
                : t(isAdmin ? 'invoice.moloni.notConnected' : 'invoice.moloni.notConnectedMember')}
        </p>
      </div>
      {isAdmin && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {(!connected) && <button type="button" onClick={connect} disabled={busy} style={btnPrimary}><Link2 size={14} /> {t(status?.expired ? 'invoice.moloni.reconnect' : 'invoice.moloni.connect')}</button>}
          {connected && <button type="button" onClick={() => setSetup(true)} disabled={busy} style={status?.ready ? btn : btnPrimary}>{t('invoice.moloni.choose')}</button>}
          {status?.connected && <button type="button" onClick={disconnect} disabled={busy} style={btn}><Unlink size={14} /> {t('invoice.moloni.disconnect')}</button>}
        </div>
      )}
      {setup && <MoloniSetup orgId={orgId} onClose={() => setSetup(null)} onSaved={() => { setSetup(null); onChanged() }} />}
    </section>
  )
}

function MoloniSetup({ orgId, onClose, onSaved }) {
  const { t } = useI18n()
  const { notify } = useToast()
  const [lists, setLists] = useState(null)
  const [choice, setChoice] = useState({ company_id: '', document_set_id: '' })
  const [saving, setSaving] = useState(false)
  const fetchLists = useCallback(async companyId => {
    setLists(null)
    try {
      const res = await moloni('setup', { org_id: orgId, ...(companyId ? { company_id: Number(companyId) } : {}) })
      setLists(res)
      setChoice(c => ({ company_id: String(res.company_id ?? ''), document_set_id: companyId ? '' : String(res.document_set_id ?? c.document_set_id ?? '') }))
    } catch (error) { notify(userMessage(error), 'error'); onClose() }
  }, [orgId, notify, onClose])
  useEffect(() => { fetchLists(null) }, [fetchLists])
  const save = async e => {
    e.preventDefault()
    setSaving(true)
    try {
      await moloni('save_setup', { org_id: orgId, company_id: Number(choice.company_id), document_set_id: Number(choice.document_set_id) })
      notify(t('invoice.moloni.saved'), 'success')
      onSaved()
    } catch (error) { notify(userMessage(error), 'error') } finally { setSaving(false) }
  }
  return (
    <Modal title={t('invoice.moloni.choose')} onClose={onClose}>
      {!lists ? <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> : (
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label htmlFor="mo-co" style={label}>{t('invoice.moloni.company')}</label>
            <select id="mo-co" value={choice.company_id} onChange={e => fetchLists(e.target.value)} required style={{ ...input, cursor: 'pointer' }}>
              {lists.companies.map(c => <option key={c.company_id} value={c.company_id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <HintLabel htmlFor="mo-set" hint="moloni-series">{t('invoice.moloni.series')}</HintLabel>
            <select id="mo-set" value={choice.document_set_id} onChange={e => setChoice(c => ({ ...c, document_set_id: e.target.value }))} required style={{ ...input, cursor: 'pointer' }}>
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
