import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import QRCode from 'qrcode'
import { useI18n } from '../i18n'
import { logger } from '../lib/logger'
import { printLink } from '../lib/printLink'

// The corner of every print (upkeep U6): a small QR that opens this same page live in AVX, and
// when it was printed. The link is the app's own address, so it needs a sign-in and the same
// access as the page. A new print gets it by putting <PrintFooter /> at the end of its sheet.
export default function PrintFooter() {
  const { t, fmt } = useI18n()
  const { pathname, search } = useLocation()
  const [svg, setSvg] = useState('')
  const [printedAt] = useState(() => new Date())
  const link = printLink(window.location.origin, pathname, search)

  useEffect(() => {
    let cancelled = false
    if (!link) return undefined
    QRCode.toString(link, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' })
      .then(s => { if (!cancelled) setSvg(s) })
      .catch(err => logger.warn('print-footer', 'QR failed', { message: err?.message }))
    return () => { cancelled = true }
  }, [link])

  return (
    <footer className="print-footer" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', marginTop: '16px', fontSize: '11px', breakInside: 'avoid' }}>
      <div style={{ textAlign: 'right', lineHeight: 1.4 }}>
        <div>{t('callsheet.printed', { date: fmt(printedAt, 'd MMM yyyy, HH:mm') })}</div>
        {svg && <div style={{ opacity: 0.75 }}>{t('callsheet.qrHint')}</div>}
      </div>
      {svg && (
        <div className="print-qr" role="img" aria-label={t('callsheet.qrAlt')}
          style={{ width: '18mm', height: '18mm', flexShrink: 0, background: '#fff' }}
          dangerouslySetInnerHTML={{ __html: svg.replace('<svg', '<svg width="100%" height="100%" aria-hidden="true"') }} />
      )}
    </footer>
  )
}
