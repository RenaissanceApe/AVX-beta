import { useState } from 'react'
import { Check } from 'lucide-react'
import { LOST_REASONS } from '../../lib/quotes'
import { t } from '../../i18n'
import { Modal, btn, btnPrimary, input, label } from '../ui'
import { HintLabel } from '../help/HelpParts'

// Asked when a quote is marked declined: why it was lost (optional), for the sales reports
export default function LostReasonModal({ reason, note, onSave, onClose }) {
  const [value, setValue] = useState(reason || '')
  const [text, setText] = useState(note || '')
  function save(e) {
    e.preventDefault()
    onSave({ lost_reason: value || null, lost_note: text.trim() || null })
  }
  return (
    <Modal title={t('lost.title')} onClose={onClose}>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div>
          <HintLabel htmlFor="lost-reason" hint="lost-reason">{t('lost.reason')}</HintLabel>
          <select id="lost-reason" value={value} onChange={e => setValue(e.target.value)} style={{ ...input, cursor: 'pointer' }} autoFocus>
            <option value="">{t('lost.notSaid')}</option>
            {LOST_REASONS.map(r => <option key={r} value={r}>{t(`lost.reasons.${r}`)}</option>)}
          </select>
        </div>
        <div>
          <label style={label} htmlFor="lost-note">{t('lost.note')}</label>
          <textarea id="lost-note" value={text} onChange={e => setText(e.target.value)} rows={3} maxLength={500} style={{ ...input, resize: 'vertical' }} />
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" onClick={onClose} style={btn}>{t('lost.skip')}</button>
          <button type="submit" style={btnPrimary}><Check size={15} /> {t('common.save')}</button>
        </div>
      </form>
    </Modal>
  )
}
