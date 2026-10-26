import { useCallback, useEffect, useState } from 'react'
import { Loader2, ShieldCheck, Check, X, FileText, Flag, Building2, Undo2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { track } from '../lib/usage'
import { useI18n } from '../i18n'
import { btn, btnPrimary, btnDanger, card, colors } from '../components/ui'
import AppShell from '../components/shell/AppShell'

const hint = { fontSize: '12px', color: colors.muted, lineHeight: 1.5 }
const h2 = { fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }
const item = { ...card, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }
const row = { display: 'flex', flexWrap: 'wrap', gap: '8px' }

// What waits for an AVX admin (docs/CREW_NETWORK.md, N4): manual company checks, certificate
// proofs and reports on profiles and job posts; plus verified companies and suspensions to undo.
// Only AVX admins with two-step sign-in get anything from trust_queue().
//   /admin/trust
export default function TrustAdminPage() {
  const { t, fmt } = useI18n()
  const { notify } = useToast()
  const [q, setQ] = useState(null)
  const [denied, setDenied] = useState(false)
  const [busy, setBusy] = useState(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('trust_queue')
    if (error) { if (error.code === '42501') return setDenied(true); logger.error('trust', error, { step: 'queue' }); return notify(userMessage(error), 'error') }
    setQ(data)
  }, [notify])
  useEffect(() => { load() }, [load])

  async function act(id, fn, args, done) {
    setBusy(id)
    const { error } = await supabase.rpc(fn, args)
    setBusy(null)
    if (error) { logger.error('trust', error, { step: fn }); return notify(userMessage(error), 'error') }
    notify(t(done), 'success')
    track(`trust:${fn}`)
    load()
  }

  async function openProof(p) {
    const { data, error } = await supabase.storage.from('certificate-proofs').createSignedUrl(p.path, 120)
    if (error) { logger.error('trust', error, { step: 'proofUrl' }); return notify(userMessage(error), 'error') }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  const date = d => fmt(d, 'd MMM yyyy')
  if (denied) return <AppShell><p style={{ maxWidth: '420px', margin: '80px auto', textAlign: 'center', color: colors.muted, padding: '0 16px', lineHeight: 1.6 }}>{t('trust.admin.denied')}</p></AppShell>
  if (!q) return <AppShell><div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}><Loader2 size={24} color={colors.accentText} style={{ animation: 'spin 1s linear infinite' }} /></div></AppShell>

  // Reports grouped by what they are about (one decision covers them all)
  const groups = Object.values(q.reports.reduce((m, r) => {
    const key = `${r.target_kind}:${r.target_post || r.target_user}`
    ;(m[key] ||= { key, first: r, reports: [] }).reports.push(r)
    return m
  }, {}))

  return (
    <AppShell>
      <div style={{ maxWidth: '880px', margin: '0 auto', padding: '24px 16px 48px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.4px', display: 'flex', alignItems: 'center', gap: '8px' }}><ShieldCheck size={22} aria-hidden="true" /> {t('trust.admin.title')}</h1>
          <p style={{ ...hint, fontSize: '13px', marginTop: '4px' }}>{t('trust.admin.intro')}</p>
        </div>

        <section aria-labelledby="ta-ver" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h2 id="ta-ver" style={h2}><Building2 size={16} aria-hidden="true" /> {t('trust.admin.verifications', { count: q.verifications.length })}</h2>
          {q.verifications.length === 0 && <p style={hint}>{t('trust.admin.nothing')}</p>}
          {q.verifications.map(v => (
            <article key={v.id} style={item}>
              <strong style={{ overflowWrap: 'anywhere' }}>{v.org_name}</strong>
              <p style={hint}>{[v.legal_name, v.tax_id, v.website].filter(Boolean).join(' · ') || '—'}</p>
              <p style={{ fontSize: '13px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>“{v.note}”</p>
              <p style={hint}>{t('trust.admin.askedBy', { name: v.requested_by || '—', date: date(v.created_at) })}</p>
              <div style={row}>
                <button type="button" disabled={busy === v.id} style={btnPrimary} aria-label={t('trust.admin.approveNamed', { name: v.org_name })}
                  onClick={() => { const name = window.prompt(t('trust.admin.registeredName'), v.legal_name || v.org_name); if (name !== null) act(v.id, 'decide_verification', { p_id: v.id, p_approve: true, p_name: name }, 'trust.admin.approved') }}>
                  <Check size={14} /> {t('trust.admin.approve')}</button>
                <button type="button" disabled={busy === v.id} style={btn} aria-label={t('trust.admin.rejectNamed', { name: v.org_name })}
                  onClick={() => { const why = window.prompt(t('trust.admin.why')); if (why !== null) act(v.id, 'decide_verification', { p_id: v.id, p_approve: false, p_answer: why }, 'trust.admin.rejected') }}>
                  <X size={14} /> {t('trust.admin.reject')}</button>
              </div>
            </article>
          ))}
        </section>

        <section aria-labelledby="ta-proofs" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h2 id="ta-proofs" style={h2}><FileText size={16} aria-hidden="true" /> {t('trust.admin.proofs', { count: q.proofs.length })}</h2>
          {q.proofs.length === 0 && <p style={hint}>{t('trust.admin.nothing')}</p>}
          {q.proofs.map(p => (
            <article key={p.id} style={item}>
              <strong id={`ta-p-${p.id}`} style={{ overflowWrap: 'anywhere' }}>{p.cert_name} · {p.name || '—'}</strong>
              <p style={hint}>{p.expires_on ? t('crewProfile.validUntil', { date: date(p.expires_on) }) : t('trust.admin.noExpiry')} · {date(p.created_at)}</p>
              <div style={row}>
                <button type="button" onClick={() => openProof(p)} style={btn} aria-describedby={`ta-p-${p.id}`}><FileText size={14} /> {t('trust.admin.openProof')}</button>
                <button type="button" disabled={busy === p.id} style={btnPrimary} aria-label={t('trust.admin.approveNamed', { name: p.cert_name })}
                  onClick={() => act(p.id, 'review_certificate_proof', { p_id: p.id, p_approve: true }, 'trust.admin.approved')}><Check size={14} /> {t('trust.admin.approve')}</button>
                <button type="button" disabled={busy === p.id} style={btn} aria-label={t('trust.admin.rejectNamed', { name: p.cert_name })}
                  onClick={() => { const why = window.prompt(t('trust.admin.why')); if (why !== null) act(p.id, 'review_certificate_proof', { p_id: p.id, p_approve: false, p_answer: why }, 'trust.admin.rejected') }}>
                  <X size={14} /> {t('trust.admin.reject')}</button>
              </div>
            </article>
          ))}
        </section>

        <section aria-labelledby="ta-reports" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h2 id="ta-reports" style={h2}><Flag size={16} aria-hidden="true" /> {t('trust.admin.reports', { count: groups.length })}</h2>
          {groups.length === 0 && <p style={hint}>{t('trust.admin.nothing')}</p>}
          {groups.map(({ key, first: f, reports }) => {
            const what = f.target_kind === 'job' ? `${f.post_title} · ${f.org_name}` : f.target_name || '—'
            return (
              <article key={key} style={item}>
                <strong id={`ta-r-${f.id}`} style={{ overflowWrap: 'anywhere' }}>{t(`trust.admin.kind.${f.target_kind}`)}: {what}</strong>
                {f.target_kind === 'job' && f.post_description && <p style={{ fontSize: '13px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{f.post_description}</p>}
                {f.target_kind === 'profile' && f.profile && <p style={{ fontSize: '13px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{[f.profile.headline, f.profile.other_functions, f.profile.bio, ...(f.profile.links || [])].filter(Boolean).join('\n')}</p>}
                {(f.org_suspended || f.profile?.suspended) && <p style={{ ...hint, color: 'var(--warn)' }}>{t(f.target_kind === 'job' ? 'trust.admin.orgSuspended' : 'trust.admin.profileHidden')}</p>}
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {reports.map(r => <li key={r.id} style={hint}>{t(`trust.reason.${r.reason}`)} · {r.reporter || '—'} · {date(r.created_at)}{r.note && <> · “{r.note}”</>}</li>)}
                </ul>
                <div style={row}>
                  <button type="button" disabled={busy === f.id} style={btnDanger} aria-describedby={`ta-r-${f.id}`}
                    onClick={() => act(f.id, 'decide_network_report', { p_id: f.id, p_remove: true }, 'trust.admin.removed')}><X size={14} /> {t(`trust.admin.remove.${f.target_kind}`)}</button>
                  <button type="button" disabled={busy === f.id} style={btn} aria-describedby={`ta-r-${f.id}`}
                    onClick={() => act(f.id, 'decide_network_report', { p_id: f.id, p_remove: false }, 'trust.admin.kept')}><Check size={14} /> {t('trust.admin.keep')}</button>
                </div>
              </article>
            )
          })}
        </section>

        {(q.suspended_orgs.length > 0 || q.suspended_profiles.length > 0) && (
          <section aria-labelledby="ta-susp" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h2 id="ta-susp" style={h2}>{t('trust.admin.suspended')}</h2>
            {q.suspended_orgs.map(o => (
              <div key={o.org_id} style={{ ...row, alignItems: 'center' }}>
                <span style={{ fontSize: '14px' }}>{o.org_name} · {t('trust.admin.postingSince', { date: date(o.since) })}</span>
                <button type="button" style={btn} onClick={() => act(o.org_id, 'lift_suspension', { p_kind: 'org', p_id: o.org_id }, 'trust.admin.lifted')}><Undo2 size={14} /> {t('trust.admin.lift')}</button>
              </div>
            ))}
            {q.suspended_profiles.map(p => (
              <div key={p.user_id} style={{ ...row, alignItems: 'center' }}>
                <span style={{ fontSize: '14px' }}>{p.name || '—'} · {t('trust.admin.hiddenSince', { date: date(p.since) })}</span>
                <button type="button" style={btn} onClick={() => act(p.user_id, 'lift_suspension', { p_kind: 'profile', p_id: p.user_id }, 'trust.admin.lifted')}><Undo2 size={14} /> {t('trust.admin.lift')}</button>
              </div>
            ))}
          </section>
        )}

        <section aria-labelledby="ta-verified" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <h2 id="ta-verified" style={h2}><ShieldCheck size={16} aria-hidden="true" /> {t('trust.admin.verified', { count: q.verified.length })}</h2>
          {q.verified.map(o => (
            <div key={o.org_id} style={{ ...row, alignItems: 'center' }}>
              <span style={{ fontSize: '14px', overflowWrap: 'anywhere' }}>{o.org_name}{o.verified_name && o.verified_name !== o.org_name && <> ({o.verified_name})</>} · {t(`trust.verify.method.${o.verified_method || 'manual'}`)} · {date(o.verified_at)}</span>
              <button type="button" style={btn} aria-label={t('trust.admin.revokeNamed', { name: o.org_name })}
                onClick={() => { const why = window.prompt(t('trust.admin.why')); if (why !== null) act(o.org_id, 'revoke_verification', { p_org: o.org_id, p_answer: why }, 'trust.admin.revoked') }}>
                <Undo2 size={14} /> {t('trust.admin.revoke')}</button>
            </div>
          ))}
        </section>
      </div>
    </AppShell>
  )
}
