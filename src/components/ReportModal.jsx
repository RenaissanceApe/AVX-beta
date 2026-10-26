import { useState } from 'react'
import { Flag, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { track } from '../lib/usage'
import { REPORT_REASONS, trustError } from '../lib/trust'
import { useI18n } from '../i18n'
import { Modal, btn, btnDanger, input, label, colors } from './ui'

// Report a crew profile or a job post to AVX (docs/CREW_NETWORK.md, N4). It disappears for the
// reporter at once; AVX reviews it. For a profile, the reporter can also block the person.
//   <ReportModal kind="profile" | "job" target={id} name="…" blockUser={userId} onClose onReported />
export default function ReportModal({ kind, target, name, blockUser, onClose, onReported }) {
  const { t } = useI18n()
  const { notify } = useToast()
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [block, setBlock] = useState(false)
  const [sending, setSending] = useState(false)

  async function send(e) {
    e.preventDefault()
    if (!reason) return
    setSending(true)
    const { error } = await supabase.rpc('report_network', { p_kind: kind, p_target: target, p_reason: reason, p_note: note.trim() || null })
    if (!error && block && blockUser) {
      const b = await supabase.rpc('block_user', { p_user: blockUser, p_block: true })
      if (b.error) logger.error('trust', b.error, { step: 'block' })
    }
    setSending(false)
    if (error) {
      logger.error('trust', error, { step: 'report', kind })
      const k = trustError(error)
      return notify(k ? t(k) : userMessage(error), 'error')
    }
    notify(t('trust.report.sent'), 'success')
    track(`trust:report:${kind}`)
    onReported?.()
  }

  return (
    <Modal title={t(`trust.report.title.${kind}`, { name: name || '' })} onClose={onClose}>
      <form onSubmit={send} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5 }}>{t(`trust.report.intro.${kind}`)}</p>
        <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <legend style={{ ...label, marginBottom: '6px' }}>{t('trust.report.why')} *</legend>
          {REPORT_REASONS.map(r => (
            <label key={r} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', cursor: 'pointer' }}>
              <input type="radio" name="report-reason" checked={reason === r} onChange={() => setReason(r)} style={{ accentColor: 'var(--accent)' }} />
              {t(`trust.reason.${r}`)}
            </label>
          ))}
        </fieldset>
        <div>
          <label style={label} htmlFor="report-note">{t('trust.report.note')}</label>
          <textarea id="report-note" rows={3} value={note} onChange={e => setNote(e.target.value)} maxLength={1000} style={{ ...input, resize: 'vertical' }} />
        </div>
        {kind === 'profile' && blockUser && (
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '14px', cursor: 'pointer' }}>
            <input type="checkbox" checked={block} onChange={e => setBlock(e.target.checked)} style={{ marginTop: '3px', accentColor: 'var(--accent)' }} />
            <span>{t('trust.report.alsoBlock')}</span>
          </label>
        )}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button type="submit" disabled={sending || !reason} style={btnDanger}>
            {sending ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Flag size={15} />} {t('trust.report.send')}
          </button>
          <button type="button" onClick={onClose} style={{ ...btn, background: 'transparent' }}>{t('common.cancel')}</button>
        </div>
      </form>
    </Modal>
  )
}
