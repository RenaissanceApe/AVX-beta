import { useGigSteps } from '../../lib/useSteps'
import { stepTotals } from '../../lib/inventory'
import { t } from '../../i18n'
import { colors } from '../ui'
import { stepHue } from '../dispatch/ScanParts'

// Where a gig's equipment is (docs/HELP.md, H5b): one bar per step the organisation uses,
// "32 of 40 loaded". Shown once anything has been scanned.
export default function StepBars({ gig }) {
  const { steps, lines, counts, loaded } = useGigSteps(gig.id, gig.org_id ?? null)
  if (!loaded || !Object.keys(counts).length) return null
  const planned = lines.filter(l => l.planned > 0)
  return (
    <section aria-labelledby="step-bars" style={{ marginBottom: '14px' }}>
      <h3 id="step-bars" className="sr-only">{t('steps.title')}</h3>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px 14px' }}>
        {steps.map(step => {
          const { done, total } = stepTotals(['prepped', 'loaded', 'on_site'].includes(step) ? planned : lines, counts, step)
          const full = total > 0 && done >= total
          return (
            <li key={step} style={{ fontSize: '12px' }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: '6px', marginBottom: '3px', color: full ? 'var(--text)' : colors.soft }}>
                <span style={{ fontWeight: 700 }}>{t(`steps.name.${step}`)}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{t('steps.of', { done, total })}</span>
              </span>
              <span aria-hidden="true" style={{ display: 'block', height: '6px', borderRadius: '3px', background: 'color-mix(in srgb, var(--fg) min(100%, calc(8% * var(--line-k))), transparent)', overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', background: stepHue(step), width: `${Math.min(100, (100 * done) / Math.max(1, total))}%` }} />
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
