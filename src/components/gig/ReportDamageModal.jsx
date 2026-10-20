import { useState } from 'react'
import { Loader2, Send } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { t } from '../../i18n'
import { uploadRepairPhoto, PhotoInput } from '../inventory/MaintenancePanels'
import { Modal, btnPrimary, input, label, colors } from '../ui'

const select = { ...input, appearance: 'auto' }

// Report damage from site (docs/INVENTORY.md, I5): anyone on the gig, for equipment on it.
// Units by the code on their label; items counted in bulk by how many.
export default function ReportDamageModal({ gig, lines, onClose }) {
  const { notify } = useToast()
  const [itemId, setItemId] = useState(lines[0]?.item_id || '')
  const [code, setCode] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [problem, setProblem] = useState('')
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)

  async function send(e) {
    e.preventDefault()
    if (!problem.trim() || (!itemId && !code.trim())) return
    setSaving(true)
    const photo = await uploadRepairPhoto(gig.org_id, gig.id, file, notify)
    if (photo === false) return setSaving(false)
    const { error } = await supabase.rpc('report_damage', {
      p_gig: gig.id, p_item: itemId || null, p_unit_code: code.trim() || null,
      p_quantity: Math.max(1, Math.round(Number(quantity) || 1)), p_problem: problem.trim().slice(0, 1000), p_photo_path: photo || null,
    })
    setSaving(false)
    if (error) {
      logger.error('repairs', error, { step: 'report', gigId: gig.id })
      const known = { '23514': 'report.needUnit', '22023': error.message?.includes('Unknown unit') ? 'report.unknownCode' : 'report.notOnGig' }
      return notify(known[error.code] ? t(known[error.code]) : userMessage(error), 'error')
    }
    track('equipment:damage-reported')
    notify(t('report.sent'), 'success')
    onClose()
  }

  return (
    <Modal title={t('report.title')} onClose={onClose}>
      <form onSubmit={send} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <p style={{ fontSize: '12px', color: colors.muted, lineHeight: 1.5 }}>{t('report.intro')}</p>
        <div>
          <label style={label} htmlFor="rd-item">{t('repair.item')}</label>
          <select id="rd-item" value={itemId} onChange={e => setItemId(e.target.value)} style={select}>
            {lines.map(l => <option key={l.item_id} value={l.item_id}>{l.item_name}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
          <div>
            <label style={label} htmlFor="rd-code">{t('report.unitCode')}</label>
            <input id="rd-code" value={code} onChange={e => setCode(e.target.value)} maxLength={40} placeholder="U-…" style={{ ...input, fontFamily: 'var(--font-mono)' }} />
          </div>
          {!code.trim() && (
            <div>
              <label style={label} htmlFor="rd-qty">{t('inv.quantity')}</label>
              <input id="rd-qty" type="number" min={1} value={quantity} onChange={e => setQuantity(e.target.value)} style={input} />
            </div>
          )}
        </div>
        <p style={{ fontSize: '12px', color: colors.muted, marginTop: '-6px' }}>{t('report.codeHint')}</p>
        <div>
          <label style={label} htmlFor="rd-problem">{t('repair.problem')} *</label>
          <textarea id="rd-problem" value={problem} onChange={e => setProblem(e.target.value)} maxLength={1000} rows={3} style={{ ...input, resize: 'vertical' }} required />
        </div>
        <PhotoInput file={file} setFile={setFile} />
        <button type="submit" disabled={saving || !problem.trim()} style={{ ...btnPrimary, justifyContent: 'center' }}>
          {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={15} />} {t('report.send')}
        </button>
      </form>
    </Modal>
  )
}
