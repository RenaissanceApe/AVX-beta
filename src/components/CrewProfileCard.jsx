import { MapPin, Languages, Award, Link2, Briefcase } from 'lucide-react'
import { useI18n } from '../i18n'
import { languageName, isExpired } from '../lib/crewProfile'
import { card, colors, tint } from './ui'

const chip = { display: 'inline-block', padding: '3px 9px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, background: tint(colors.accent, 14), color: colors.accentText, margin: '0 6px 6px 0' }
const row = { display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px', color: colors.soft, lineHeight: 1.5, marginTop: '8px' }

// A crew profile as companies (or crew, if the person allows it) see it (docs/CREW_NETWORK.md).
// Used for the preview on the person's own profile page; the crew search (N2) shows the same.
export default function CrewProfileCard({ profile: p, name }) {
  const { t, lang, fmt } = useI18n()
  const travel = p.travel_scope === 'km' ? (p.travel_km ? t('crewProfile.reach.km', { km: p.travel_km }) : null) : t(`crewProfile.reach.${p.travel_scope}`)
  const date = d => fmt(d, 'd MMM yyyy')
  return (
    <div style={{ ...card, padding: '16px' }}>
      <div style={{ fontSize: '17px', fontWeight: 800, overflowWrap: 'anywhere' }}>{name || t('crewProfile.noName')}</div>
      {p.headline && <div style={{ fontSize: '14px', color: colors.soft, marginTop: '2px', overflowWrap: 'anywhere' }}>{p.headline}</div>}
      {(p.functions?.length > 0 || p.other_functions) && (
        <div style={{ marginTop: '10px' }}>
          {(p.functions || []).map(f => <span key={f} style={chip}>{t(`crewFn.${f}`)}</span>)}
          {p.other_functions && <span style={chip}>{p.other_functions}</span>}
        </div>
      )}
      {p.base_place && (
        <div style={row}><MapPin size={14} style={{ flexShrink: 0, marginTop: '3px' }} aria-hidden="true" />
          <span>{p.base_place}{travel && <> · {travel}</>}</span></div>
      )}
      {p.languages?.length > 0 && (
        <div style={row}><Languages size={14} style={{ flexShrink: 0, marginTop: '3px' }} aria-hidden="true" />
          <span>{p.languages.map(l => languageName(l, lang)).join(', ')}</span></div>
      )}
      {p.experience_years != null && (
        <div style={row}><Briefcase size={14} style={{ flexShrink: 0, marginTop: '3px' }} aria-hidden="true" />
          <span>{t('crewProfile.years', { count: p.experience_years })}</span></div>
      )}
      {p.certificates?.length > 0 && (
        <div style={row}><Award size={14} style={{ flexShrink: 0, marginTop: '3px' }} aria-hidden="true" />
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {p.certificates.map((c, i) => (
              <li key={i}>
                {c.name}{c.issuer && <> · {c.issuer}</>}
                {c.expires_on && <span style={{ color: isExpired(c) ? colors.danger : colors.muted }}> · {isExpired(c) ? t('crewProfile.expired', { date: date(c.expires_on) }) : t('crewProfile.validUntil', { date: date(c.expires_on) })}</span>}
                <span style={{ color: colors.muted }}> · {t('crewProfile.selfDeclared')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {p.bio && <p style={{ fontSize: '13px', color: colors.soft, lineHeight: 1.6, marginTop: '10px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{p.bio}</p>}
      {p.links?.length > 0 && (
        <div style={row}><Link2 size={14} style={{ flexShrink: 0, marginTop: '3px' }} aria-hidden="true" />
          <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {p.links.map(l => <a key={l} href={l} target="_blank" rel="noopener noreferrer nofollow" style={{ color: colors.accentText, overflowWrap: 'anywhere' }}>{l.replace(/^https?:\/\//, '')}</a>)}
          </span></div>
      )}
    </div>
  )
}
