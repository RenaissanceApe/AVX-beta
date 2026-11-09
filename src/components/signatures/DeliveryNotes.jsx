import { useEffect, useRef, useState } from 'react'
import { PenLine, FileDown, Undo2, EyeOff } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { saveSignature, attachSignedPdf, copyToGigFiles, signatureFileUrl, signatureImageDataUrl } from '../../lib/signatures'
import { deliveryNoteDocument, buildDeliveryNotePdf, deliveryNoteFileName } from '../../lib/deliveryNotePdf'
import { useI18n } from '../../i18n'
import { Modal, btn, btnPrimary, input, label, colors, AvxLoader } from '../ui'
import { Hint } from '../help/HelpParts'
import SignaturePad from './SignaturePad'

// Delivery notes signed on site (step 16): the client signs on the phone for what was delivered.
// Each signature keeps the exact list signed, its SHA-256 and a signed PDF; the PDF is also copied
// into the gig's files. Shown under the packing list.
//   data: what PackingListPage loaded ({ gig, rows, units })

// Make (or remake, if the first try didn't finish) the signed PDF of a delivery note and keep it
export async function keepDeliveryNotePdf(sig, { gigId, userId, copy = true }) {
  const document = JSON.parse(sig.document)
  const image = await signatureImageDataUrl(sig.image_path)
  const pdf = (await buildDeliveryNotePdf(document, { ...sig, image })).output('blob')
  const saved = await attachSignedPdf(sig, pdf)
  if (copy) await copyToGigFiles(gigId, deliveryNoteFileName(document, sig.signed_at), pdf, userId)
  return saved
}

export function DeliveryNoteList({ gigId, canSign, refreshKey }) {
  const { t, fmt } = useI18n()
  const { user } = useAuth()
  const { notify } = useToast()
  const [list, setList] = useState(null)
  const [busy, setBusy] = useState(null)

  async function load() {
    const { data, error } = await supabase.from('signatures')
      .select('id, org_id, gig_id, kind, title, signer_name, signer_role, signed_at, document, document_sha256, image_path, pdf_path, removed_at')
      .eq('gig_id', gigId).eq('kind', 'delivery_note').order('signed_at', { ascending: false })
    if (error) logger.error('deliveryNotes', error, { gigId })
    setList(data || [])
  }
  useEffect(() => { load() }, [gigId, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  async function openPdf(sig) {
    setBusy(sig.id)
    try {
      let row = sig
      if (!row.pdf_path) row = await keepDeliveryNotePdf(sig, { gigId, userId: user.id })
      window.open(await signatureFileUrl(row.pdf_path), '_blank', 'noopener')
      if (!sig.pdf_path) load()
    } catch (e) {
      logger.error('deliveryNotes', e, { step: 'pdf', signatureId: sig.id })
      notify(userMessage(e), 'error')
    }
    setBusy(null)
  }

  async function setRemoved(sig, removed) {
    const { error } = await supabase.from('signatures').update({ removed_at: removed ? new Date().toISOString() : null }).eq('id', sig.id)
    if (error) { logger.error('deliveryNotes', error, { step: 'remove', signatureId: sig.id }); return notify(userMessage(error), 'error') }
    notify(removed ? t('delivery.removed') : t('delivery.restored'), 'success',
      removed ? { action: { label: t('common.undo'), onClick: () => setRemoved(sig, false) } } : {})
    load()
  }

  if (!list || list.length === 0) return null
  const shown = list.filter(s => !s.removed_at)
  const hidden = list.length - shown.length
  return (
    <section className="signed-notes">
      <h2>{t('delivery.signedList')}</h2>
      <table>
        <tbody>
          {shown.map(s => {
            const count = (() => { try { return JSON.parse(s.document).items.length } catch { return 0 } })()
            return (
              <tr key={s.id}>
                <td>
                  <strong>{s.signer_name}</strong>{s.signer_role && <span className="muted"> · {s.signer_role}</span>}
                  <div className="muted">{fmt(s.signed_at, 'd MMM yyyy, HH:mm')} · {t('delivery.itemsCount', { count })}</div>
                </td>
                <td className="num">
                  <button type="button" onClick={() => openPdf(s)} disabled={busy === s.id} style={sheetBtn}>
                    {busy === s.id ? <AvxLoader size={14} /> : <FileDown size={14} aria-hidden="true" />} {t('delivery.signedPdf')}
                  </button>
                  {canSign && (
                    <button type="button" onClick={() => setRemoved(s, true)} style={{ ...sheetBtn, marginLeft: '8px' }}>
                      <EyeOff size={14} aria-hidden="true" /> {t('delivery.remove')}
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {hidden > 0 && canSign && (
        <details style={{ marginTop: '8px' }}>
          <summary className="muted">{t('delivery.hiddenCount', { count: hidden })}</summary>
          {list.filter(s => s.removed_at).map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <span className="muted">{s.signer_name} · {fmt(s.signed_at, 'd MMM yyyy, HH:mm')}</span>
              <button type="button" onClick={() => setRemoved(s, false)} style={sheetBtn}><Undo2 size={14} aria-hidden="true" /> {t('delivery.restore')}</button>
            </div>
          ))}
        </details>
      )}
    </section>
  )
}

export function DeliveryNoteModal({ data, onClose, onSigned }) {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const { notify } = useToast()
  const pad = useRef(null)
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [note, setNote] = useState('')
  const [hasInk, setHasInk] = useState(false)
  const [busy, setBusy] = useState(false)

  const { gig } = data
  const document = deliveryNoteDocument({ org: gig.organisations?.name || '', gig, rows: data.rows, units: data.units, note, lang })
  const pieces = document.items.reduce((sum, i) => sum + (i.out || i.planned), 0)

  async function submit(e) {
    e.preventDefault()
    if (!name.trim() || !hasInk) return
    setBusy(true)
    try {
      const image = await pad.current.png()
      const sig = await saveSignature({
        orgId: gig.org_id, kind: 'delivery_note', gigId: gig.id, title: t('delivery.title'),
        signerName: name.trim(), signerRole: role.trim(), document, image,
      })
      track('signature:delivery-note')
      try {
        await keepDeliveryNotePdf(sig, { gigId: gig.id, userId: user.id })
      } catch (pdfErr) {
        // The signature is kept; the PDF can be made again from the list
        logger.error('deliveryNotes', pdfErr, { step: 'pdf', signatureId: sig.id })
      }
      notify(t('delivery.saved'), 'success')
      onSigned()
    } catch (err) {
      logger.error('deliveryNotes', err, { step: 'save', gigId: gig.id })
      notify(userMessage(err), 'error')
      setBusy(false)
    }
  }

  return (
    <Modal title={t('delivery.signTitle')} onClose={onClose} maxWidth={560}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5, margin: 0 }}>
          {t('delivery.summary', { items: document.items.length, pieces, gig: gig.name })}
        </p>
        {document.items.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '13px', maxHeight: '160px', overflowY: 'auto', lineHeight: 1.6 }}>
            {document.items.map(i => (
              <li key={`${i.category}|${i.name}`}>{i.out || i.planned} × {i.name}</li>
            ))}
          </ul>
        )}
        <label>
          <span style={label}>{t('delivery.signerName')} *</span>
          <input value={name} onChange={e => setName(e.target.value)} maxLength={200} required autoComplete="off" style={input} />
        </label>
        <label>
          <span style={label}>{t('delivery.signerRole')}</span>
          <input value={role} onChange={e => setRole(e.target.value)} maxLength={200} placeholder={t('delivery.signerRolePlaceholder')} style={input} />
        </label>
        <label>
          <span style={label}>{t('delivery.note')}</span>
          <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={1000} rows={2} style={{ ...input, resize: 'vertical' }} />
        </label>
        <SignaturePad ref={pad} onChange={setHasInk} />
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '4px' }}>
          <span style={{ fontSize: '11px', color: colors.muted, lineHeight: 1.5 }}>{t('signature.plainNotice')}</span>
          <Hint id="signature.plain" label={t('signature.plainTerm')} />
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" onClick={onClose} style={btn}>{t('common.cancel')}</button>
          <button type="submit" disabled={busy || !name.trim() || !hasInk} style={{ ...btnPrimary, opacity: busy || !name.trim() || !hasInk ? 0.6 : 1 }}>
            {busy ? <AvxLoader size={14} /> : <PenLine size={14} aria-hidden="true" />} {t('delivery.confirm')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

const sheetBtn = {
  display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '4px 12px',
  border: '1px solid #c5ccd4', background: '#fff', color: '#111', fontWeight: 600, fontSize: '13px', cursor: 'pointer',
}
