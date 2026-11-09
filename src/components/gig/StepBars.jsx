import { useGigSteps } from '../../lib/useSteps'
import { stepTotals } from '../../lib/inventory'
import { t } from '../../i18n'
import { colors } from '../ui'

// Where a gig's equipment is (docs/HELP.md, H5b): one bar per step the organisation uses,
// "32 of 40 loaded". Shown once anything has been scanned.
export default function StepBars({ gig }) {
  const { steps, lines, counts, loaded } = useGigSteps(gig.id, gig.org_id ?? null)
  if (!loaded || !Object.keys(counts).length) return null
  const planned = lines.filter(l => l.planned > 0)
  return (
    <section aria-labelledby="step-bars" style={{ marginBottom: 'var(--space-5)' }}>
      <h3 id="step-bars" className="sr-only">{t('steps.title')}</h3>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px 16px' }}>
        {steps.map(step => {
          const { done, total } = stepTotals(['prepped', 'loaded', 'on_site'].includes(step) ? planned : lines, counts, step)
          const full = total > 0 && done >= total
          return (
            <li key={step} style={{ fontSize: '13px' }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '3px', color: full ? 'var(--text)' : colors.soft }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{t(`steps.name.${step}`)}</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}><span aria-hidden="true">{done} / {total}</span><span className="sr-only">{t('steps.of', { done, total })}</span></span>
              </span>
              <Segments done={done} total={total} />
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// One square segment per thing up to 24, then a continuous bar (DESIGN.md "StepBar"): accent-text done, line not yet
export function Segments({ done, total }) {
  const on = Math.min(done, total)
  if (total > 0 && total <= 24) {
    return (
      <span aria-hidden="true" style={{ display: 'flex', gap: '4px' }}>
        {Array.from({ length: total }, (_, i) => <span key={i} style={{ flex: 1, height: '6px', background: i < on ? 'var(--accent-text)' : 'var(--line-strong)' }} />)}
      </span>
    )
  }
  return (
    <span aria-hidden="true" style={{ display: 'block', height: '6px', background: 'var(--line-strong)' }}>
      <span style={{ display: 'block', height: '100%', background: 'var(--accent-text)', width: `${Math.min(100, (100 * on) / Math.max(1, total))}%` }} />
    </span>
  )
}
