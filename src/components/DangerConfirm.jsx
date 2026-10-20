import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { useI18n } from '../i18n'
import { userMessage } from '../lib/logger'
import { Modal, btn, input, label, colors } from './ui'

const WAIT_SECONDS = 5
const red = 'var(--danger)'

// Typing must be deliberate, not a keyboard puzzle: ignore case, accents, dash style and spacing
export const normalizeForConfirm = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[\u2010-\u2015\u2212]/g, '-').replace(/[\u2018\u2019\u201c\u201d]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase()

// Two-step confirmation for irreversible deletions.
// Step 1 lists what will be destroyed and needs an explicit "I understand".
// Step 2 needs the exact name typed, and the button only unlocks after a few seconds.
// intro and confirmLabel replace the default wording ("Deleting … also deletes:", "Delete permanently").
export function DangerConfirmModal({ title, name, loadImpact, onConfirm, onClose, intro, confirmLabel }) {
  const { t } = useI18n()
  const [step, setStep] = useState(1)
  const [impact, setImpact] = useState(null)
  const [understood, setUnderstood] = useState(false)
  const [typed, setTyped] = useState('')
  const [wait, setWait] = useState(WAIT_SECONDS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    Promise.resolve(loadImpact?.()).then(list => { if (!cancelled) setImpact(list || []) }).catch(() => { if (!cancelled) setImpact([]) })
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (step !== 2 || wait <= 0) return
    const id = setTimeout(() => setWait(w => w - 1), 1000)
    return () => clearTimeout(id)
  }, [step, wait])

  const matches = normalizeForConfirm(typed) !== '' && normalizeForConfirm(typed) === normalizeForConfirm(name)

  async function confirm() {
    if (!matches || wait > 0 || busy) return
    setBusy(true)
    setError('')
    try {
      await onConfirm()
    } catch (err) {
      setError(userMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal title={title} onClose={busy ? () => {} : onClose} maxWidth={500}>
      <div role="alert" style={{ display: 'flex', gap: '10px', padding: '12px 14px', borderRadius: '10px', background: 'color-mix(in srgb, var(--danger) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--danger) 35%, transparent)', color: red, fontSize: '13px', lineHeight: 1.55, marginBottom: '14px' }}>
        <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
        <div><strong>{t('danger.irreversible')}</strong> {t('danger.noUndo')}</div>
      </div>

      {step === 1 && (
        <>
          <p style={{ fontSize: '13px', color: colors.soft, marginBottom: '8px' }}>{intro || t('danger.willDelete', { name })}</p>
          {impact === null ? (
            <Loader2 size={16} color={colors.muted} style={{ animation: 'spin 1s linear infinite' }} />
          ) : (
            <ul style={{ margin: '0 0 14px 18px', fontSize: '14px', lineHeight: 1.8 }}>
              {impact.map((line, i) => <li key={i}>{line}</li>)}
            </ul>
          )}
          <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '14px', cursor: 'pointer', marginBottom: '16px' }}>
            <input type="checkbox" checked={understood} onChange={e => setUnderstood(e.target.checked)} style={{ marginTop: '3px', accentColor: red }} />
            <span>{t('danger.understand')}</span>
          </label>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{ ...btn, background: 'transparent', borderColor: 'color-mix(in srgb, var(--fg) min(100%, calc(12% * var(--line-k))), transparent)', color: colors.soft }}>{t('danger.cancel')}</button>
            <button onClick={() => setStep(2)} disabled={!understood || impact === null} style={{ ...dangerBtn, opacity: understood ? 1 : 0.4 }}>{t('danger.continue')}</button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <label style={label} htmlFor="danger-name">{t('danger.typeName')}</label>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', padding: '6px 10px', marginBottom: '8px', borderRadius: '6px', background: 'color-mix(in srgb, var(--fg) min(100%, calc(5% * var(--line-k))), transparent)', userSelect: 'all' }}>{name}</div>
          <input id="danger-name" value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" autoFocus
            onPaste={e => e.preventDefault()} style={{ ...input, borderColor: typed && !matches ? 'color-mix(in srgb, var(--danger) 50%, transparent)' : undefined }} />
          <p style={{ fontSize: '12px', color: colors.muted, margin: '6px 0 14px' }}>{t('danger.noPaste')} {t('danger.lenient')}</p>
          {error && <p role="alert" style={{ color: red, fontSize: '13px', marginBottom: '10px' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button onClick={onClose} disabled={busy} style={{ ...btn, background: 'transparent', borderColor: 'color-mix(in srgb, var(--fg) min(100%, calc(12% * var(--line-k))), transparent)', color: colors.soft }}>{t('danger.cancel')}</button>
            <button onClick={confirm} disabled={!matches || wait > 0 || busy} style={{ ...dangerBtn, opacity: matches && wait <= 0 ? 1 : 0.4 }}>
              {busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={14} />}
              {wait > 0 ? t('danger.waitSeconds', { count: wait }) : confirmLabel || t('danger.deleteForever')}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}

// Collapsed "Danger zone" section to put at the bottom of a settings dialog.
export function DangerZone({ description, actionLabel, onAction }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginTop: '22px', borderTop: '1px solid color-mix(in srgb, var(--danger) 20%, transparent)', paddingTop: '12px' }}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} style={{ background: 'none', border: 'none', color: red, fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', padding: 0 }}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {t('danger.zone')}
      </button>
      {open && (
        <div style={{ marginTop: '10px', padding: '12px 14px', border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)', borderRadius: '10px' }}>
          <p style={{ fontSize: '13px', color: colors.soft, lineHeight: 1.55, marginBottom: '10px' }}>{description}</p>
          <button onClick={onAction} style={dangerBtn}><Trash2 size={14} /> {actionLabel}</button>
        </div>
      )}
    </div>
  )
}

const dangerBtn = {
  ...btn, background: 'color-mix(in srgb, var(--danger) 15%, transparent)', borderColor: 'color-mix(in srgb, var(--danger) 45%, transparent)', color: red,
}
