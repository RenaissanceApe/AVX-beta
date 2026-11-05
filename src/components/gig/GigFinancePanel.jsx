import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Wallet, Receipt, Loader2, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { formatMoney } from '../../lib/quotes'
import { useRateCard } from '../../lib/useCrewRates'
import { cardFees, isEstimate } from '../../lib/analytics/gigFinance'
import { useI18n } from '../../i18n'
import { btn, card, colors } from '../ui'
import { Hint, Term } from '../help/HelpParts'
import ExpenseForm from '../expenses/ExpenseForm'

const money = (v, lang) => formatMoney(Number(v) || 0, 'EUR', lang)
const otherList = (byCurrency, lang) => Object.entries(byCurrency || {}).map(([c, v]) => formatMoney(v, c, lang)).join(' · ')

// The gig's finance panel (step 10) on its Overview, for those who see money (admins and members,
// D23): revenue, costs and margin from public.gig_finance, counted in the database. Estimated
// parts say so in words. The gig's managers can save its rate-card labour as agreed fees once it
// is completed, so a later rate change doesn't change its margin.
export default function GigFinancePanel({ gig, members, canManage }) {
  const { t, lang } = useI18n()
  const { notify } = useToast()
  const [row, setRow] = useState(null)
  const [failed, setFailed] = useState(false)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const completed = gig.status === 'completed'
  const rateCard = useRateCard(completed && canManage ? gig.org_id : null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('gig_finance', { p_org: gig.org_id, p_from: null, p_until: null, p_gig: gig.id })
    if (error) { logger.error('gig-finance', error, { step: 'load', gig: gig.id }); setFailed(true); return }
    setFailed(false)
    setRow(data?.[0] || null)
  }, [gig.org_id, gig.id])
  useEffect(() => { load() }, [load, gig.status])

  const saveFees = async () => {
    setSaving(true)
    const { data: fees, error: e1 } = await supabase.from('gig_crew_fees').select('user_id, rate').eq('gig_id', gig.id)
    const rows = e1 ? [] : cardFees({ gig, members, rates: rateCard.rates, factors: rateCard.factors, fees })
    const { error } = e1 ? { error: e1 } : rows.length ? await supabase.from('gig_crew_fees').insert(rows) : { error: null }
    setSaving(false)
    if (error) { logger.error('gig-finance', error, { step: 'save-fees', gig: gig.id }); notify(userMessage(error)); return }
    track('gig-finance:save-fees')
    notify(t('finance.feesSaved', { count: rows.length }))
    load()
  }

  const heading = (
    <h3 id="finance-title" style={{ fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
      <Wallet size={15} color="var(--accent-text)" aria-hidden="true" /> {t('finance.title')} <Hint id="gig-finance" label={t('finance.title')} />
    </h3>
  )
  if (failed) return (
    <section aria-labelledby="finance-title" style={{ ...card, padding: '14px 16px', marginTop: '16px' }}>
      {heading}<p role="alert" style={{ color: colors.danger, fontSize: '13px', marginTop: '6px' }}>{t('finance.loadFailed')}</p>
    </section>
  )
  if (!row) return (
    <section aria-labelledby="finance-title" style={{ ...card, padding: '14px 16px', marginTop: '16px' }}>
      {heading}<Loader2 size={18} color={colors.accentText} style={{ animation: 'spin 1s linear infinite', marginTop: '8px' }} aria-label={t('common.loading')} />
    </section>
  )

  const estimate = isEstimate(row)
  const noQuote = row.revenue_source === 'none'
  const negative = Number(row.margin) < 0
  const small = { display: 'block', fontSize: '12px', fontWeight: 400, color: colors.muted }
  const amount = { margin: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
  const line = (label, value, sub) => (
    <><dt>{label}{sub && <span style={small}>{sub}</span>}</dt><dd style={amount}>{money(value, lang)}</dd></>
  )
  const labourSub = [
    row.labour_actual != null ? t('finance.labourPlannedActual', { planned: money(row.labour_planned, lang), actual: money(row.labour_actual, lang) }) : null,
    Number(row.labour_estimated) > 0 ? t('finance.fromCard', { amount: money(row.labour_estimated, lang) }) : null,
    row.people_missing > 0 ? t('finance.noRate', { count: row.people_missing }) : null,
  ].filter(Boolean).join(' · ')
  const showSave = completed && canManage && Number(row.labour_estimated) > 0

  return (
    <section aria-labelledby="finance-title" style={{ ...card, padding: '14px 16px', marginTop: '16px' }}>
      {heading}
      <p style={{ fontSize: '12px', color: colors.muted, lineHeight: 1.5, margin: '4px 0 10px' }}>{t('finance.intro')}</p>
      <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '6px 12px', fontSize: '14px', margin: 0 }}>
        <dt style={{ fontWeight: 600 }}>
          <Term id="net-revenue">{t('finance.revenue')}</Term>
          <span style={small}>
            {noQuote ? t('finance.noQuote') : row.revenue_source === 'estimate' ? t('finance.revenueEstimate') : t('finance.quotesAccepted', { count: row.quotes })}
          </span>
        </dt>
        <dd style={{ ...amount, fontWeight: 600 }}>{money(row.revenue, lang)}</dd>
        {line(t('finance.labour'), row.labour, labourSub)}
        {line(t('finance.subrentals'), row.subrentals)}
        {line(t('finance.repairs'), row.repairs, Number(row.repairs_charged) > 0 ? t('finance.repairsCharged', { amount: money(row.repairs_charged, lang) }) : null)}
        {line(t('finance.otherCosts'), row.other_costs, t('finance.otherCostsSub'))}
        <dt style={{ fontWeight: 600, paddingTop: '6px', borderTop: `1px solid ${colors.border}` }}>{t('finance.cost')}</dt>
        <dd style={{ ...amount, fontWeight: 600, paddingTop: '6px', borderTop: `1px solid ${colors.border}` }}>{money(row.cost, lang)}</dd>
        <dt style={{ fontWeight: 700 }}>
          {t('finance.margin')}
          {estimate && <span style={{ ...small, color: 'var(--warn)' }}>{t('finance.estimateNote')}</span>}
        </dt>
        <dd style={{ ...amount, fontWeight: 700, color: noQuote ? 'var(--text)' : negative ? colors.danger : colors.accentText }}>
          {money(row.margin, lang)}
          {row.margin_pct != null && ` (${t('finance.pct', { pct: Number(row.margin_pct).toLocaleString(lang === 'pt' ? 'pt-PT' : 'en-GB') })})`}
        </dd>
      </dl>
      {row.other_currencies && (
        <p style={{ fontSize: '12px', color: colors.muted, marginTop: '8px', lineHeight: 1.5 }}>
          {row.other_currencies.revenue && t('finance.otherRevenue', { list: otherList(row.other_currencies.revenue, lang) })}
          {row.other_currencies.revenue && row.other_currencies.costs && ' · '}
          {row.other_currencies.costs && t('finance.otherCurrencyCosts', { list: otherList(row.other_currencies.costs, lang) })}
        </p>
      )}
      {noQuote && <p style={{ fontSize: '12px', color: colors.muted, marginTop: '8px' }}>{t('finance.noQuoteBody')}</p>}
      {showSave && <p style={{ fontSize: '12px', color: colors.muted, marginTop: '8px', lineHeight: 1.5 }}>{t('finance.saveFeesWhy')}</p>}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px', alignItems: 'center' }}>
        <button type="button" onClick={() => setAdding(true)} style={btn}><Receipt size={14} aria-hidden="true" /> {t('finance.addExpense')}</button>
        {showSave && (
          <button type="button" onClick={saveFees} disabled={saving || !rateCard.loaded} style={btn}>
            {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />} {t('finance.saveFees')}
          </button>
        )}
        <Link to={`/org/${gig.org_id}/reports?tab=margins`} style={{ fontSize: '13px', color: colors.accentText }}>{t('finance.allGigs')}</Link>
      </div>
      {adding && (
        <ExpenseForm orgId={gig.org_id} onClose={() => setAdding(false)} onSaved={load}
          preset={{ gig_id: gig.id, gigs: [{ id: gig.id, name: gig.name, start_date: gig.start_date }] }} />
      )}
    </section>
  )
}
