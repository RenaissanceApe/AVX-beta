import { Link } from 'react-router-dom'
import { Plug } from 'lucide-react'
import { fixtureShare, PHASES } from '../../lib/power'
import { t } from '../../i18n'
import { btn, card, colors, StatusBadge } from '../ui'
import { wattsText, STATE_TONE } from './PowerTool'

// The light plot's power section once the gig has a power plan (P1): the fixtures' current per
// phase where they're plugged in, against the plan's supply, with a link to the plan.
export default function PowerFromPlan({ gig, power, fixtures }) {
  const s = fixtureShare(power, fixtures)
  return (
    <section aria-labelledby="light-power" style={card}>
      <h3 id="light-power" style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>{t('light.powerTitle')}</h3>
      <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5, marginBottom: '8px' }}>{t('power.lightFromPlan')}</p>
      <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
        {s.amps.map((a, i) => (
          <li key={i} style={{ fontSize: '13px', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
            <strong>{s.supply.phases === 1 ? t('power.single') : PHASES[i]}</strong>
            <span>{t('power.ampsOf', { a, max: s.supply.amps, pct: Math.round((a / s.supply.amps) * 100) })}</span>
          </li>
        ))}
      </ul>
      <p style={{ fontSize: '13px', lineHeight: 1.5 }}>
        {t('power.lightTotal', { watts: wattsText(s.watts), count: s.count })}
        {s.state !== 'ok' && <> <StatusBadge small tone={STATE_TONE[s.state]}>{t(`power.state.${s.state}`)}</StatusBadge></>}
      </p>
      {s.unplugged > 0 && <p style={{ fontSize: '13px', color: 'var(--warn)', marginTop: '4px' }}>{t('power.lightUnplugged', { count: s.unplugged })}</p>}
      {s.unknown > 0 && <p style={{ fontSize: '13px', color: 'var(--warn)', marginTop: '4px' }}>{t('light.unknownPower', { count: s.unknown })}</p>}
      <Link to={`/gig/${gig.id}?tab=tools&tool=power`} style={{ ...btn, textDecoration: 'none', marginTop: '12px' }}><Plug size={14} aria-hidden="true" /> {t('power.openPlan')}</Link>
    </section>
  )
}
