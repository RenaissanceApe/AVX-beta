import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2, Printer, Check, X, FileDown } from 'lucide-react'
import { loadSharedQuote, answerSharedQuote } from '../lib/quoteSharing'
import { quoteNumber } from '../lib/quotes'
import { useI18n, translate, fmtIn } from '../i18n'
import QuoteDocument, { toolbarBtn } from '../components/quotes/QuoteDocument'
import { downloadQuotePdf } from '../lib/quotePdf'
import GuestThread from '../components/messages/GuestThread'

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
      <Loader2 size={26} color="#555" style={{ animation: 'spin 1s linear infinite' }} />
    </div>
  )
  if (!data.quote) return (
    <div style={page}>
      <div style={notice}>
        <h1 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>
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
      <button onClick={() => downloadQuotePdf(data).catch(() => window.print())} style={toolbarBtn}><FileDown size={14} /> PDF</button>
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

  if (data.state === 'accepted' || data.state === 'declined') {
    const accepted = data.state === 'accepted'
    return (
      <div className="no-print" style={{ ...bar, borderColor: accepted ? '#1EC878' : '#ccc' }}>
        <strong style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {accepted ? <Check size={16} color="#0FA85A" /> : <X size={16} color="#B91C1C" />}
          {tr(accepted ? 'publicQuote.acceptedBy' : 'publicQuote.declinedBy', {
            name: data.responder_name || '', date: data.responded_at ? fmtIn(lang, data.responded_at, lang === 'pt' ? 'dd-MM-yyyy HH:mm' : 'd MMM yyyy HH:mm') : '',
          })}
        </strong>
        <span style={{ color: '#555', fontSize: '13px' }}>{tr('publicQuote.thanks', { org: data.org?.name || '' })}</span>
      </div>
    )
  }

  async function submit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    setError('')
    const res = await answerSharedQuote(token, choice, name.trim(), note.trim())
    setBusy(false)
    if (res.error) {
      if (res.error === 'already_answered') return setError(tr('publicQuote.alreadyAnswered'))
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
            {data.expires_at && <span style={{ display: 'block', fontSize: '12px', color: '#666' }}>{tr('publicQuote.openUntil', { date: fmtIn(lang, data.expires_at, lang === 'pt' ? 'dd-MM-yyyy' : 'd MMM yyyy') })}</span>}
          </span>
          <button onClick={() => setChoice('decline')} style={toolbarBtn}><X size={14} /> {tr('publicQuote.decline')}</button>
          <button onClick={() => setChoice('accept')} style={{ ...toolbarBtn, background: '#0FA85A', borderColor: '#0FA85A', color: '#fff' }}><Check size={14} /> {tr('publicQuote.accept')}</button>
        </>
      ) : (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
          <strong>{tr(choice === 'accept' ? 'publicQuote.acceptTitle' : 'publicQuote.declineTitle')}</strong>
          <label style={fieldLabel}>
            {tr('publicQuote.yourName')} *
            <input value={name} onChange={e => setName(e.target.value)} maxLength={200} required autoFocus style={field} />
          </label>
          <label style={fieldLabel}>
            {tr(choice === 'accept' ? 'publicQuote.noteAccept' : 'publicQuote.noteDecline')}
            <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={1000} rows={3} style={{ ...field, resize: 'vertical' }} />
          </label>
          {choice === 'accept' && <p style={{ fontSize: '12px', color: '#555', lineHeight: 1.5, margin: 0 }}>{tr('publicQuote.acceptLegal', { org: data.org?.legal_name || data.org?.name || '' })}</p>}
          {error && <p role="alert" style={{ fontSize: '13px', color: '#B91C1C', margin: 0 }}>{error}</p>}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setChoice(null)} style={toolbarBtn}>{tr('publicQuote.back')}</button>
            <button type="submit" disabled={busy || !name.trim()} style={{ ...toolbarBtn, background: choice === 'accept' ? '#0FA85A' : '#111', borderColor: 'transparent', color: '#fff' }}>
              {busy && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
              {tr(choice === 'accept' ? 'publicQuote.confirmAccept' : 'publicQuote.confirmDecline')}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

const page = { minHeight: '100vh', background: '#e9edf1', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }
const notice = { background: '#fff', color: '#111', borderRadius: '10px', padding: '28px', maxWidth: '420px', textAlign: 'center' }
const bar = {
  maxWidth: '210mm', margin: '12px auto 0', background: '#fff', color: '#111', borderRadius: '6px', border: '2px solid #1EC878',
  padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', fontFamily: "'Inter', sans-serif",
  position: 'sticky', bottom: '12px', boxShadow: '0 6px 24px rgba(0,0,0,0.12)',
}
const fieldLabel = { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', color: '#333' }
const field = { padding: '9px 11px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '14px', color: '#111', background: '#fff', fontFamily: 'inherit' }
