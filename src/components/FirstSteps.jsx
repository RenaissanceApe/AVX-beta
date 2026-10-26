import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, Circle, ChevronRight, X, Rocket } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { pushSupport, currentSubscription } from '../lib/push'
import { track } from '../lib/usage'
import { guide as guideText } from '../help'
import { useI18n } from '../i18n'
import { card, colors, tint } from './ui'

// First steps (docs/HELP.md, H4): a short checklist on the home page until it's done, so a new
// admin or crew member knows what to do first. Each step ticks itself when it's done, links to
// where it's done and to its guide. "Hide" puts it away for good on this device.
//   admin of an organisation: company details, catalogue, invite people, first gig
//   crew (My work):            name and phone, AVX on the phone, notifications

const isInstalled = () => typeof window !== 'undefined'
  && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true)

async function pushIsOn() {
  if (pushSupport() !== 'ok') return false
  const timeout = new Promise(resolve => setTimeout(() => resolve(null), 1500))
  const sub = await Promise.race([currentSubscription().catch(() => null), timeout])
  return !!sub && Notification.permission === 'granted'
}

const hideKey = (userId, scope) => `avx.firstSteps.${userId}.${scope}`

export default function FirstSteps({ mode, org, gigCount }) {
  const { t } = useI18n()
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const scope = mode === 'org' ? org?.id : 'me'
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(hideKey(user?.id, scope)) === '1' } catch { return false } })
  const [facts, setFacts] = useState(null)

  useEffect(() => {
    if (hidden || !user) return
    let cancelled = false
    async function check() {
      if (mode === 'org') {
        const [items, members, invites] = await Promise.all([
          supabase.from('price_items').select('id', { count: 'exact', head: true }).eq('org_id', org.id).neq('tracking', 'none'),
          supabase.from('org_members').select('user_id', { count: 'exact', head: true }).eq('org_id', org.id),
          supabase.from('org_invites').select('id', { count: 'exact', head: true }).eq('org_id', org.id),
        ])
        return { catalogue: (items.count || 0) > 0, people: (members.count || 0) > 1 || (invites.count || 0) > 0 }
      }
      return { push: await pushIsOn() }
    }
    check().then(f => { if (!cancelled) setFacts(f) }).catch(() => { if (!cancelled) setFacts({}) })
    return () => { cancelled = true }
  }, [hidden, user, mode, org?.id])

  if (hidden || !facts || !user) return null

  const steps = mode === 'org' ? [
    { id: 'company', done: !!(org.legal_name || org.tax_id), to: `/org/${org.id}/quotes?company=1`, guide: 'of-company' },
    { id: 'catalogue', done: facts.catalogue, to: `/org/${org.id}/inventory`, guide: 'wh-import' },
    { id: 'people', done: facts.people, to: `/org/${org.id}?panel=members`, guide: 'ad-members' },
    { id: 'gig', done: gigCount > 0, to: `/org/${org.id}?new=gig`, guide: 'pm-create-gig' },
  ] : [
    { id: 'profile', done: !!(profile?.full_name && profile?.phone), to: '/settings/profile', guide: 'crew-join' },
    { id: 'install', done: isInstalled(), guide: 'crew-install' },
    // Where this device can't show notifications, the daily email summary counts instead
    { id: 'notify', done: facts.push || (pushSupport() !== 'ok' && profile?.email_digest !== false), to: '/settings/notifications', guide: 'crew-install' },
  ]
  const left = steps.filter(s => !s.done).length
  if (left === 0) return null

  const hide = () => {
    try { localStorage.setItem(hideKey(user.id, scope), '1') } catch { /* this visit only */ }
    setHidden(true)
    track('firstSteps:hide')
  }
  const kind = mode === 'org' ? 'admin' : 'crew'

  return (
    <section aria-labelledby="first-steps-title" style={{ ...card, marginBottom: '20px', borderColor: tint(colors.accent, 30), background: tint(colors.accent, 5) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
        <Rocket size={16} color={colors.accentText} aria-hidden="true" />
        <h2 id="first-steps-title" style={{ fontSize: '15px', fontWeight: 700, flex: 1 }}>{t('firstSteps.title')}</h2>
        <button type="button" onClick={hide} aria-label={t('firstSteps.hide')} title={t('firstSteps.hide')}
          style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', padding: '4px', display: 'flex' }}><X size={16} /></button>
      </div>
      <p style={{ fontSize: '13px', color: colors.muted, marginBottom: '10px' }}>{t('firstSteps.left', { count: left, total: steps.length })}</p>
      <ol style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {steps.map(s => {
          const g = guideText(s.guide)
          return (
            <li key={s.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 4px', borderTop: `1px solid ${colors.border}` }}>
              {s.done
                ? <CheckCircle2 size={18} color={colors.accentText} style={{ flexShrink: 0, marginTop: '1px' }} aria-label={t('firstSteps.done')} />
                : <Circle size={18} color={colors.muted} style={{ flexShrink: 0, marginTop: '1px' }} aria-label={t('firstSteps.todo')} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                {s.to && !s.done
                  ? <button type="button" onClick={() => navigate(s.to)} style={{ background: 'none', border: 'none', padding: 0, color: colors.text, fontWeight: 600, fontSize: '14px', cursor: 'pointer', textAlign: 'left', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      {t(`firstSteps.${kind}.${s.id}`)} <ChevronRight size={14} aria-hidden="true" />
                    </button>
                  : <span style={{ fontWeight: 600, fontSize: '14px', color: s.done ? colors.muted : colors.text, textDecoration: s.done ? 'line-through' : 'none' }}>{t(`firstSteps.${kind}.${s.id}`)}</span>}
                {!s.done && (
                  <span style={{ display: 'block', fontSize: '12px', color: colors.muted, lineHeight: 1.5, marginTop: '2px' }}>
                    {t(`firstSteps.${kind}.${s.id}Hint`)}{' '}
                    {g && <Link to={`/help/guide/${s.guide}`} style={{ color: colors.accentText }}>{t('help.howTo', { title: g.title })}</Link>}
                  </span>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
