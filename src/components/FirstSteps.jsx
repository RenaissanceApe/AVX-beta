import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Circle, ChevronRight, ChevronDown, X, ListChecks } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { pushSupport, currentSubscription } from '../lib/push'
import { track } from '../lib/usage'
import { guide as guideText } from '../help'
import { useI18n } from '../i18n'
import { colors, space } from './ui'

// First steps (docs/HELP.md, H4): a short checklist on the home page until it's done, so a new
// admin or crew member knows what to do first. Each step ticks itself when it's done, links to
// where it's done and to its guide. "Hide" puts it away for good on this device. On the home it is one
// slim row that opens the steps still to do (DR1).
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
  const [open, setOpen] = useState(false)

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
  const todo = steps.filter(s => !s.done)
  if (todo.length === 0) return null

  const hide = () => {
    try { localStorage.setItem(hideKey(user.id, scope), '1') } catch { /* this visit only */ }
    setHidden(true)
    track('firstSteps:hide')
  }
  const kind = mode === 'org' ? 'admin' : 'crew'
  const done = steps.length - todo.length

  // One quiet row (DESIGN.md "Home"): "First steps · 1 of 4 done · next: Invite your team"; it opens the
  // steps still to do. No accent border or fill; finished steps are not listed.
  return (
    <section aria-labelledby="first-steps-title" className="avx-section">
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], borderTop: `1px solid ${colors.border}`, borderBottom: open ? 'none' : `1px solid ${colors.border}` }}>
        <h2 id="first-steps-title" style={{ flex: 1, minWidth: 0, margin: 0, fontSize: '14px' }}>
          <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-controls="first-steps-list"
            style={{ width: '100%', minHeight: '52px', display: 'flex', alignItems: 'center', gap: space[3], padding: `${space[3]} 0`, background: 'none', border: 'none',
              color: colors.text, font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
            <ListChecks size={18} color={colors.muted} aria-hidden="true" style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, lineHeight: '20px', fontFamily: 'var(--font-ui)' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{t('firstSteps.title')}</span>
              <span style={{ fontWeight: 400, color: colors.text2 }}> · {t('firstSteps.progress', { done, total: steps.length })}</span>
              <span style={{ fontWeight: 400, color: colors.muted }}> · {t('firstSteps.next', { step: t(`firstSteps.${kind}.${todo[0].id}`) })}</span>
            </span>
            <ChevronDown size={16} color={colors.muted} aria-hidden="true" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
          </button>
        </h2>
        <button type="button" onClick={hide} aria-label={t('firstSteps.hide')} title={t('firstSteps.hide')}
          style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', padding: space[2], display: 'flex', flexShrink: 0 }}><X size={16} aria-hidden="true" /></button>
      </div>
      {open && (
        <ol id="first-steps-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {todo.map(s => {
            const g = guideText(s.guide)
            return (
              <li key={s.id} style={{ display: 'flex', alignItems: 'flex-start', gap: space[3], padding: `${space[3]} 0`, borderTop: `1px solid ${colors.border}`, borderBottom: `1px solid ${colors.border}`, marginTop: '-1px' }}>
                <Circle size={18} color={colors.muted} style={{ flexShrink: 0, marginTop: '1px' }} aria-hidden="true" />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: space[1] }}>
                  {s.to
                    ? <button type="button" onClick={() => navigate(s.to)} style={{ background: 'none', border: 'none', padding: 0, color: colors.text, fontWeight: 600, fontSize: '14px', cursor: 'pointer', textAlign: 'left', display: 'inline-flex', alignItems: 'center', gap: space[1], alignSelf: 'flex-start' }}>
                        {t(`firstSteps.${kind}.${s.id}`)} <ChevronRight size={14} aria-hidden="true" />
                      </button>
                    : <span style={{ fontWeight: 600, fontSize: '14px' }}>{t(`firstSteps.${kind}.${s.id}`)}</span>}
                  <span style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5 }}>
                    {t(`firstSteps.${kind}.${s.id}Hint`)}{' '}
                    {g && <Link to={`/help/guide/${s.guide}`} style={{ color: colors.accentText }}>{t('help.howTo', { title: g.title })}</Link>}
                  </span>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
