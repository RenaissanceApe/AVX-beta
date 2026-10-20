import { useEffect, useState } from 'react'
import { Search, Users, X, AlertTriangle, Check, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { useI18n, t } from '../i18n'
import { input, colors } from './ui'

const AMBER = 'var(--warn)'

// "Your network" (ROADMAP Phase 5c): people you've already shared a gig or organisation with,
// for a gig you manage (gigId) or an organisation you administer (orgId). Shows the functions
// they had on gigs with you, and for a gig whether they're booked elsewhere on its dates.
// Nobody else is listed, and emails are never shown: picking someone adds them by account.
export function NetworkPicker({ gigId, orgId, onPick, hint }) {
  const { fmt } = useI18n()
  const [query, setQuery] = useState('')
  const [people, setPeople] = useState(null)

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      supabase.rpc('network_search', { p_query: query.trim(), p_gig: gigId || null, p_org: gigId ? null : orgId })
        .then(({ data, error }) => {
          if (cancelled) return
          if (error) logger.warn('network', 'Search failed', { code: error.code })
          setPeople(data || [])
        })
    }, query ? 250 : 0)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [query, gigId, orgId])

  if (people && !people.length && !query) return null
  return (
    <div style={{ border: `1px solid ${colors.border}`, borderRadius: '10px', padding: '10px', background: 'color-mix(in srgb, var(--fg) min(100%, calc(2% * var(--line-k))), transparent)' }}>
      <div style={{ fontSize: '12px', fontWeight: 700, color: colors.soft, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
        <Users size={13} /> {t('network.title')}
      </div>
      <div style={{ position: 'relative', marginBottom: '6px' }}>
        <Search size={14} color={colors.muted} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('network.search')} aria-label={t('network.search')}
          style={{ ...input, paddingLeft: '30px', padding: '8px 10px 8px 30px' }} />
      </div>
      {!people ? <Loader2 size={16} color={colors.accentText} style={{ animation: 'spin 1s linear infinite' }} /> : people.length === 0 ? (
        <p style={{ fontSize: '12px', color: colors.muted, padding: '4px 2px' }}>{t('network.none')}</p>
      ) : (
        <div style={{ maxHeight: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {people.map(p => (
            <button key={p.user_id} type="button" onClick={() => onPick(p)} disabled={p.already} style={{
              display: 'flex', gap: '10px', alignItems: 'center', padding: '7px 8px', borderRadius: '8px', border: 'none', textAlign: 'left',
              background: 'transparent', color: 'var(--text)', font: 'inherit', cursor: p.already ? 'default' : 'pointer', width: '100%',
            }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: '14px', fontWeight: 600 }}>{p.full_name || t('common.someone')}</span>
                <span style={{ fontSize: '12px', color: colors.muted }}>
                  {[p.functions?.length && p.functions.join(', '),
                    p.gigs_together ? t('network.together', { count: p.gigs_together, last: p.last_together ? fmt(p.last_together, 'MMM yyyy') : '—' }) : t('network.sameOrg'),
                  ].filter(Boolean).join(' · ')}
                </span>
              </span>
              {p.already
                ? <span style={{ fontSize: '11px', color: colors.accentText, display: 'flex', alignItems: 'center', gap: '3px', whiteSpace: 'nowrap' }}><Check size={12} /> {t('network.already')}</span>
                : p.busy && <span style={{ fontSize: '11px', color: AMBER, display: 'flex', alignItems: 'center', gap: '3px', whiteSpace: 'nowrap' }}><AlertTriangle size={12} /> {t('network.busy')}</span>}
            </button>
          ))}
        </div>
      )}
      <p style={{ fontSize: '11px', color: colors.muted, marginTop: '6px', lineHeight: 1.5 }}>{hint || t('network.hint')}</p>
    </div>
  )
}

// The person picked, instead of an email field
export function PickedPerson({ person, onClear }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', borderRadius: '10px', background: 'color-mix(in srgb, var(--accent) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)' }}>
      <Users size={14} color={colors.accentText} />
      <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: '14px' }}>{person.full_name || t('common.someone')}</span>
      {person.busy && <span style={{ fontSize: '12px', color: AMBER, display: 'flex', alignItems: 'center', gap: '4px' }}><AlertTriangle size={12} /> {t('network.busy')}</span>}
      <button type="button" onClick={onClear} aria-label={t('network.clear')} title={t('network.clear')} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', display: 'flex' }}><X size={15} /></button>
    </div>
  )
}

// Adds someone picked from the network: { result: 'added' | 'already_member' }
export async function addFromNetwork({ kind, targetId, userId, role, functionTitle, callTime }) {
  const { data, error } = await supabase.rpc('add_from_network', {
    p_kind: kind, p_target: targetId, p_user: userId, p_role: role || null,
    p_function_title: functionTitle || null, p_call_time: callTime || null,
  })
  if (error) throw error
  return data
}
