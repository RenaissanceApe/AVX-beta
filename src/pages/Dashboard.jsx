import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import {
  Zap, Plus, Calendar, MapPin, Users, ChevronRight,
  Building2, LogOut, Loader2, X, ArrowRight, CheckCircle
} from 'lucide-react'
import { format, parseISO } from 'date-fns'

const STATUS_CONFIG = {
  draft:     { label: 'Draft',     color: '#4A6070', bg: 'rgba(74,96,112,0.15)' },
  confirmed: { label: 'Confirmed', color: '#3B82F6', bg: 'rgba(59,130,246,0.15)' },
  active:    { label: 'Active',    color: '#1EC878', bg: 'rgba(30,200,120,0.15)' },
  completed: { label: 'Done',      color: '#8B5CF6', bg: 'rgba(139,92,246,0.15)' },
  archived:  { label: 'Archived',  color: '#374151', bg: 'rgba(55,65,81,0.1)' },
}

export default function Dashboard() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [orgs, setOrgs] = useState([])
  const [activeOrg, setActiveOrg] = useState(null)
  const [gigs, setGigs] = useState([])
  const [loadingGigs, setLoadingGigs] = useState(false)
  const [showNewOrg, setShowNewOrg] = useState(false)
  const [showNewGig, setShowNewGig] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')
  const [gigForm, setGigForm] = useState({ name: '', venue: '', start_date: '', end_date: '', description: '', status: 'confirmed' })

  useEffect(() => { if (user) fetchOrgs() }, [user])
  useEffect(() => { if (activeOrg) fetchGigs(activeOrg.id) }, [activeOrg])

  async function fetchOrgs() {
    const { data } = await supabase
      .from('org_members')
      .select('role, organisations(*)')
      .eq('user_id', user.id)
    if (data?.length) {
      const list = data.map(d => ({ ...d.organisations, myRole: d.role }))
      setOrgs(list)
      setActiveOrg(list[0])
    }
  }

  async function fetchGigs(orgId) {
    setLoadingGigs(true)
    const { data } = await supabase
      .from('gigs')
      .select('*')
      .eq('org_id', orgId)
      .order('start_date', { ascending: true })
    setGigs(data || [])
    setLoadingGigs(false)
  }

  async function createOrg() {
    if (!newOrgName.trim()) return
    setCreating(true)
    const { data: org, error } = await supabase
      .from('organisations')
      .insert({ name: newOrgName.trim(), created_by: user.id })
      .select().single()
    if (!error) {
      await supabase.from('org_members').insert({ org_id: org.id, user_id: user.id, role: 'admin' })
      setShowNewOrg(false)
      setNewOrgName('')
      fetchOrgs()
    }
    setCreating(false)
  }

  async function createGig() {
    if (!gigForm.name.trim()) return
    setCreating(true)
    const { data: gig, error } = await supabase
      .from('gigs')
      .insert({ ...gigForm, org_id: activeOrg.id, created_by: user.id })
      .select().single()
    if (!error) {
      await supabase.from('gig_members').insert({ gig_id: gig.id, user_id: user.id, role: 'pm', function_title: 'Production Manager' })
      setShowNewGig(false)
      setGigForm({ name: '', venue: '', start_date: '', end_date: '', description: '', status: 'confirmed' })
      fetchGigs(activeOrg.id)
    }
    setCreating(false)
  }

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'User'
  const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div style={{ minHeight: '100vh', background: '#080C14', fontFamily: "'DM Sans', sans-serif", color: '#fff' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap'); * { box-sizing: border-box; } input, textarea, select { font-family: 'DM Sans', sans-serif; }`}</style>

      {/* Top nav */}
      <nav style={{
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '0 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: '60px',
        background: 'rgba(8,12,20,0.9)', backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 50
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '30px', height: '30px', background: 'linear-gradient(135deg, #1EC878, #0FA85A)',
            borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 12px rgba(30,200,120,0.3)'
          }}>
            <Zap size={16} color="#fff" fill="#fff" />
          </div>
          <span style={{ fontWeight: '800', fontSize: '18px', letterSpacing: '-0.3px' }}>AVX</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '50%',
            background: 'linear-gradient(135deg, #1EC878, #0FA85A)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '12px', fontWeight: '700', color: '#fff'
          }}>{initials}</div>
          <button onClick={signOut} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: '#4A6070',
            display: 'flex', alignItems: 'center', padding: '4px'
          }}>
            <LogOut size={16} />
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 24px' }}>

        {/* Org selector / header */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <p style={{ color: '#4A6070', fontSize: '13px', margin: '0 0 4px 0' }}>Welcome back, {displayName.split(' ')[0]}</p>
              <h1 style={{ fontSize: '26px', fontWeight: '800', margin: 0, letterSpacing: '-0.5px' }}>
                {activeOrg ? activeOrg.name : 'Your Gigs'}
              </h1>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {!activeOrg && (
                <button onClick={() => setShowNewOrg(true)} style={btnPrimary}>
                  <Building2 size={15} /> New Organisation
                </button>
              )}
              {activeOrg && (
                <button onClick={() => setShowNewGig(true)} style={btnPrimary}>
                  <Plus size={15} /> New Gig
                </button>
              )}
            </div>
          </div>

          {/* Org tabs */}
          {orgs.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px', flexWrap: 'wrap' }}>
              {orgs.map(org => (
                <button key={org.id} onClick={() => setActiveOrg(org)} style={{
                  padding: '6px 14px', borderRadius: '20px', border: 'none', cursor: 'pointer',
                  fontSize: '13px', fontWeight: '600', fontFamily: "'DM Sans', sans-serif",
                  background: activeOrg?.id === org.id ? 'rgba(30,200,120,0.15)' : 'rgba(255,255,255,0.04)',
                  color: activeOrg?.id === org.id ? '#1EC878' : '#4A6070',
                  border: activeOrg?.id === org.id ? '1px solid rgba(30,200,120,0.3)' : '1px solid rgba(255,255,255,0.06)',
                  transition: 'all 0.2s'
                }}>
                  {org.name}
                </button>
              ))}
              <button onClick={() => setShowNewOrg(true)} style={{
                padding: '6px 14px', borderRadius: '20px',
                background: 'transparent', border: '1px dashed rgba(255,255,255,0.1)',
                color: '#2A3A48', fontSize: '13px', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                display: 'flex', alignItems: 'center', gap: '4px'
              }}>
                <Plus size={13} /> Add org
              </button>
            </div>
          )}
        </div>

        {/* No org state */}
        {orgs.length === 0 && (
          <EmptyState
            icon={<Building2 size={32} color="#1EC878" />}
            title="Create your organisation"
            body="Set up your rental company or production team to start creating gigs."
            action="Create Organisation"
            onAction={() => setShowNewOrg(true)}
          />
        )}

        {/* Gig list */}
        {activeOrg && (
          loadingGigs ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
              <Loader2 size={24} color="#1EC878" style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          ) : gigs.length === 0 ? (
            <EmptyState
              icon={<Calendar size={32} color="#1EC878" />}
              title="No gigs yet"
              body="Create your first gig to start coordinating your crew and centralising your production documents."
              action="Create First Gig"
              onAction={() => setShowNewGig(true)}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {gigs.map(gig => {
                const st = STATUS_CONFIG[gig.status] || STATUS_CONFIG.draft
                return (
                  <div key={gig.id} onClick={() => navigate(`/gig/${gig.id}`)}
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      borderRadius: '14px', padding: '18px 20px',
                      cursor: 'pointer', transition: 'all 0.2s',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(30,200,120,0.25)'; e.currentTarget.style.background = 'rgba(30,200,120,0.04)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: '700', fontSize: '16px' }}>{gig.name}</span>
                        <span style={{
                          fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '20px',
                          color: st.color, background: st.bg, textTransform: 'uppercase', letterSpacing: '0.05em'
                        }}>{st.label}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                        {gig.venue && (
                          <span style={{ fontSize: '13px', color: '#4A6070', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <MapPin size={12} /> {gig.venue}
                          </span>
                        )}
                        {gig.start_date && (
                          <span style={{ fontSize: '13px', color: '#4A6070', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Calendar size={12} />
                            {format(parseISO(gig.start_date), 'dd MMM yyyy')}
                            {gig.end_date && gig.end_date !== gig.start_date && ` → ${format(parseISO(gig.end_date), 'dd MMM')}`}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={18} color="#2A3A48" />
                  </div>
                )
              })}
            </div>
          )
        )}
      </div>

      {/* New Org Modal */}
      {showNewOrg && (
        <Modal title="New Organisation" onClose={() => setShowNewOrg(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <FieldLabel label="Organisation Name">
              <input value={newOrgName} onChange={e => setNewOrgName(e.target.value)}
                placeholder="e.g. SoundWorks Lisboa" style={modalInput}
                onKeyDown={e => e.key === 'Enter' && createOrg()} autoFocus />
            </FieldLabel>
            <button onClick={createOrg} disabled={creating || !newOrgName.trim()} style={btnModal}>
              {creating ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={16} />}
              Create Organisation
            </button>
          </div>
        </Modal>
      )}

      {/* New Gig Modal */}
      {showNewGig && (
        <Modal title="New Gig" onClose={() => setShowNewGig(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <FieldLabel label="Gig Name *">
              <input value={gigForm.name} onChange={e => setGigForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Festival NOS Alive 2026 — Main Stage" style={modalInput} autoFocus />
            </FieldLabel>
            <FieldLabel label="Venue">
              <input value={gigForm.venue} onChange={e => setGigForm(f => ({ ...f, venue: e.target.value }))}
                placeholder="Passeio Marítimo de Algés, Lisboa" style={modalInput} />
            </FieldLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <FieldLabel label="Start Date">
                <input type="date" value={gigForm.start_date} onChange={e => setGigForm(f => ({ ...f, start_date: e.target.value }))} style={modalInput} />
              </FieldLabel>
              <FieldLabel label="End Date">
                <input type="date" value={gigForm.end_date} onChange={e => setGigForm(f => ({ ...f, end_date: e.target.value }))} style={modalInput} />
              </FieldLabel>
            </div>
            <FieldLabel label="Status">
              <select value={gigForm.status} onChange={e => setGigForm(f => ({ ...f, status: e.target.value }))} style={{ ...modalInput, cursor: 'pointer' }}>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </FieldLabel>
            <FieldLabel label="Description">
              <textarea value={gigForm.description} onChange={e => setGigForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Brief overview of the production..." rows={3}
                style={{ ...modalInput, resize: 'vertical', lineHeight: '1.5' }} />
            </FieldLabel>
            <button onClick={createGig} disabled={creating || !gigForm.name.trim()} style={btnModal}>
              {creating ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <ArrowRight size={16} />}
              Create Gig
            </button>
          </div>
        </Modal>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } } @keyframes fadeIn { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }`}</style>
    </div>
  )
}

function EmptyState({ icon, title, body, action, onAction }) {
  return (
    <div style={{ textAlign: 'center', padding: '80px 24px' }}>
      <div style={{
        width: '64px', height: '64px', borderRadius: '18px',
        background: 'rgba(30,200,120,0.1)', border: '1px solid rgba(30,200,120,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 20px'
      }}>{icon}</div>
      <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px' }}>{title}</h3>
      <p style={{ color: '#4A6070', fontSize: '14px', maxWidth: '360px', margin: '0 auto 24px', lineHeight: '1.6' }}>{body}</p>
      <button onClick={onAction} style={btnPrimary}><Plus size={15} /> {action}</button>
    </div>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px'
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: '#0F1520', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '18px', padding: '28px', width: '100%', maxWidth: '480px',
        animation: 'fadeIn 0.2s ease'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '700', margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4A6070', padding: '4px', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function FieldLabel({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#4A6070', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>{label}</label>
      {children}
    </div>
  )
}

const btnPrimary = {
  display: 'inline-flex', alignItems: 'center', gap: '7px',
  padding: '10px 18px', borderRadius: '10px', border: 'none', cursor: 'pointer',
  background: 'linear-gradient(135deg, #1EC878, #0FA85A)',
  color: '#fff', fontWeight: '700', fontSize: '14px',
  fontFamily: "'DM Sans', sans-serif",
  boxShadow: '0 4px 16px rgba(30,200,120,0.25)',
  transition: 'all 0.2s'
}

const btnModal = {
  ...btnPrimary,
  width: '100%', justifyContent: 'center',
  padding: '13px', fontSize: '15px', marginTop: '4px'
}

const modalInput = {
  width: '100%', padding: '10px 13px',
  background: 'rgba(0,0,0,0.4)',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: '9px', color: '#fff',
  fontSize: '14px', outline: 'none',
}
