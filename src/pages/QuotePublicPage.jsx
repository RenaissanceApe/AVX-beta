import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Printer, Check, X, FileDown, PenLine } from 'lucide-react'
import { loadSharedQuote, answerSharedQuote } from '../lib/quoteSharing'
import { quoteNumber } from '../lib/quotes'
import { useI18n, translate, fmtIn } from '../i18n'
import QuoteDocument, { toolbarBtn } from '../components/quotes/QuoteDocument'
import { downloadQuotePdf } from '../lib/quotePdf'
import GuestThread from '../components/messages/GuestThread'
import { AvxLoader } from '../components/ui'
import SignaturePad from '../components/signatures/SignaturePad'
import { blobToDataUrl, shortHash } from '../lib/signatures'

// The page a client opens from a quote link: no account needed. Shows the version
// that was sent, in the quote's language, with Accept / Decline, and a conversation with the
// company (docs/MESSAGING.md, M4b).
export default function QuotePublicPage() {
  const { token } = useParams()
  const { t, lang: uiLang } = useI18n()
  const [data, setData] = useState(null)

  useEffect(() => {
    // Quote links are private: keep them out of search engines
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    loadSharedQuote(token).then(res => {
      setData(res)
      if (res.quote) document.title = `${quoteNumber(res.quote, res.org?.quote_number_prefix ?? 'Q')} · ${res.quote.title}`
    })
    return () => { meta.remove(); document.title = 'AVX' }
  }, [token])

  if (!data) return (
    <div style={page}>
      <AvxLoader size={26} color="#555" />
    </div>
  )
  if (!data.quote) return (
    <div style={page}>
      <div style={notice}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '8px' }}>
          {data.state === 'expired' ? t('publicQuote.expiredTitle') : t('publicQuote.notFoundTitle')}
        </h1>
        <p style={{ fontSize: '14px', color: '#555', lineHeight: 1.6 }}>
          {data.state === 'expired'
            ? t('publicQuote.expiredBody', { org: data.org?.name || '' })
            : data.state === 'error' ? t('publicQuote.errorBody') : t('publicQuote.notFoundBody')}
          {data.org?.email && <> <a href={`mailto:${data.org.email}`}>{data.org.email}</a></>}
        </p>
        {/* An expired quote can still be asked about (e.g. to extend it) */}
        {data.state === 'expired' && <div style={{ textAlign: 'left' }}><GuestThread token={token} lang={uiLang} /></div>}
      </div>
    </div>
  )

  const L = data.quote.language === 'en' ? 'en' : 'pt'
  return (
    <QuoteDocument quote={data.quote} org={data.org} branding={data.branding} toolbar={<>
      <span style={{ flex: 1, fontSize: '13px', color: '#555' }}>{data.org?.name}</span>
      <button onClick={() => downloadQuotePdf({ ...data, signature: data.signature?.image ? data.signature : null }).catch(() => window.print())} style={toolbarBtn}><FileDown size={14} /> PDF</button>
      <button onClick={() => window.print()} style={toolbarBtn}><Printer size={14} /> {translate(L, 'publicQuote.print')}</button>
    </>}>
      <GuestThread token={token} lang={L} defaultName={data.responder_name || data.quote.client_name || ''} />
      <Answer token={token} lang={L} data={data} onAnswered={res => setData(d => ({ ...d, ...res }))} />
    </QuoteDocument>
  )
}

function Answer({ token, lang, data, onAnswered }) {
  const tr = (key, vars) => translate(lang, key, vars)
  const [choice, setChoice] = useState(null) // 'accept' | 'decline'
  const [name, setName] = useState(data.quote.client_name || '')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [signing, setSigning] = useState(false) // the optional drawn signature (accept only)
  const [hasInk, setHasInk] = useState(false)
  const pad = useRef(null)

  // Cancelled by the company (quote bin, issue 124): shown, but no longer answerable
  if (data.state === 'cancelled') {
    return (
      <div className="no-print" style={{ ...bar, borderColor: '#ccc' }}>
        <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <X size={16} color="#B91C1C" /> {tr('publicQuote.cancelled', { org: data.org?.name || '' })}
        </strong>
      </div>
    )
  }

  if (data.state === 'accepted' || data.state === 'declined') {
    const accepted = data.state === 'accepted'
    return (
      <div className="no-print" style={{ ...bar, borderColor: accepted ? '#1EC878' : '#ccc' }}>
        <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {accepted ? <Check size={16} color="#0FA85A" /> : <X size={16} color="#B91C1C" />}
          {tr(accepted ? 'publicQuote.acceptedBy' : 'publicQuote.declinedBy', {
            name: data.responder_name || '', date: data.responded_at ? fmtIn(lang, data.responded_at, lang === 'pt' ? 'dd-MM-yyyy HH:mm' : 'd MMM yyyy HH:mm') : '',
          })}
        </strong>
        <span style={{ color: '#555', fontSize: '13px' }}>{tr('publicQuote.thanks', { org: data.org?.name || '' })}</span>
        {accepted && data.signature?.image && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', width: '100%' }}>
            <img src={data.signature.image} alt={tr('signature.imageAlt', { name: data.signature.signer_name })} style={{ height: '48px', border: '1px solid #ddd', background: '#fff' }} />
            <span style={{ fontSize: '11px', color: '#555', fontFamily: 'monospace' }}>{tr('signature.hashLine', { hash: shortHash(data.signature.document_sha256) })}</span>
          </div>
        )}
        {data.signature_error && <span role="alert" style={{ color: '#B91C1C', fontSize: '13px' }}>{tr('publicQuote.signatureNotKept')}</span>}
      </div>
    )
  }

  async function submit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    setError('')
    const png = choice === 'accept' && signing && hasInk ? await pad.current?.png() : null
    const signature = png ? await blobToDataUrl(png) : null
    const res = await answerSharedQuote(token, choice, name.trim(), note.trim(), signature)
    setBusy(false)
    if (res.error) {
      if (res.error === 'already_answered') return setError(tr('publicQuote.alreadyAnswered'))
      if (res.error === 'cancelled') return onAnswered({ state: 'cancelled' })
      if (res.error === 'invalid_signature') return setError(tr('publicQuote.signatureInvalid'))
      return setError(tr('publicQuote.failed'))
    }
    onAnswered(res)
  }

  return (
    <div className="no-print" style={bar}>
      {!choice ? (
        <>
          <span style={{ flex: '1 1 220px', fontSize: '14px' }}>
            {tr('publicQuote.prompt')}
            {data.expires_at && <span style={{ display: 'block', fontSize: '13px', color: '#666' }}>{tr('publicQuote.openUntil', { date: fmtIn(lang, data.expires_at, lang === 'pt' ? 'dd-MM-yyyy' : 'd MMM yyyy') })}</span>}
          </span>
          <button onClick={() => setChoice('decline')} style={toolbarBtn}><X size={14} /> {tr('publicQuote.decline')}</button>
          <button onClick={() => setChoice('accept')} style={{ ...toolbarBtn, background: '#0B7A41', borderColor: '#0B7A41', color: '#fff' }}><Check size={14} /> {tr('publicQuote.accept')}</button>
        </>
      ) : (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
          <strong>{tr(choice === 'accept' ? 'publicQuote.acceptTitle' : 'publicQuote.declineTitle')}</strong>
          <label style={fieldLabel}>
            {tr('publicQuote.yourName')} *
            <input value={name} onChange={e => setName(e.target.value)} maxLength={200} required autoFocus style={field} />
          </label>
          <label style={fieldLabel}>
            {tr(choice === 'accept' ? 'publicQuote.noteAccept' : 'publicQuote.noteDecline')}
            <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={1000} rows={3} style={{ ...field, resize: 'vertical' }} />
          </label>
          {choice === 'accept' && (signing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <SignaturePad ref={pad} onChange={setHasInk} lang={lang} paper label={tr('publicQuote.signLabel')} />
              <button type="button" onClick={() => { setSigning(false); setHasInk(false) }} style={{ ...toolbarBtn, alignSelf: 'flex-start' }}>{tr('publicQuote.signSkip')}</button>
            </div>
          ) : (
            <button type="button" onClick={() => setSigning(true)} style={{ ...toolbarBtn, alignSelf: 'flex-start' }}><PenLine size={14} aria-hidden="true" /> {tr('publicQuote.signAdd')}</button>
          ))}
          {choice === 'accept' && <p style={{ fontSize: '13px', color: '#555', lineHeight: 1.5, margin: 0 }}>{tr('publicQuote.acceptLegal', { org: data.org?.legal_name || data.org?.name || '' })}</p>}
          {choice === 'accept' && signing && <p style={{ fontSize: '11px', color: '#555', lineHeight: 1.5, margin: 0 }}>{tr('signature.plainNotice')}</p>}
          {error && <p role="alert" style={{ fontSize: '13px', color: '#B91C1C', margin: 0 }}>{error}</p>}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setChoice(null)} style={toolbarBtn}>{tr('publicQuote.back')}</button>
            <button type="submit" disabled={busy || !name.trim()} style={{ ...toolbarBtn, background: choice === 'accept' ? '#0B7A41' : '#111', borderColor: 'transparent', color: '#fff' }}>
              {busy && <AvxLoader size={14} />}
              {tr(choice === 'accept' ? 'publicQuote.confirmAccept' : 'publicQuote.confirmDecline')}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

const page = { minHeight: '100vh', background: '#e9edf1', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }
const notice = { background: '#fff', color: '#111', padding: '28px', maxWidth: '420px', textAlign: 'center' }
const bar = {
  maxWidth: '210mm', margin: '12px auto 0', background: '#fff', color: '#111', border: '2px solid #1EC878',
  padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', fontFamily: "'Inter', sans-serif",
  position: 'sticky', bottom: '12px',
}
const fieldLabel = { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', color: '#333' }
const field = { padding: '9px 11px', border: '1px solid #ccc', fontSize: '14px', color: '#111', background: '#fff', fontFamily: 'inherit' }
