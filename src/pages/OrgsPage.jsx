import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Users, Settings, ArrowRight, Briefcase, Bell, BellOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useWorkspace } from '../lib/WorkspaceContext'
import { homePath } from '../lib/nav'
import { useI18n } from '../i18n'
import AppShell, { RoleChip } from '../components/shell/AppShell'
import NewOrgModal from '../components/NewOrgModal'
import { btn, btnPrimary, colors } from '../components/ui'

// Every organisation you belong to, with your role in each, plus the companies you
// only work for as crew (their gigs live in My work). Creating organisations starts here.
export default function OrgsPage() {
  const { orgs, setWorkspace, refresh, loading, mutedIds, setMuted, unreadIn } = useWorkspace()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [guestAt, setGuestAt] = useState([])

  useEffect(() => {
    supabase.rpc('my_gig_companies').then(({ data }) => setGuestAt(data || []))
  }, [])

  const open = (orgId, suffix = '') => {
    setWorkspace(orgId)
    navigate(`${homePath(orgId)}${suffix}`)
  }
  const myOrgIds = new Set(orgs.map(o => o.id))
  const guestOnly = guestAt.filter(c => !myOrgIds.has(c.org_id))
  const closeNew = () => { params.delete('new'); setParams(params, { replace: true }) }

  return (
    <AppShell>
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '28px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '22px' }}>
          <div>
            <h1 style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.5px' }}>{t('orgs.title')}</h1>
            <p style={{ color: colors.muted, fontSize: '13px', marginTop: '6px', maxWidth: '520px', lineHeight: 1.6 }}>{t('orgs.intro')}</p>
          </div>
          <button onClick={() => setParams({ new: '1' })} style={btnPrimary}><Plus size={15} /> {t('dash.newOrg')}</button>
        </div>

        {!loading && orgs.length === 0 && (
          <p style={{ color: colors.soft, fontSize: '14px', padding: '20px 0' }}>{t('orgs.none')}</p>
        )}
        <div className="orgs-grid">
          {orgs.map(o => (
            <div key={o.id} className="org-card">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '6px' }}>
                <span className="org-card-mark" aria-hidden="true">{o.name.trim().slice(0, 1).toUpperCase()}</span>
                <strong style={{ fontSize: '16px', flex: 1, minWidth: 0, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{o.name}</strong>
                <RoleChip role={o.myRole} />
              </div>
              {unreadIn(o.id) > 0 && <p style={{ fontSize: '12px', color: colors.accent, fontWeight: 600 }}>{t('orgs.unread', { count: unreadIn(o.id) })}</p>}
              <p style={{ color: colors.soft, fontSize: '13px', lineHeight: 1.5, minHeight: '40px' }}>{t(`nav.roleDesc.${o.myRole}`)}</p>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '12px' }}>
                <button onClick={() => open(o.id)} style={btn}><ArrowRight size={14} /> {t('orgs.open')}</button>
                <button onClick={() => open(o.id, '?panel=members')} style={ghost}><Users size={14} /> {t('dash.members')}</button>
                {o.myRole === 'admin' && (
                  <button onClick={() => open(o.id, '?panel=settings')} aria-label={t('orgSettings.open')} title={t('orgSettings.open')} style={ghost}><Settings size={14} /></button>
                )}
                <MuteButton orgId={o.id} name={o.name} muted={mutedIds?.has(o.id)} setMuted={setMuted} />
              </div>
            </div>
          ))}
        </div>

        {guestOnly.length > 0 && (
          <section style={{ marginTop: '32px' }}>
            <h2 style={{ fontSize: '12px', fontWeight: 700, color: colors.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>{t('orgs.guestTitle')}</h2>
            <p style={{ color: colors.muted, fontSize: '13px', marginBottom: '12px', lineHeight: 1.6 }}>{t('orgs.guestIntro')}</p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {guestOnly.map(c => (
                <span key={c.org_id} style={{ display: 'inline-flex', gap: '2px' }}>
                  <button onClick={() => navigate('/me')} style={ghost}><Briefcase size={14} /> {c.name}</button>
                  <MuteButton orgId={c.org_id} name={c.name} muted={mutedIds?.has(c.org_id)} setMuted={setMuted} />
                </span>
              ))}
            </div>
          </section>
        )}
      </div>
      {params.get('new') && (
        <NewOrgModal onClose={closeNew} onCreated={async org => { await refresh(); open(org.id) }} />
      )}
      <style>{`
        .orgs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
        .org-card { padding: 16px; border-radius: 16px; background: rgba(255,255,255,0.03); border: 1px solid ${colors.border}; }
        .org-card-mark { width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 800;
          background: linear-gradient(135deg, rgba(167,139,250,0.9), rgba(99,102,241,0.9)); color: #0b0f19; flex-shrink: 0; }
      `}</style>
    </AppShell>
  )
}

// Muting: no unread badge and no email summary for this organisation's updates
function MuteButton({ orgId, name, muted, setMuted }) {
  const { t } = useI18n()
  const label = muted ? t('mute.unmuteNamed', { name }) : t('mute.muteNamed', { name })
  return (
    <button onClick={() => setMuted(orgId, !muted)} aria-pressed={!!muted} aria-label={label}
      title={muted ? t('mute.mutedHint') : t('mute.muteHint')} style={{ ...ghost, color: muted ? '#F59E0B' : colors.soft }}>
      {muted ? <BellOff size={14} /> : <Bell size={14} />}
    </button>
  )
}

const ghost = { ...btn, background: 'transparent', borderColor: 'rgba(255,255,255,0.1)', color: colors.soft }
