import { MapPin, CalendarDays, Languages, Award, Building2, BadgeCheck, Banknote } from 'lucide-react'
import { useI18n } from '../../i18n'
import { languageName } from '../../lib/crewProfile'
import { payText } from '../../lib/jobs'
import { colors, space } from '../ui'

const row = { display: 'flex', alignItems: 'flex-start', gap: space[2], fontSize: '13px', color: colors.soft, lineHeight: 1.5, marginTop: space[1] }
const icon = { flexShrink: 0, marginTop: '3px' }

// One open position on the job board (docs/CREW_NETWORK.md, N3); children add the buttons.
// A list row with a hairline under it, not a card (DESIGN.md rule 2): put it in a <ul style={rowList}>.
export default function JobCard({ job: j, children }) {
  const { t, lang, fmt } = useI18n()
  const dates = j.ends_on && j.ends_on !== j.starts_on
    ? `${fmt(j.starts_on, 'd MMM')} – ${fmt(j.ends_on, 'd MMM yyyy')}` : fmt(j.starts_on, 'd MMM yyyy')
  return (
    <li style={{ padding: `${space[4]} 0`, borderBottom: `1px solid ${colors.line}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2], flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, overflowWrap: 'anywhere', margin: 0 }}>{j.title}</h3>
        {j.quantity > 1 && <span style={{ fontSize: '13px', color: colors.muted }}>× {j.quantity}</span>}
        {j.function_key && <span style={{ padding: `0 ${space[2]}`, fontSize: '13px', border: `1px solid ${colors.line}`, color: colors.text2 }}>{t(`crewFn.${j.function_key}`)}</span>}
      </div>
      {j.org_name && (
        <div style={row}><Building2 size={14} style={icon} aria-hidden="true" />
          <span>{j.org_name}{j.verified && <span style={{ display: 'inline-flex', alignItems: 'center', gap: space[1], marginLeft: space[2], color: 'var(--sky)', fontWeight: 600 }}><BadgeCheck size={14} aria-hidden="true" /> {t('jobs.verified')}</span>}
            {j.verified && j.verified_name && j.verified_name !== j.org_name && <span style={{ display: 'block', fontSize: '13px', color: colors.muted }}>{t('trust.verify.registeredAs', { name: j.verified_name })}</span>}</span></div>
      )}
      <div style={row}><CalendarDays size={14} style={icon} aria-hidden="true" /><span>{dates}</span></div>
      {j.place && <div style={row}><MapPin size={14} style={icon} aria-hidden="true" /><span>{j.place}{j.km != null && <> · {t('crewSearch.kmAway', { km: j.km })}</>}</span></div>}
      <div style={row}><Banknote size={14} style={icon} aria-hidden="true" /><span>{payText(j, t, lang)}</span></div>
      {j.languages?.length > 0 && <div style={row}><Languages size={14} style={icon} aria-hidden="true" /><span>{j.languages.map(l => languageName(l, lang)).join(', ')}</span></div>}
      {j.certificate && <div style={row}><Award size={14} style={icon} aria-hidden="true" /><span>{t('jobs.needs', { certificate: j.certificate })}</span></div>}
      {j.description && <p style={{ fontSize: '13px', color: colors.soft, lineHeight: 1.6, margin: `${space[3]} 0 0`, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{j.description}</p>}
      {children}
    </li>
  )
}
