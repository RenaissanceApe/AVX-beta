import { MapPin, CalendarDays, Languages, Award, Building2, BadgeCheck, Banknote } from 'lucide-react'
import { useI18n } from '../../i18n'
import { languageName } from '../../lib/crewProfile'
import { payText } from '../../lib/jobs'
import { card, colors, tint } from '../ui'

const row = { display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px', color: colors.soft, lineHeight: 1.5, marginTop: '6px' }
const icon = { flexShrink: 0, marginTop: '3px' }

// One open position on the job board (docs/CREW_NETWORK.md, N3); children add the buttons
export default function JobCard({ job: j, children }) {
  const { t, lang, fmt } = useI18n()
  const dates = j.ends_on && j.ends_on !== j.starts_on
    ? `${fmt(j.starts_on, 'd MMM')} – ${fmt(j.ends_on, 'd MMM yyyy')}` : fmt(j.starts_on, 'd MMM yyyy')
  return (
    <div style={{ ...card, padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: '17px', fontWeight: 800, overflowWrap: 'anywhere' }}>{j.title}</h3>
        {j.quantity > 1 && <span style={{ fontSize: '13px', color: colors.muted }}>× {j.quantity}</span>}
        {j.function_key && <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, background: tint(colors.accent, 14), color: colors.accentText }}>{t(`crewFn.${j.function_key}`)}</span>}
      </div>
      {j.org_name && (
        <div style={row}><Building2 size={14} style={icon} aria-hidden="true" />
          <span>{j.org_name}{j.verified && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', marginLeft: '6px', color: 'var(--sky)', fontWeight: 600 }}><BadgeCheck size={13} aria-hidden="true" /> {t('jobs.verified')}</span>}</span></div>
      )}
      <div style={row}><CalendarDays size={14} style={icon} aria-hidden="true" /><span>{dates}</span></div>
      {j.place && <div style={row}><MapPin size={14} style={icon} aria-hidden="true" /><span>{j.place}{j.km != null && <> · {t('crewSearch.kmAway', { km: j.km })}</>}</span></div>}
      <div style={row}><Banknote size={14} style={icon} aria-hidden="true" /><span>{payText(j, t, lang)}</span></div>
      {j.languages?.length > 0 && <div style={row}><Languages size={14} style={icon} aria-hidden="true" /><span>{j.languages.map(l => languageName(l, lang)).join(', ')}</span></div>}
      {j.certificate && <div style={row}><Award size={14} style={icon} aria-hidden="true" /><span>{t('jobs.needs', { certificate: j.certificate })}</span></div>}
      {j.description && <p style={{ fontSize: '13px', color: colors.soft, lineHeight: 1.6, marginTop: '10px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{j.description}</p>}
      {children}
    </div>
  )
}
