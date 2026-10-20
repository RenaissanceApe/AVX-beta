import { useEffect, useState } from 'react'
import { History, Eye, RotateCcw, Loader2, Save, Send, Copy, Check, Link2, Ban, Mail } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { saveVersion, sendQuote } from '../../lib/quoteSharing'
import { quotePdfBase64, quotePdfName } from '../../lib/quotePdf'
import { track } from '../../lib/usage'
import { formatMoney } from '../../lib/quotes'
import { useI18n } from '../../i18n'
import { Modal, btn, btnPrimary, iconBtn, input, label, card, colors } from '../ui'

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const small = { fontSize: '12px', color: colors.muted, lineHeight: 1.5 }

// Saved versions of a quote: save the current state with a note, view an old one,
// or restore it (the current state is saved as a version first, so nothing is lost).
//   prepare(): saves pending edits and returns { quote, body } as they are now
export function VersionsModal({ quoteId, prepare, currency, onRestore, onClose }) {
  const { t, fmt, lang } = useI18n()
  const { notify } = useToast()
  const [versions, setVersions] = useState(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(null) // 'save' | version id

  useEffect(() => {
    supabase.from('quote_versions').select('id, version_no, note, total_net, created_at').eq('quote_id', quoteId).order('version_no', { ascending: false })
      .then(({ data, error }) => {
        if (error) logger.error('quoteVersions', error, { quoteId })
        setVersions(data || [])
      })
  }, [quoteId])

  async function save(e) {
    e.preventDefault()
    setBusy('save')
    const { quote, body } = await prepare()
    const { data, error } = await saveVersion(quote, body, note)
    setBusy(null)
    if (error) {
      logger.error('quoteVersions', error, { step: 'save', quoteId })
      return notify(userMessage(error), 'error')
    }
    setVersions(list => [data, ...(list || [])])
    track('quote:version-saved')
    setNote('')
    notify(t('quoteVersions.saved', { n: data.version_no }), 'success')
  }

  async function restore(v) {
    if (!window.confirm(t('quoteVersions.confirmRestore', { n: v.version_no }))) return
    setBusy(v.id)
    const { quote, body } = await prepare()
    const [{ data: full, error }, backup] = await Promise.all([
      supabase.from('quote_versions').select('snapshot').eq('id', v.id).single(),
      saveVersion(quote, body, t('quoteVersions.beforeRestoreNote', { n: v.version_no })),
    ])
    setBusy(null)
    if (error || backup.error) {
      logger.error('quoteVersions', error || backup.error, { step: 'restore', quoteId })
      return notify(userMessage(error || backup.error), 'error')
    }
    onRestore(full.snapshot)
    track('quote:version-restored')
    notify(t('quoteVersions.restored', { n: v.version_no, backup: backup.data.version_no }), 'success')
    onClose()
  }

  return (
    <Modal title={t('quoteVersions.title')} onClose={onClose} maxWidth={560}>
      <p style={{ ...small, marginBottom: '14px' }}>{t('quoteVersions.intro')}</p>
      <form onSubmit={save} style={{ display: 'flex', gap: '8px', marginBottom: '18px', flexWrap: 'wrap' }}>
        <label htmlFor="ver-note" style={{ position: 'absolute', left: '-9999px' }}>{t('quoteVersions.note')}</label>
        <input id="ver-note" value={note} onChange={e => setNote(e.target.value)} maxLength={200} placeholder={t('quoteVersions.notePlaceholder')} style={{ ...input, flex: '1 1 220px' }} />
        <button type="submit" disabled={busy === 'save'} style={btn}>
          {busy === 'save' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />} {t('quoteVersions.save')}
        </button>
      </form>
      {versions === null
        ? <Loader2 size={18} color={colors.accentText} style={{ animation: 'spin 1s linear infinite' }} />
        : versions.length === 0
          ? <p style={small}>{t('quoteVersions.empty')}</p>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {versions.map(v => (
                <div key={v.id} style={{ ...card, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <History size={15} color={colors.soft} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '14px' }}>
                      {t('quoteVersions.label', { n: v.version_no })}{v.note && <span style={{ fontWeight: 400, color: colors.soft }}> · {v.note}</span>}
                    </div>
                    <div style={small}>{fmt(v.created_at, 'd MMM yyyy HH:mm')} · {formatMoney(v.total_net, currency, lang)}</div>
                  </div>
                  <a href={`/quote/${quoteId}/print?v=${v.id}`} target="_blank" rel="noreferrer" aria-label={t('quoteVersions.viewN', { n: v.version_no })} title={t('quoteVersions.view')} style={iconBtn}><Eye size={16} /></a>
                  <button onClick={() => restore(v)} disabled={!!busy} aria-label={t('quoteVersions.restoreN', { n: v.version_no })} title={t('quoteVersions.restore')} style={iconBtn}>
                    {busy === v.id ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <RotateCcw size={16} />}
                  </button>
                </div>
              ))}
            </div>
          )}
    </Modal>
  )
}

const SHARE_COLORS = { open: 'var(--info)', accepted: colors.accent, declined: colors.danger, revoked: colors.muted, expired: colors.muted }

// Send to the client: saves a version, creates a link to it (replacing any earlier
// open link) and emails it if asked. Lists earlier links with their answers.
export function SendQuoteModal({ quoteId, prepare, defaultEmail, onSent, onClose }) {
  const { t, fmt } = useI18n()
  const { notify } = useToast()
  const [email, setEmail] = useState(defaultEmail || '')
  const [byEmail, setByEmail] = useState(!!defaultEmail)
  const [attachPdf, setAttachPdf] = useState(true)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null) // { link, emailed, email_error }
  const [copied, setCopied] = useState(false)
  const [shares, setShares] = useState(null)

  async function loadShares() {
    const { data, error } = await supabase.from('quote_shares')
      .select('id, status, sent_to, emailed, created_at, expires_at, viewed_at, responded_at, responder_name, responder_note, quote_versions(version_no)')
      .eq('quote_id', quoteId).order('created_at', { ascending: false }).limit(20)
    if (error) logger.error('quoteShares', error, { quoteId })
    setShares(data || [])
  }
  useEffect(() => { loadShares() }, [quoteId]) // eslint-disable-line react-hooks/exhaustive-deps

  const emailOk = !byEmail || EMAIL.test(email.trim())

  async function submit(e) {
    e.preventDefault()
    if (!emailOk) return
    setSending(true)
    try {
      const { quote, body } = await prepare()
      const to = email.trim()
      const { data: version, error } = await saveVersion(quote, body, to ? t('quoteVersions.sentToNote', { email: to }) : t('quoteVersions.sentNote'))
      if (error) throw error
      let pdf = null
      if (byEmail && attachPdf) {
        // The same version the link shows, as a PDF attachment
        const [{ data: org }, { data: branding }] = await Promise.all([
          supabase.from('organisations').select('name, legal_name, email, phone, quote_number_prefix').eq('id', quote.org_id).single(),
          supabase.from('org_branding').select('header_image, brand_color').eq('org_id', quote.org_id).maybeSingle(),
        ])
        const shown = { ...quote, body }
        try {
          pdf = { content: await quotePdfBase64({ quote: shown, org: org || {}, branding: branding || {} }), name: quotePdfName(shown, org || {}) }
        } catch (err) {
          logger.error('quoteShares', err, { step: 'pdf', quoteId })
          notify(t('send.pdfFailed'), 'info')
        }
      }
      const res = await sendQuote({ quoteId, versionId: version.id, email: to, sendEmail: byEmail, pdf })
      setResult(res)
      onSent()
      track(res.emailed ? (pdf ? 'quote:sent-email-pdf' : 'quote:sent-email') : 'quote:sent-link')
      if (byEmail && !res.emailed) notify(res.email_error === 'not_configured' ? t('send.emailNotConfigured') : t('send.emailFailed'), 'info', { duration: 12000 })
      else notify(res.emailed ? t('send.emailed', { email: to }) : t('send.linkReady'), 'success')
      loadShares()
    } catch (err) {
      logger.error('quoteShares', err, { step: 'send', quoteId })
      notify(userMessage(err), 'error')
    } finally {
      setSending(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(result.link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt(t('send.copyPrompt'), result.link)
    }
  }

  async function revoke(share) {
    if (!window.confirm(t('send.confirmRevoke'))) return
    const { data, error } = await supabase.from('quote_shares').update({ status: 'revoked' }).eq('id', share.id).eq('status', 'open').select('id')
    if (error || !data?.length) return notify(error ? userMessage(error) : t('error.permission'), 'error')
    notify(t('send.revoked'), 'success')
    if (result) setResult(null)
    loadShares()
  }

  return (
    <Modal title={t('send.title')} onClose={onClose} maxWidth={560}>
      {result ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '18px' }}>
          <p style={{ fontSize: '14px', lineHeight: 1.5 }}>{result.emailed ? t('send.doneEmailed', { email: email.trim() }) : t('send.doneLink')}</p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input readOnly value={result.link} aria-label={t('send.link')} onFocus={e => e.target.select()} style={{ ...input, fontFamily: 'var(--font-mono)', fontSize: '12px' }} />
            <button onClick={copy} style={btn}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? t('send.copied') : t('send.copy')}</button>
          </div>
          <p style={small}>{t('send.linkOnce')}</p>
        </div>
      ) : (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '18px' }}>
          <p style={small}>{t('send.intro')}</p>
          <div>
            <label style={label} htmlFor="send-email">{t('send.clientEmail')}</label>
            <input id="send-email" type="email" value={email} onChange={e => { setEmail(e.target.value); if (e.target.value && !byEmail) setByEmail(true) }} maxLength={200} placeholder="client@company.com" style={input} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: colors.soft, cursor: 'pointer' }}>
            <input type="checkbox" checked={byEmail} onChange={e => setByEmail(e.target.checked)} /> {t('send.byEmail')}
          </label>
          {byEmail && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: colors.soft, cursor: 'pointer', marginTop: '-4px' }}>
              <input type="checkbox" checked={attachPdf} onChange={e => setAttachPdf(e.target.checked)} /> {t('send.attachPdf')}
            </label>
          )}
          {!emailOk && <p role="alert" style={{ ...small, color: colors.danger }}>{t('send.badEmail')}</p>}
          <button type="submit" disabled={sending || !emailOk} style={{ ...btnPrimary, justifyContent: 'center' }}>
            {sending ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : byEmail ? <Send size={15} /> : <Link2 size={15} />}
            {byEmail ? t('send.sendEmail') : t('send.createLink')}
          </button>
        </form>
      )}

      <h3 style={{ ...label, marginBottom: '8px' }}>{t('send.history')}</h3>
      {shares === null
        ? <Loader2 size={18} color={colors.accentText} style={{ animation: 'spin 1s linear infinite' }} />
        : shares.length === 0
          ? <p style={small}>{t('send.noHistory')}</p>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {shares.map(s => {
                const state = s.status === 'open' && new Date(s.expires_at) < new Date() ? 'expired' : s.status
                return (
                  <div key={s.id} style={{ ...card, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: SHARE_COLORS[state] }}>{t(`share.${state}`)}</span>
                      <span style={{ fontSize: '13px', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {s.emailed && <Mail size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />}
                        {s.sent_to || t('send.linkOnly')} · {t('quoteVersions.label', { n: s.quote_versions?.version_no ?? '?' })}
                      </span>
                      {state === 'open' && (
                        <button onClick={() => revoke(s)} aria-label={t('send.revoke')} title={t('send.revoke')} style={{ ...iconBtn, color: colors.danger }}><Ban size={15} /></button>
                      )}
                    </div>
                    <div style={small}>
                      {[
                        t('send.sentOn', { date: fmt(s.created_at, 'd MMM HH:mm') }),
                        s.viewed_at && t('send.viewedOn', { date: fmt(s.viewed_at, 'd MMM HH:mm') }),
                        s.responded_at && t(`send.${s.status}By`, { name: s.responder_name, date: fmt(s.responded_at, 'd MMM HH:mm') }),
                        state === 'open' && t('send.expiresOn', { date: fmt(s.expires_at, 'd MMM') }),
                      ].filter(Boolean).join(' · ')}
                    </div>
                    {s.responder_note && <div style={{ fontSize: '13px', color: colors.soft, marginTop: '4px', whiteSpace: 'pre-line' }}>“{s.responder_note}”</div>}
                  </div>
                )
              })}
            </div>
          )}
    </Modal>
  )
}
