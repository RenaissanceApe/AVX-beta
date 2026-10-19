import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useI18n, translate } from '../i18n'
import { rangeText } from '../lib/clashes'
import GuestThread from '../components/messages/GuestThread'

// The page a subrental's supplier opens from the link they were sent (/s/<token>): no account
// needed. Shows what is being hired (items and quantities, no prices) and a conversation with
// the company (docs/MESSAGING.md, M4b).
export default function SupplierLinkPage() {
  const { token } = useParams()
  const { lang, setLang } = useI18n()
  const tr = (key, vars) => translate(lang, key, vars)
  const [about, setAbout] = useState(undefined)
  const [org, setOrg] = useState(null)

  useEffect(() => {
    // Private links stay out of search engines
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])

  // null: the link is wrong or was turned off
  const onData = res => {
    if (!res) return setAbout(null)
    setAbout(res.about)
    setOrg(res.org)
    document.title = `${res.org?.name || 'AVX'} · ${tr('supplierPage.title')}`
  }

  return (
    <div style={page}>
      <div style={{ maxWidth: '210mm', margin: '0 auto', display: 'flex', justifyContent: 'flex-end', gap: '6px' }} role="group" aria-label="Language">
        {['pt', 'en'].map(l => (
          <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l} style={{ ...langBtn, fontWeight: lang === l ? 700 : 400 }}>{l.toUpperCase()}</button>
        ))}
      </div>
      {about === undefined && <div style={{ textAlign: 'center', padding: '40px' }}><Loader2 size={24} color="#555" style={{ animation: 'spin 1s linear infinite' }} /></div>}
      {about === null && (
        <div style={card}>
          <h1 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>{tr('supplierPage.notFoundTitle')}</h1>
          <p style={{ fontSize: '14px', color: '#555', lineHeight: 1.6 }}>{tr('supplierPage.notFoundBody')}</p>
        </div>
      )}
      {about && (
        <article style={card}>
          <div style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{tr('supplierPage.title')}</div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, margin: '2px 0 4px' }}>{org?.name}</h1>
          <p style={{ fontSize: '14px', color: '#333', margin: 0 }}>
            {[about.reference && tr('supplierPage.reference', { reference: about.reference }), about.supplier && tr('supplierPage.for', { supplier: about.supplier })].filter(Boolean).join(' · ')}
          </p>
          <p style={{ fontSize: '15px', fontWeight: 700, margin: '10px 0' }}>{about.starts_at && about.ends_at ? rangeText(about.starts_at, about.ends_at) : ''}</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr><th style={th}>{tr('supplierPage.item')}</th><th style={{ ...th, textAlign: 'right', width: '90px' }}>{tr('supplierPage.quantity')}</th></tr>
            </thead>
            <tbody>
              {(about.lines || []).map((l, i) => (
                <tr key={i}><td style={td}>{l.name}</td><td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{l.quantity}</td></tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
            {tr('supplierPage.contact', { org: org?.name || '' })}{' '}
            {[org?.email && <a key="e" href={`mailto:${org.email}`}>{org.email}</a>, org?.phone && <a key="p" href={`tel:${org.phone.replace(/[^+\d]/g, '')}`}>{org.phone}</a>]
              .filter(Boolean).reduce((acc, el, i) => (i ? [...acc, ' · ', el] : [el]), [])}
          </p>
        </article>
      )}
      {about !== null && <GuestThread token={token} lang={lang} onData={onData} />}
    </div>
  )
}

const page = { minHeight: '100vh', background: '#e9edf1', color: '#111', padding: '16px', fontFamily: "'Inter', sans-serif" }
const card = { maxWidth: '210mm', margin: '12px auto 0', background: '#fff', borderRadius: '6px', padding: '20px' }
const th = { textAlign: 'left', fontSize: '11px', textTransform: 'uppercase', color: '#666', padding: '6px', borderBottom: '1px solid #ccc' }
const td = { padding: '7px 6px', borderBottom: '1px solid #eee' }
const langBtn = { background: 'none', border: '1px solid #c5ccd4', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer', color: '#111' }
