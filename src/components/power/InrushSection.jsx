import { placeLabel } from '../../lib/powerPdf'
import { INRUSH_B, INRUSH_C } from '../../lib/powerBalance'
import { t } from '../../i18n'
import { card, colors, StatusBadge } from '../ui'
import { Hint } from '../help/HelpParts'

const small = { fontSize: '13px', color: colors.muted, lineHeight: 1.5 }
const TONE = { ok: 'ok', near: 'warn', over: 'danger' }

// Inrush groups (P2): the loads on each output power on together when its breaker closes; their
// datasheet inrush peaks are added up and compared with the breaker (3 × may trip a B-curve
// breaker, 5 × a C-curve one). Estimates for a qualified electrician.
export default function InrushSection({ p }) {
  const { inrush, distros, supply } = p
  const groups = inrush.filter(g => g.inrush > 0 || g.missing > 0)
  if (!groups.length) return null
  return (
    <section aria-labelledby="power-inrush" style={{ ...card, display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <h3 id="power-inrush" style={{ fontSize: '16px', fontWeight: 700 }}>{t('inrush.title')}</h3>
        <Hint id="power-inrush" label={t('inrush.title')} />
      </div>
      <p style={small}>{t('inrush.note', { b: INRUSH_B, c: INRUSH_C })}</p>
      <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {groups.map(g => (
          <li key={g.key} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid var(--line)', paddingTop: '8px' }}>
            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
              <strong style={{ display: 'block', fontSize: '14px' }}>{placeLabel(g.phase ? { phase: g.phase } : { distro: g.distro, output: g.output }, distros, supply, t)}</strong>
              <span style={small}>
                {[t('inrush.sum', { a: g.inrush, count: g.count }), g.rating ? t('inrush.ratio', { x: g.ratio, breaker: g.rating }) : '', g.missing ? t('inrush.missing', { count: g.missing }) : ''].filter(Boolean).join(' · ')}
              </span>
            </div>
            <StatusBadge small tone={TONE[g.state]}>{t(`inrush.state.${g.state}`)}</StatusBadge>
          </li>
        ))}
      </ul>
    </section>
  )
}
