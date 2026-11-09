import { useI18n } from '../../i18n'
import { colors, StatusBadge, space } from '../ui'
import { PRICED_KINDS, formatMoney } from '../../lib/quotes'
import { quoteCrewMargin } from '../../lib/crewRates'
import { Hint } from '../help/HelpParts'

// Financial overview: every phase, the split by kind, and the totals.
export default function QuoteSummary({ quote, body, totals, rates = [], onOpenPhase }) {
  const { t, fmt, lang } = useI18n()
  const money = v => formatMoney(v, quote.currency, lang)
  // Crew lines against the rate card (rates are in euros; only the organisation can read them)
  const crew = quote.currency === 'EUR' && rates.length ? quoteCrewMargin(body, rates) : null
  const range = p => [p.start_date, p.end_date].filter(Boolean).map(d => fmt(d, 'd MMM')).join(' – ')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space.section, animation: 'fadeIn 0.2s ease' }}>
      <section>
        <h3 style={h3}>{t('quote.phases')}</h3>
        {body.phases.length === 0 && <p style={{ color: colors.muted, fontSize: '13px' }}>{t('quote.noPhases')}</p>}
        {body.phases.map((p, i) => {
          const pt = totals.phases[i]
          return (
            <button key={p.id} onClick={() => onOpenPhase(i)} style={row}>
              <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <span style={{ fontWeight: 600 }}>{p.name || t('quote.phaseN', { n: i + 1 })}</span>
                {p.optional && <span style={{ marginLeft: space[2] }}><StatusBadge small tone="draft">{t('quote.optional')}</StatusBadge></span>}
                <span style={{ display: 'block', fontSize: '13px', color: colors.muted }}>{range(p) || t('quote.noDates')}</span>
              </span>
              {pt.discount > 0 && <span style={{ fontSize: '13px', color: colors.muted }}>−{money(pt.discount)}</span>}
              <span style={{ fontWeight: 700, color: p.optional ? colors.muted : 'var(--text)' }}>{money(pt.net)}</span>
            </button>
          )
        })}
      </section>

      <section>
        <h3 style={h3}>{t('quote.byKind')}</h3>
        {PRICED_KINDS.filter(k => totals.byKind[k]).map(k => (
          <div key={k} style={{ ...row, cursor: 'default' }}>
            <span style={{ flex: 1 }}>{t(`lineKind.${k}`)}</span>
            <span>{money(totals.byKind[k])}</span>
          </div>
        ))}
        {!PRICED_KINDS.some(k => totals.byKind[k]) && <p style={{ color: colors.muted, fontSize: '13px' }}>—</p>}
      </section>

      {crew?.lines > 0 && (
        <section aria-labelledby="crew-margin-title">
          <h3 id="crew-margin-title" style={{ ...h3, display: 'flex', alignItems: 'center', gap: space[1] }}>{t('quote.crewMargin')} <Hint id="quote-crew-margin" label={t('quote.crewMargin')} /></h3>
          <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5, marginBottom: space[2] }}>{t('quote.crewMarginHint')}</p>
          <div style={{ fontSize: '14px' }}>
            <Line label={t('quote.crewMarginPrice')} value={money(crew.price)} />
            <Line label={t('quote.crewMarginCost')} value={money(crew.cost)} />
            <Line label={t('quote.crewMarginValue')} value={`${money(crew.margin)}${crew.marginPct != null ? ` (${crew.marginPct}%)` : ''}`} strong danger={crew.margin < 0} />
          </div>
          {crew.missing > 0 && <p style={{ fontSize: '13px', color: 'var(--warn)', marginTop: space[1] }}>{t('quote.crewMarginMissing', { count: crew.missing })}</p>}
        </section>
      )}

      <section style={{ borderTop: `1px solid ${colors.border}`, paddingTop: space[3], fontSize: '14px' }}>
        <Line label={t('quote.subtotal')} value={money(totals.subtotal)} />
        {totals.discount > 0 && <Line label={t('quote.discountOf', { pct: quote.discount_pct })} value={`−${money(totals.discount)}`} />}
        <Line label={t('quote.totalExVat')} value={money(totals.net)} strong />
        {(totals.vatByRate.length ? totals.vatByRate : [{ rate: Number(quote.vat_rate) || 0, base: 0, vat: 0 }]).map(r => (
          <Line key={r.rate} label={totals.vatByRate.length > 1 ? t('quote.vatOfBase', { pct: r.rate, base: money(r.base) }) : t('quote.vatOf', { pct: r.rate })} value={money(r.vat)} />
        ))}
        {totals.missingExemption && <p style={{ fontSize: '13px', color: 'var(--warn)', margin: '2px 0 6px' }}>{t('quote.vatExemptionMissing')}</p>}
        <Line label={t('quote.totalIncVat')} value={money(totals.total)} strong accent />
        {totals.optional > 0 && <Line label={t('quote.optionsNotIncluded')} value={money(totals.optional)} muted />}
      </section>
    </div>
  )
}

function Line({ label, value, strong, accent, muted, danger }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontWeight: strong ? 700 : 400,
      color: danger ? colors.danger : accent ? colors.accentText : muted ? colors.muted : 'var(--text)', fontSize: accent ? '16px' : undefined }}>
      <span>{label}</span><span>{value}</span>
    </div>
  )
}

// Section heading (16px, DESIGN.md "Typography"); rows are hairline-separated, not boxed ("Room to breathe")
const h3 = { font: '700 16px/24px var(--font-mono)', color: 'var(--text)', margin: `0 0 ${space[3]}` }
const row = {
  display: 'flex', alignItems: 'center', gap: space[3], width: '100%', minHeight: '52px', padding: `${space[2]} 0`,
  background: 'transparent', border: 'none', borderBottom: `1px solid ${colors.border}`, color: 'var(--text)', fontSize: '14px', cursor: 'pointer',
}
