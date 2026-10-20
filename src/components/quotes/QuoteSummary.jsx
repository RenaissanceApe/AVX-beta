import { useI18n } from '../../i18n'
import { colors } from '../ui'
import { PRICED_KINDS, formatMoney } from '../../lib/quotes'

// Financial overview: every phase, the split by kind, and the totals.
export default function QuoteSummary({ quote, body, totals, onOpenPhase }) {
  const { t, fmt, lang } = useI18n()
  const money = v => formatMoney(v, quote.currency, lang)
  const range = p => [p.start_date, p.end_date].filter(Boolean).map(d => fmt(d, 'd MMM')).join(' – ')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', animation: 'fadeIn 0.2s ease' }}>
      <section>
        <h3 style={h3}>{t('quote.phases')}</h3>
        {body.phases.length === 0 && <p style={{ color: colors.muted, fontSize: '13px' }}>{t('quote.noPhases')}</p>}
        {body.phases.map((p, i) => {
          const pt = totals.phases[i]
          return (
            <button key={p.id} onClick={() => onOpenPhase(i)} style={row}>
              <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <span style={{ fontWeight: 600 }}>{p.name || t('quote.phaseN', { n: i + 1 })}</span>
                {p.optional && <span style={optionalTag}>{t('quote.optional')}</span>}
                <span style={{ display: 'block', fontSize: '12px', color: colors.muted }}>{range(p) || t('quote.noDates')}</span>
              </span>
              {pt.discount > 0 && <span style={{ fontSize: '12px', color: colors.muted }}>−{money(pt.discount)}</span>}
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

      <section style={{ borderTop: `1px solid ${colors.border}`, paddingTop: '12px', fontSize: '14px' }}>
        <Line label={t('quote.subtotal')} value={money(totals.subtotal)} />
        {totals.discount > 0 && <Line label={t('quote.discountOf', { pct: quote.discount_pct })} value={`−${money(totals.discount)}`} />}
        <Line label={t('quote.totalExVat')} value={money(totals.net)} strong />
        <Line label={t('quote.vatOf', { pct: quote.vat_rate })} value={money(totals.vat)} />
        <Line label={t('quote.totalIncVat')} value={money(totals.total)} strong accent />
        {totals.optional > 0 && <Line label={t('quote.optionsNotIncluded')} value={money(totals.optional)} muted />}
      </section>
    </div>
  )
}

function Line({ label, value, strong, accent, muted }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontWeight: strong ? 700 : 400,
      color: accent ? colors.accentText : muted ? colors.muted : 'var(--text)', fontSize: accent ? '16px' : undefined }}>
      <span>{label}</span><span>{value}</span>
    </div>
  )
}

const h3 = { fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: colors.muted, marginBottom: '8px' }
const row = {
  display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '10px 12px', marginBottom: '6px', borderRadius: '10px',
  background: 'color-mix(in srgb, var(--fg) min(100%, calc(3% * var(--line-k))), transparent)', border: `1px solid ${colors.border}`, color: 'var(--text)', fontSize: '14px', cursor: 'pointer',
}
const optionalTag = { marginLeft: '8px', fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '6px', background: 'color-mix(in srgb, var(--warn) 15%, transparent)', color: 'var(--warn)', textTransform: 'uppercase' }
