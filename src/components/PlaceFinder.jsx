import { useState } from 'react'
import { Loader2, Search, MapPin } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/ToastContext'
import { logger } from '../lib/logger'
import { useI18n } from '../i18n'
import { btn, input, label as labelStyle, colors } from './ui'

const hint = { fontSize: '12px', color: colors.muted, lineHeight: 1.5 }

// Type a town, tap Find, pick one (docs/CREW_NETWORK.md): asks the geocode Edge Function (LocationIQ),
// which returns towns with coordinates rounded to about 1 km. Used by the crew profile and crew search.
//   <PlaceFinder id label hint initialQuery onChoose={place => …} />
export default function PlaceFinder({ id, label, hint: hintText, initialQuery = '', onChoose }) {
  const { t, lang } = useI18n()
  const { notify } = useToast()
  const [query, setQuery] = useState(initialQuery)
  const [places, setPlaces] = useState(null)
  const [finding, setFinding] = useState(false)

  async function find(e) {
    e?.preventDefault()
    if (query.trim().length < 2) return
    setFinding(true)
    const { data, error } = await supabase.functions.invoke('geocode', { body: { q: query.trim(), lang } })
    setFinding(false)
    if (error) { logger.error('place', error, { step: 'geocode' }); return notify(t('crewProfile.placeFailed'), 'error') }
    setPlaces(data?.places || [])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div>
        <label style={labelStyle} htmlFor={id}>{label}</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input id={id} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') find(e) }}
            placeholder={t('crewProfile.basePlaceholder')} style={{ ...input, flex: 1, minWidth: 0 }} />
          <button type="button" onClick={find} disabled={finding || query.trim().length < 2} style={btn}>
            {finding ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={14} />} {t('crewProfile.find')}
          </button>
        </div>
        {hintText && <p style={{ ...hint, marginTop: '6px' }}>{hintText}</p>}
        {/* LocationIQ's free plan asks for this link wherever its search is used */}
        <p style={{ ...hint, marginTop: '4px' }}>
          <a href="https://locationiq.com/?ref=link-back" target="_blank" rel="noopener noreferrer" style={{ color: colors.muted }}>{t('crewProfile.placeCredit')}</a>
        </p>
      </div>
      {places && (
        places.length ? (
          <ul aria-label={t('crewProfile.places')} style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {places.map(p => (
              <li key={p.label}>
                <button type="button" onClick={() => { onChoose(p); setPlaces(null); setQuery('') }} style={{ ...btn, width: '100%', justifyContent: 'flex-start', textAlign: 'left' }}>
                  <MapPin size={14} /> {p.label}
                </button>
              </li>
            ))}
          </ul>
        ) : <p role="status" style={hint}>{t('crewProfile.noPlaces')}</p>
      )}
    </div>
  )
}
