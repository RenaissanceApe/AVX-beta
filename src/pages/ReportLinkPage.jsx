import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Printer } from 'lucide-react'
import { loadLinkReport, linkTables } from '../lib/analytics/reportLinks'
import { categoryName } from '../lib/expenses'
import { formatMoney } from '../lib/quotes'
import { useI18n, fmt } from '../i18n'
import { PrintStyles } from '../components/reports/ReportParts'
import { btn, card, colors, mono, AvxLoader, AvxMark } from '../components/ui'

// The accountant's page (K9): opened from a read-only link (/r/<token>), no account needed. Shows
// one period's money for one organisation; unknown, expired and revoked links show nothing.
const COLUMNS = ['revenue', 'direct_costs', 'gross_margin', 'overheads', 'depreciation', 'operating_result', 'invoiced', 'credited', 'received', 'paid_out']

export default function ReportLinkPage() {
  const { token } = useParams()
  const { t, lang } = useI18n()
  const [data, setData] = useState(null)

  useEffect(() => {
    // Private links: keep them out of search engines and out of the referrer
    const metas = [['robots', 'noindex, nofollow'], ['referrer', 'no-referrer']].map(([name, content]) => {
      const m = document.createElement('meta')
      m.name = name
      m.content = content
      document.head.appendChild(m)
      return m
    })
    loadLinkReport(token).then(res => {
      setData(res)
      if (res.report) document.title = `${res.report.org?.name || 'AVX'} · ${res.report.label}`
    })
    return () => { metas.forEach(m => m.remove()); document.title = 'AVX' }
  }, [token])

  const page = { minHeight: '100vh', background: colors.bg, color: 'var(--text)', padding: '24px 16px 48px', boxSizing: 'border-box' }
  if (!data) return <main style={{ ...page, display: 'flex', justifyContent: 'center', paddingTop: '80px' }}><AvxLoader size={24} color={colors.accentText} label={t('common.loading')} /></main>
  if (!data.report) return (
    <main style={page}>
      <div style={{ ...card, maxWidth: '420px', margin: '60px auto', padding: '24px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '8px' }}>{t('reportLink.notFoundTitle')}</h1>
        <p style={{ fontSize: '14px', color: colors.muted, lineHeight: 1.6, margin: 0 }}>
          {data.state === 'error' ? t('reportLink.errorBody') : t('reportLink.notFoundBody')}
        </p>
      </div>
    </main>
  )

  const r = data.report
  const money = (v, c) => formatMoney(Number(v) || 0, c, lang)
  const lastDay = new Date(new Date(`${r.until}T00:00:00`).getTime() - 86400000)
  const tables = linkTables(r)

  return (
    <main style={page}>
      <PrintStyles />
      <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <header style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 240px', minWidth: 0 }}>
            <p style={{ fontSize: '13px', color: colors.muted, margin: 0 }}>{t('reportLink.kicker')}</p>
            <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '2px 0', overflowWrap: 'anywhere' }}>{r.org?.legal_name || r.org?.name}</h1>
            <p style={{ fontSize: '13px', color: colors.muted, margin: 0 }}>
              {r.label} · {t('reportLink.period', { from: fmt(r.from, 'd MMM yyyy'), until: fmt(lastDay, 'd MMM yyyy') })}
            </p>
          </div>
          <button type="button" className="no-print" onClick={() => window.print()} style={btn}><Printer size={14} aria-hidden="true" /> {t('reportLink.print')}</button>
        </header>
        <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.6, margin: 0 }}>
          {t('reportLink.note', { date: fmt(r.at, 'd MMM yyyy HH:mm'), expires: fmt(r.expires_at, 'd MMM yyyy') })}
        </p>

        {tables.length === 0 && <p style={{ ...card, padding: '16px', fontSize: '14px', margin: 0 }}>{t('reportLink.nothing')}</p>}
        {tables.map(tb => (
          <section key={tb.currency} aria-labelledby={`rl-${tb.currency}`} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h2 id={`rl-${tb.currency}`} style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>{t('reportLink.byMonth', { currency: tb.currency })}</h2>
            {/* Wide table: scrolls inside its box on phones, never the page */}
            <div tabIndex={0} role="region" aria-labelledby={`rl-${tb.currency}`} style={{ overflowX: 'auto', ...card, padding: 0 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '13px', minWidth: '900px' }}>
                <thead>
                  <tr>
                    <th scope="col" style={th(true)}>{t('reportLink.col.month')}</th>
                    {COLUMNS.map(c => <th key={c} scope="col" style={th()}>{t(`reportLink.col.${c}`)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {tb.months.map(m => (
                    <tr key={m.month}>
                      <th scope="row" style={td(true)}>{fmt(`${m.month}-01`, 'MMM yyyy')}{m.estimated ? ' *' : ''}</th>
                      {COLUMNS.map(c => <td key={c} style={td()}>{money(m[c], tb.currency)}</td>)}
                    </tr>
                  ))}
                  {tb.total && (
                    <tr>
                      <th scope="row" style={{ ...td(true), fontWeight: 700 }}>{t('reportLink.total')}</th>
                      {COLUMNS.map(c => (
                        <td key={c} style={{ ...td(), fontWeight: 700 }}>
                          {c in tb.total ? money(tb.total[c], tb.currency) : money(tb.months.reduce((s, m) => s + m[c], 0), tb.currency)}
                        </td>
                      ))}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {tb.months.some(m => m.estimated) && <p style={{ fontSize: '13px', color: colors.muted, margin: 0 }}>{t('reportLink.estimatedNote')}</p>}
            {tb.spending.length > 0 && (
              <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '13px' }}>
                  <caption style={{ textAlign: 'left', fontWeight: 700, padding: '10px 12px 4px' }}>{t('reportLink.spending', { currency: tb.currency })}</caption>
                  <thead><tr><th scope="col" style={th(true)}>{t('reportLink.col.category')}</th><th scope="col" style={th()}>{t('reportLink.col.amount')}</th></tr></thead>
                  <tbody>
                    {tb.spending.map((s, i) => (
                      <tr key={`${s.category}-${i}`}>
                        <th scope="row" style={td(true)}>{categoryName({ name: s.category, starter_key: s.starter_key }, t) || '—'}</th>
                        <td style={td()}>{money(s.amount, tb.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
        <footer style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: colors.muted }}>
          <AvxMark size={14} /> {t('reportLink.footer')}
        </footer>
      </div>
    </main>
  )
}

const th = (left = false) => ({ textAlign: left ? 'left' : 'right', padding: '8px 12px', borderBottom: `1px solid ${colors.lineStrong}`, color: colors.muted, fontWeight: 600, whiteSpace: 'nowrap' })
const td = (left = false) => ({ ...(left ? {} : mono), textAlign: left ? 'left' : 'right', padding: '6px 12px', borderBottom: `1px solid ${colors.line}`, whiteSpace: 'nowrap', fontWeight: left ? 500 : 400 })
