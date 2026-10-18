import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Printer, Loader2, History, FileDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { useI18n } from '../i18n'
import { quoteNumber } from '../lib/quotes'
import QuoteDocument, { toolbarBtn } from '../components/quotes/QuoteDocument'
import { downloadQuotePdf } from '../lib/quotePdf'

// Print preview of a quote: the live quote, or a saved version with ?v=<version id>.
// Print → "Save as PDF" to send it.
export default function QuotePrintPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const versionId = params.get('v')
  const navigate = useNavigate()
  const { t, fmt } = useI18n()
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    async function load() {
      setData(null)
      const { data: quote, error: qErr } = await supabase.from('quotes').select('*, organisations(*)').eq('id', id).maybeSingle()
      if (qErr || !quote) {
        if (qErr) logger.error('quotePrint', qErr, { quoteId: id })
        return setError(true)
      }
      let version = null
      if (versionId) {
        const { data: v, error: vErr } = await supabase.from('quote_versions').select('*').eq('id', versionId).eq('quote_id', id).maybeSingle()
        if (vErr || !v) {
          if (vErr) logger.error('quotePrint', vErr, { quoteId: id, step: 'version' })
          return setError(true)
        }
        version = v
      }
      const { data: branding } = await supabase.from('org_branding').select('header_image, brand_color').eq('org_id', quote.org_id).maybeSingle()
      const shown = version ? { ...version.snapshot, number: version.snapshot.number ?? quote.number } : quote
      setData({ quote: shown, org: quote.organisations || {}, branding: branding || {}, version })
      document.title = `${quoteNumber(shown, quote.organisations?.quote_number_prefix ?? 'Q')}${version ? ` v${version.version_no}` : ''} · ${shown.title}`
    }
    load()
    return () => { document.title = 'AVX' }
  }, [id, versionId])

  if (error) return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#fff' }}>
      {t('quote.notFound')} <button onClick={() => navigate('/dashboard')} style={toolbarBtn}>{t('common.back')}</button>
    </div>
  )
  if (!data) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Loader2 size={26} color="#1EC878" style={{ animation: 'spin 1s linear infinite' }} />
    </div>
  )

  const { version } = data
  return (
    <QuoteDocument quote={data.quote} org={data.org} branding={data.branding} toolbar={<>
      <button onClick={() => navigate(`/quote/${id}`)} style={toolbarBtn}><ArrowLeft size={14} /> {t('quote.backToEditor')}</button>
      {version
        ? <span style={{ flex: 1, fontSize: '13px', color: '#555', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <History size={14} /> {t('quoteVersions.viewing', { n: version.version_no, date: fmt(version.created_at, 'd MMM yyyy HH:mm') })}{version.note ? ` · ${version.note}` : ''}
          </span>
        : <span style={{ flex: 1, fontSize: '13px', color: '#555' }}>{t('quote.printHint')}</span>}
      <button onClick={() => downloadQuotePdf(data).catch(err => logger.error('quotePrint', err, { step: 'pdf' }))} style={toolbarBtn}><FileDown size={14} /> {t('quote.downloadPdf')}</button>
      <button onClick={() => window.print()} style={{ ...toolbarBtn, background: '#111', color: '#fff' }}><Printer size={14} /> {t('quote.print')}</button>
    </>} />
  )
}
