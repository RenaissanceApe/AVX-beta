import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import {
  Zap, ArrowLeft, MapPin, Calendar, Upload, FileText,
  Image, Clock, Users, MessageSquare, Plus, X, Loader2,
  Download, ChevronDown, AlertCircle, Send, UserPlus,
  File, Music, Layout, ClipboardList, RefreshCw, CheckCircle,
  MoreHorizontal, Star
} from 'lucide-react'
import { format, parseISO, formatDistanceToNow } from 'date-fns'

const ASSET_TYPES = [
  { value: 'patch_list', label: 'Patch List', icon: ClipboardList, color: '#1EC878' },
  { value: 'plot',       label: 'Plot',       icon: Layout,        color: '#3B82F6' },
  { value: 'schedule',   label: 'Schedule',   icon: Clock,         color: '#F59E0B' },
  { value: 'rider',      label: 'Rider',      icon: Music,         color: '#8B5CF6' },
  { value: 'document',   label: 'Document',   icon: FileText,      color: '#6B7280' },
  { value: 'image',      label: 'Image',      icon: Image,         color: '#EC4899' },
]

const STATUS_CONFIG = {
  draft:     { label: 'Draft',     color: '#4A6070', bg: 'rgba(74,96,112,0.15)' },
  confirmed: { label: 'Confirmed', color: '#3B82F6', bg: 'rgba(59,130,246,0.15)' },
  active:    { label: 'Active',    color: '#1EC878', bg: 'rgba(30,200,120,0.15)' },
  completed: { label: 'Done',      color: '#8B5CF6', bg: 'rgba(139,92,246,0.15)' },
  archived:  { label: 'Archived',  color: '#374151', bg: 'rgba(55,65,81,0.1)'   },
}

const TABS = ['Overview', 'Assets', 'Crew', 'Feed']

export default function GigPage() {
  const { id } = useParams()
  const { user, profile } = useAuth()
  const navigate = useNavigate()

  const [gig, setGig]               = useState(null)
  const [members, setMembers]       = useState([])
  const [assets, setAssets]         = useState([])
  const [posts, setPosts]           = useState([])
  const [profiles, setProfiles]     = useState({})
  const [tab, setTab]               = useState('Overview')
  const [loading, setLoading]       = useState(true)

  const [showUpload, setShowUpload] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [showEditGig, setShowEditGig] = useState(false)
  const [uploading, setUploading]   = useState(false)
  const [uploadForm, setUploadForm] = useState({ type: 'patch_list', name: '', file: null })
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'crew', function_title: '', call_time: '' })
  const [editForm, setEditForm]     = useState({})
  const [savingGig, setSavingGig]   = useState(false)
  const [inviting, setInviting]     = useState(false)
  const [postText, setPostText]     = useState('')
  const [postImportant, setPostImportant] = useState(false)
  const [posting, setPosting]       = useState(false)
  const [dragOver, setDragOver]     = useState(false)
  const fileInputRef                = useRef()
  const feedEndRef                  = useRef()

  useEffect(() => { loadAll() }, [id])
  useEffect(() => { feedEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [posts])

  async function loadAll() {
    setLoading(true)
    const [gigRes, membersRes, assetsRes, postsRes] = await Promise.all([
      supabase.from('gigs').select('*').eq('id', id).single(),
      supabase.from('gig_members').select('*').eq('gig_id', id),
      supabase.from('assets').select('*').eq('gig_id', id).is('superseded_by', null).order('created_at', { ascending: false }),
      supabase.from('feed_posts').select('*').eq('gig_id', id).order('created_at', { ascending: true }),
    ])
    setGig(gigRes.data)
    setMembers(membersRes.data || [])
    setAssets(assetsRes.data || [])
    setPosts(postsRes.data || [])

    // Fetch profiles for all unique user IDs
    const uids = [...new Set([
      ...(membersRes.data || []).map(m => m.user_id),
      ...(postsRes.data || []).map(p => p.user_id),
    ])]
    if (uids.length) {
      const { data: profileData } = await supabase.from('profiles').select('id, full_name, avatar_url').in('id', uids)
      const map = {}
      profileData?.forEach(p => { map[p.id] = p })
      setProfiles(map)
    }
    setLoading(false)
  }

  async function saveGig() {
    setSavingGig(true)
    const { error } = await supabase.from('gigs').update(editForm).eq('id', id)
    if (!error) {
      setGig(g => ({ ...g, ...editForm }))
      setShowEditGig(false)
    }
    setSavingGig(false)
  }

  const [openingAsset, setOpeningAsset] = useState(null)
  const [assetError, setAssetError]     = useState('')

  async function openAsset(asset) {
    setOpeningAsset(asset.id)
    setAssetError('')
    try {
      let path = asset.file_url ?? ''

      // If it's a full URL, extract just the path after the bucket name
      const marker = '/gig-assets/'
      if (path.includes(marker)) {
        path = path.split(marker)[1]
      }
      // Strip query strings
      path = path.split('?')[0]

      // Show the path we're using so we can verify it
      setAssetError(`Trying path: ${path}`)

      const result = await supabase.storage
        .from('gig-assets')
        .createSignedUrl(path, 3600)

      // Show the full raw result on screen
      const resultStr = JSON.stringify(result, null, 2)

      if (result.error) {
        setAssetError(`Error: ${result.error.message} | Path: ${path} | Full: ${resultStr}`)
        return
      }

      if (!result.data?.signedUrl) {
        setAssetError(`No URL returned. Full result: ${resultStr}`)
        return
      }

      setAssetError(`Success — opening...`)

      const a = document.createElement('a')
      a.href = result.data.signedUrl
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)

      setTimeout(() => setAssetError(''), 3000)
    } catch (err) {
      setAssetError(`Exception: ${err.message}`)
    } finally {
      setOpeningAsset(null)
    }
  }

  async function handleUpload() {
    if (!uploadForm.file || !uploadForm.name.trim()) return
    setUploading(true)
    try {
      const ext = uploadForm.file.name.split('.').pop()
      const path = `${id}/${Date.now()}-${uploadForm.name.replace(/\s+/g, '-')}.${ext}`
      const { error: storageError } = await supabase.storage
        .from('gig-assets')
        .upload(path, uploadForm.file, { contentType: uploadForm.file.type })
      if (storageError) throw storageError

      // Store the path, not the public URL — we generate signed URLs on open
      const fileUrl = path

      // Version: find if there's an existing asset of same type to supersede
      const existing = assets.find(a => a.type === uploadForm.type)
      const version = existing ? (existing.version || 1) + 1 : 1

      const { data: newAsset, error: dbError } = await supabase.from('assets').insert({
        gig_id: id,
        type: uploadForm.type,
        name: uploadForm.name.trim(),
        file_url: fileUrl,
        file_size: uploadForm.file.size,
        version,
        created_by: user.id,
      }).select().single()
      if (dbError) throw dbError

      // Supersede old asset
      if (existing) {
        await supabase.from('assets').update({ superseded_by: newAsset.id }).eq('id', existing.id)
      }

      setShowUpload(false)
      setUploadForm({ type: 'patch_list', name: '', file: null })
      loadAll()
    } catch (err) {
      alert('Upload failed: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleInvite() {
    if (!inviteForm.email.trim()) return
    setInviting(true)
    try {
      // Look up user by email
      const { data: userData } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', (await supabase.auth.admin?.getUserByEmail?.(inviteForm.email))?.data?.user?.id)
        .maybeSingle()

      // For now: if user doesn't exist, store email invite (simplified for beta)
      // In production this would send an email
      alert(`Invite sent to ${inviteForm.email}. They'll receive an email to join this gig. (Email sending requires backend setup — for beta, share the app URL manually.)`)
      setShowInvite(false)
      setInviteForm({ email: '', role: 'crew', function_title: '', call_time: '' })
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setInviting(false)
    }
  }

  async function handlePost() {
    if (!postText.trim()) return
    setPosting(true)
    const { error } = await supabase.from('feed_posts').insert({
      gig_id: id, user_id: user.id,
      content: postText.trim(),
      is_important: postImportant,
    })
    if (!error) {
      setPostText('')
      setPostImportant(false)
      // Refresh posts and profiles
      const { data: newPosts } = await supabase.from('feed_posts').select('*').eq('gig_id', id).order('created_at', { ascending: true })
      setPosts(newPosts || [])
      const uids = [...new Set([...Object.keys(profiles), ...(newPosts || []).map(p => p.user_id)])]
      const { data: profileData } = await supabase.from('profiles').select('id, full_name').in('id', uids)
      const map = { ...profiles }
      profileData?.forEach(p => { map[p.id] = p })
      setProfiles(map)
    }
    setPosting(false)
  }

  const myMembership = members.find(m => m.user_id === user?.id)
  const isPM = myMembership?.role === 'pm' || gig?.created_by === user?.id

  const getAssetIcon = (type) => {
    const cfg = ASSET_TYPES.find(t => t.value === type) || ASSET_TYPES[4]
    return cfg
  }

  const formatBytes = (bytes) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const displayName = (uid) => profiles[uid]?.full_name || 'Unknown'
  const initials    = (uid) => {
    const n = profiles[uid]?.full_name || '?'
    return n.split(' ').map(x => x[0]).join('').toUpperCase().slice(0, 2)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#080C14', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', sans-serif" }}>
      <Loader2 size={28} color="#1EC878" style={{ animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  if (!gig) return (
    <div style={{ minHeight: '100vh', background: '#080C14', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: "'DM Sans', sans-serif" }}>
      Gig not found.
    </div>
  )

  const st = STATUS_CONFIG[gig.status] || STATUS_CONFIG.draft

  return (
    <div style={{ minHeight: '100vh', background: '#080C14', fontFamily: "'DM Sans', sans-serif", color: '#fff' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        input, textarea, select { font-family: 'DM Sans', sans-serif; color: #fff; }
        input::placeholder, textarea::placeholder { color: #2A3A48; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }
        @keyframes slideUp { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:translateY(0) } }
      `}</style>

      {/* Nav */}
      <nav style={{
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '0 20px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: '56px',
        background: 'rgba(8,12,20,0.95)', backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 50
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => navigate('/dashboard')} style={{
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', color: '#fff',
            display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontFamily: "'DM Sans', sans-serif"
          }}>
            <ArrowLeft size={14} /> Back
          </button>
          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.08)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '26px', height: '26px', background: 'linear-gradient(135deg, #1EC878, #0FA85A)',
              borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Zap size={14} color="#fff" fill="#fff" />
            </div>
            <span style={{ fontWeight: '800', fontSize: '16px', letterSpacing: '-0.3px' }}>AVX</span>
          </div>
        </div>
        <button onClick={loadAll} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4A6070', display: 'flex', alignItems: 'center', padding: '6px' }}>
          <RefreshCw size={15} />
        </button>
      </nav>

      {/* Gig header */}
      <div style={{
        background: 'linear-gradient(180deg, rgba(30,200,120,0.07) 0%, transparent 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '24px 20px 0'
      }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '16px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
                <h1 style={{ fontSize: '22px', fontWeight: '800', margin: 0, letterSpacing: '-0.4px' }}>{gig.name}</h1>
                <span style={{
                  fontSize: '11px', fontWeight: '700', padding: '3px 9px', borderRadius: '20px',
                  color: st.color, background: st.bg, textTransform: 'uppercase', letterSpacing: '0.06em'
                }}>{st.label}</span>
              </div>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {gig.venue && (
                  <span style={{ fontSize: '13px', color: '#4A6070', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <MapPin size={13} /> {gig.venue}
                  </span>
                )}
                {gig.start_date && (
                  <span style={{ fontSize: '13px', color: '#4A6070', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Calendar size={13} />
                    {format(parseISO(gig.start_date), 'dd MMM yyyy')}
                    {gig.end_date && gig.end_date !== gig.start_date && ` → ${format(parseISO(gig.end_date), 'dd MMM yyyy')}`}
                  </span>
                )}
                <span style={{ fontSize: '13px', color: '#4A6070', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Users size={13} /> {members.length} crew
                </span>
              </div>
            </div>
            {myMembership && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                {isPM && (
                  <button onClick={() => { setEditForm({ name: gig.name, venue: gig.venue || '', start_date: gig.start_date || '', end_date: gig.end_date || '', description: gig.description || '', status: gig.status }); setShowEditGig(true) }} style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    padding: '5px 11px', borderRadius: '8px',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    color: '#4A6070', fontSize: '12px', fontWeight: '600',
                    fontFamily: "'DM Sans', sans-serif", cursor: 'pointer'
                  }}>
                    ✏️ Edit Gig
                  </button>
                )}
                <div style={{
                  padding: '6px 12px', borderRadius: '8px',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                  fontSize: '12px', color: '#4A6070', textAlign: 'center', whiteSpace: 'nowrap'
                }}>
                  <div style={{ fontWeight: '700', color: '#fff', fontSize: '13px' }}>
                    {myMembership.function_title || (myMembership.role === 'pm' ? 'Production Manager' : 'Crew')}
                  </div>
                  {myMembership.call_time && (
                    <div style={{ color: '#1EC878', fontSize: '12px', fontWeight: '600', marginTop: '2px' }}>
                      Call: {myMembership.call_time}
                    </div>
                  )}
                  <div style={{ marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '10px' }}>
                    {myMembership.role}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: '0' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: '14px', fontWeight: '600', fontFamily: "'DM Sans', sans-serif",
                color: tab === t ? '#1EC878' : '#4A6070',
                borderBottom: tab === t ? '2px solid #1EC878' : '2px solid transparent',
                transition: 'all 0.2s', position: 'relative', top: '1px'
              }}>
                {t}
                {t === 'Assets' && assets.length > 0 && (
                  <span style={{
                    marginLeft: '6px', fontSize: '11px', fontWeight: '700',
                    background: 'rgba(30,200,120,0.2)', color: '#1EC878',
                    padding: '1px 6px', borderRadius: '10px'
                  }}>{assets.length}</span>
                )}
                {t === 'Crew' && members.length > 0 && (
                  <span style={{
                    marginLeft: '6px', fontSize: '11px', fontWeight: '700',
                    background: 'rgba(255,255,255,0.08)', color: '#4A6070',
                    padding: '1px 6px', borderRadius: '10px'
                  }}>{members.length}</span>
                )}
                {t === 'Feed' && posts.length > 0 && (
                  <span style={{
                    marginLeft: '6px', fontSize: '11px', fontWeight: '700',
                    background: 'rgba(255,255,255,0.08)', color: '#4A6070',
                    padding: '1px 6px', borderRadius: '10px'
                  }}>{posts.length}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 20px' }}>

        {/* ── OVERVIEW ──────────────────────────────────────────────────────── */}
        {tab === 'Overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', animation: 'fadeIn 0.3s ease' }}>
            {/* Description */}
            {gig.description && (
              <div style={{ ...card, gridColumn: '1 / -1' }}>
                <SectionTitle icon={<FileText size={14} />} title="Description" />
                <p style={{ color: '#8A9BAE', fontSize: '14px', lineHeight: '1.7', margin: 0 }}>{gig.description}</p>
              </div>
            )}

            {/* Quick assets */}
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <SectionTitle icon={<FileText size={14} />} title="Assets" />
                {isPM && <SmallBtn onClick={() => { setTab('Assets'); setTimeout(() => setShowUpload(true), 100) }} icon={<Plus size={12} />} label="Upload" />}
              </div>
              {assets.length === 0 ? (
                <EmptyMini text="No assets yet" />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {assets.slice(0, 4).map(a => {
                    const cfg = getAssetIcon(a.type)
                    const Icon = cfg.icon
                    return (
                      <div key={a.id} onClick={() => openAsset(a)} style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '8px 10px', borderRadius: '9px',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        textDecoration: 'none', transition: 'all 0.15s', cursor: 'pointer'
                      }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(30,200,120,0.2)'}
                      onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}
                      >
                        <div style={{
                          width: '28px', height: '28px', borderRadius: '7px', flexShrink: 0,
                          background: `${cfg.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                          <Icon size={14} color={cfg.color} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: '600', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
                          <div style={{ fontSize: '11px', color: '#4A6070' }}>v{a.version} · {cfg.label}</div>
                        </div>
                        <Download size={13} color="#2A3A48" />
                      </div>
                    )
                  })}
                  {assets.length > 4 && (
                    <button onClick={() => setTab('Assets')} style={{ ...linkBtn, marginTop: '4px' }}>
                      View all {assets.length} assets →
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Quick crew */}
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <SectionTitle icon={<Users size={14} />} title="Crew" />
                {isPM && <SmallBtn onClick={() => { setTab('Crew'); setTimeout(() => setShowInvite(true), 100) }} icon={<UserPlus size={12} />} label="Invite" />}
              </div>
              {members.length === 0 ? (
                <EmptyMini text="No crew assigned" />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {members.slice(0, 5).map(m => (
                    <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Avatar uid={m.user_id} initials={initials(m.user_id)} size={30} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: '600' }}>{displayName(m.user_id)}</div>
                        <div style={{ fontSize: '11px', color: '#4A6070' }}>
                          {m.function_title || m.role}
                          {m.call_time && <span style={{ color: '#1EC878', marginLeft: '6px' }}>· {m.call_time}</span>}
                        </div>
                      </div>
                      <RoleBadge role={m.role} />
                    </div>
                  ))}
                  {members.length > 5 && (
                    <button onClick={() => setTab('Crew')} style={{ ...linkBtn, marginTop: '4px' }}>
                      View all {members.length} crew →
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Recent feed */}
            <div style={{ ...card, gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <SectionTitle icon={<MessageSquare size={14} />} title="Recent Updates" />
                <SmallBtn onClick={() => setTab('Feed')} icon={<ArrowLeft size={12} style={{ transform: 'rotate(180deg)' }} />} label="Full feed" />
              </div>
              {posts.length === 0 ? (
                <EmptyMini text="No updates yet" />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[...posts].reverse().slice(0, 3).reverse().map(post => (
                    <FeedPost key={post.id} post={post} displayName={displayName} initials={initials} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ASSETS ────────────────────────────────────────────────────────── */}
        {tab === 'Assets' && (
          <div style={{ animation: 'fadeIn 0.3s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: '700', margin: '0 0 4px 0' }}>Assets</h2>
                <p style={{ color: '#4A6070', fontSize: '13px', margin: 0 }}>
                  Patch lists, plots, schedules and all production documents for this gig.
                </p>
              </div>
              {isPM && (
                <button onClick={() => setShowUpload(true)} style={btnPrimary}>
                  <Upload size={14} /> Upload Asset
                </button>
              )}
            </div>

            {/* Group by type */}
            {assetError && (
              <div style={{
                padding: '12px 16px', borderRadius: '10px', marginBottom: '12px',
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                color: '#F87171', fontSize: '13px', lineHeight: '1.5'
              }}>
                ⚠️ {assetError}
              </div>
            )}

            {assets.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '80px 20px' }}>
                <div style={{
                  width: '56px', height: '56px', borderRadius: '16px',
                  background: 'rgba(30,200,120,0.08)', border: '1px solid rgba(30,200,120,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px'
                }}>
                  <Upload size={24} color="#1EC878" />
                </div>
                <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '8px' }}>No assets uploaded yet</h3>
                <p style={{ color: '#4A6070', fontSize: '13px', marginBottom: '20px', maxWidth: '300px', margin: '0 auto 20px' }}>
                  Upload your patch lists, plots, schedules, and riders here.
                </p>
                {isPM && (
                  <button onClick={() => setShowUpload(true)} style={btnPrimary}>
                    <Upload size={14} /> Upload First Asset
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {assets.map(a => {
                  const cfg = getAssetIcon(a.type)
                  const Icon = cfg.icon
                  return (
                    <div key={a.id} style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      borderRadius: '14px', padding: '16px 18px',
                      display: 'flex', alignItems: 'center', gap: '14px',
                      animation: 'fadeIn 0.3s ease'
                    }}>
                      <div style={{
                        width: '44px', height: '44px', borderRadius: '12px', flexShrink: 0,
                        background: `${cfg.color}18`, border: `1px solid ${cfg.color}30`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
                        <Icon size={20} color={cfg.color} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: '700', fontSize: '15px', marginBottom: '3px' }}>{a.name}</div>
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '12px', color: cfg.color, fontWeight: '600' }}>{cfg.label}</span>
                          <span style={{ fontSize: '12px', color: '#4A6070' }}>Version {a.version}</span>
                          {a.file_size && <span style={{ fontSize: '12px', color: '#4A6070' }}>{formatBytes(a.file_size)}</span>}
                          <span style={{ fontSize: '12px', color: '#2A3A48' }}>
                            {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                      <button onClick={() => openAsset(a)} disabled={openingAsset === a.id} style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '8px 14px', borderRadius: '8px',
                        background: openingAsset === a.id ? 'rgba(30,200,120,0.1)' : 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.09)',
                        color: openingAsset === a.id ? '#1EC878' : '#fff',
                        fontSize: '13px', fontWeight: '600', cursor: openingAsset === a.id ? 'wait' : 'pointer',
                        transition: 'all 0.15s', flexShrink: 0,
                        fontFamily: "'DM Sans', sans-serif"
                      }}>
                        {openingAsset === a.id
                          ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                          : <Download size={13} />
                        }
                        {openingAsset === a.id ? 'Opening...' : 'Open'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── CREW ──────────────────────────────────────────────────────────── */}
        {tab === 'Crew' && (
          <div style={{ animation: 'fadeIn 0.3s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: '700', margin: '0 0 4px 0' }}>Crew</h2>
                <p style={{ color: '#4A6070', fontSize: '13px', margin: 0 }}>
                  {members.length} {members.length === 1 ? 'person' : 'people'} assigned to this gig.
                </p>
              </div>
              {isPM && (
                <button onClick={() => setShowInvite(true)} style={btnPrimary}>
                  <UserPlus size={14} /> Invite Crew
                </button>
              )}
            </div>

            {members.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <h3 style={{ fontWeight: '700', marginBottom: '8px' }}>No crew assigned</h3>
                <p style={{ color: '#4A6070', fontSize: '13px', marginBottom: '20px' }}>Invite your team to give them access to this gig.</p>
                {isPM && <button onClick={() => setShowInvite(true)} style={btnPrimary}><UserPlus size={14} /> Invite Crew</button>}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {members.map(m => (
                  <div key={m.user_id} style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: '14px', padding: '14px 18px',
                    display: 'flex', alignItems: 'center', gap: '14px',
                    animation: 'fadeIn 0.3s ease'
                  }}>
                    <Avatar uid={m.user_id} initials={initials(m.user_id)} size={42} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '700', fontSize: '15px', marginBottom: '3px' }}>{displayName(m.user_id)}</div>
                      <div style={{ fontSize: '13px', color: '#4A6070' }}>
                        {m.function_title || '—'}
                        {m.call_time && (
                          <span style={{ marginLeft: '10px', color: '#1EC878', fontWeight: '600' }}>
                            <Clock size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px' }} />
                            Call: {m.call_time}
                          </span>
                        )}
                      </div>
                    </div>
                    <RoleBadge role={m.role} large />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── FEED ──────────────────────────────────────────────────────────── */}
        {tab === 'Feed' && (
          <div style={{ animation: 'fadeIn 0.3s ease' }}>
            <div style={{ marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', margin: '0 0 4px 0' }}>Gig Feed</h2>
              <p style={{ color: '#4A6070', fontSize: '13px', margin: 0 }}>Updates, notices and important information for the team.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
              {posts.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#2A3A48', fontSize: '14px' }}>
                  No updates yet. Be the first to post.
                </div>
              )}
              {posts.map(post => (
                <FeedPost key={post.id} post={post} displayName={displayName} initials={initials} large />
              ))}
              <div ref={feedEndRef} />
            </div>

            {/* Post composer */}
            <div style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '14px', padding: '16px',
              position: 'sticky', bottom: '16px',
              backdropFilter: 'blur(12px)'
            }}>
              <textarea
                value={postText}
                onChange={e => setPostText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handlePost() }}
                placeholder="Post an update to the team..."
                rows={2}
                style={{
                  width: '100%', background: 'transparent', border: 'none', outline: 'none',
                  color: '#fff', fontSize: '14px', resize: 'none', lineHeight: '1.6', marginBottom: '10px'
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <button onClick={() => setPostImportant(!postImportant)} style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: postImportant ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)',
                  border: postImportant ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '8px', padding: '6px 12px', cursor: 'pointer',
                  color: postImportant ? '#F87171' : '#4A6070',
                  fontSize: '12px', fontWeight: '600', fontFamily: "'DM Sans', sans-serif",
                  transition: 'all 0.2s'
                }}>
                  <AlertCircle size={13} /> {postImportant ? 'Important' : 'Mark important'}
                </button>
                <button onClick={handlePost} disabled={posting || !postText.trim()} style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: postText.trim() ? 'linear-gradient(135deg, #1EC878, #0FA85A)' : 'rgba(255,255,255,0.05)',
                  border: 'none', borderRadius: '8px', padding: '8px 16px', cursor: postText.trim() ? 'pointer' : 'default',
                  color: postText.trim() ? '#fff' : '#2A3A48',
                  fontSize: '13px', fontWeight: '700', fontFamily: "'DM Sans', sans-serif",
                  transition: 'all 0.2s',
                  boxShadow: postText.trim() ? '0 2px 12px rgba(30,200,120,0.25)' : 'none'
                }}>
                  {posting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />}
                  Post
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── UPLOAD MODAL ──────────────────────────────────────────────────── */}
      {showUpload && (
        <Modal title="Upload Asset" onClose={() => { setShowUpload(false); setUploadForm({ type: 'patch_list', name: '', file: null }) }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Type selector */}
            <div>
              <FieldLabel label="Asset Type" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                {ASSET_TYPES.map(t => {
                  const Icon = t.icon
                  const sel = uploadForm.type === t.value
                  return (
                    <button key={t.value} onClick={() => setUploadForm(f => ({ ...f, type: t.value }))} style={{
                      padding: '10px 8px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                      background: sel ? `${t.color}18` : 'rgba(255,255,255,0.04)',
                      border: sel ? `1px solid ${t.color}50` : '1px solid rgba(255,255,255,0.07)',
                      color: sel ? t.color : '#4A6070',
                      fontFamily: "'DM Sans', sans-serif", fontSize: '12px', fontWeight: '600',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px',
                      transition: 'all 0.15s'
                    }}>
                      <Icon size={16} />
                      {t.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <FieldLabel label="Asset Name *" />
              <input
                value={uploadForm.name}
                onChange={e => setUploadForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Main Stage LX Patch v3"
                style={modalInput}
                autoFocus
              />
            </div>

            {/* Drop zone */}
            <div>
              <FieldLabel label="File *" />
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => {
                  e.preventDefault(); setDragOver(false)
                  const file = e.dataTransfer.files[0]
                  if (file) setUploadForm(f => ({ ...f, file, name: f.name || file.name.split('.')[0] }))
                }}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragOver ? '#1EC878' : uploadForm.file ? 'rgba(30,200,120,0.4)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: '12px', padding: '24px',
                  textAlign: 'center', cursor: 'pointer',
                  background: dragOver ? 'rgba(30,200,120,0.05)' : uploadForm.file ? 'rgba(30,200,120,0.04)' : 'rgba(0,0,0,0.2)',
                  transition: 'all 0.2s'
                }}
              >
                <input ref={fileInputRef} type="file" style={{ display: 'none' }}
                  onChange={e => {
                    const file = e.target.files[0]
                    if (file) setUploadForm(f => ({ ...f, file, name: f.name || file.name.split('.')[0] }))
                  }}
                />
                {uploadForm.file ? (
                  <div>
                    <CheckCircle size={24} color="#1EC878" style={{ marginBottom: '6px' }} />
                    <div style={{ color: '#1EC878', fontWeight: '600', fontSize: '13px' }}>{uploadForm.file.name}</div>
                    <div style={{ color: '#4A6070', fontSize: '12px', marginTop: '2px' }}>{formatBytes(uploadForm.file.size)}</div>
                  </div>
                ) : (
                  <div>
                    <Upload size={24} color="#2A3A48" style={{ marginBottom: '8px' }} />
                    <div style={{ color: '#4A6070', fontSize: '13px' }}>Drop file here or click to browse</div>
                    <div style={{ color: '#2A3A48', fontSize: '12px', marginTop: '4px' }}>PDF, images, XLSX, DWG and more</div>
                  </div>
                )}
              </div>
            </div>

            <button onClick={handleUpload} disabled={uploading || !uploadForm.file || !uploadForm.name.trim()} style={{
              ...btnModal,
              opacity: (!uploadForm.file || !uploadForm.name.trim()) ? 0.5 : 1
            }}>
              {uploading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={16} />}
              {uploading ? 'Uploading...' : 'Upload Asset'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── INVITE MODAL ──────────────────────────────────────────────────── */}
      {showInvite && (
        <Modal title="Invite Crew Member" onClose={() => setShowInvite(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <FieldLabel label="Email Address *" />
              <input
                type="email"
                value={inviteForm.email}
                onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
                placeholder="technician@company.com"
                style={modalInput}
                autoFocus
              />
            </div>
            <div>
              <FieldLabel label="Function / Role on Gig" />
              <input
                value={inviteForm.function_title}
                onChange={e => setInviteForm(f => ({ ...f, function_title: e.target.value }))}
                placeholder="e.g. FOH Engineer, LX Operator, Head Rigger"
                style={modalInput}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <FieldLabel label="Access Level" />
                <select value={inviteForm.role} onChange={e => setInviteForm(f => ({ ...f, role: e.target.value }))} style={{ ...modalInput, cursor: 'pointer' }}>
                  <option value="pm">Production Manager</option>
                  <option value="crew">Crew</option>
                  <option value="viewer">Viewer (read-only)</option>
                </select>
              </div>
              <div>
                <FieldLabel label="Call Time" />
                <input
                  type="time"
                  value={inviteForm.call_time}
                  onChange={e => setInviteForm(f => ({ ...f, call_time: e.target.value }))}
                  style={modalInput}
                />
              </div>
            </div>
            <div style={{
              padding: '10px 13px', borderRadius: '9px',
              background: 'rgba(30,200,120,0.07)', border: '1px solid rgba(30,200,120,0.15)',
              fontSize: '12px', color: '#4A6070', lineHeight: '1.6'
            }}>
              💡 They'll receive an email with a magic link to join this gig directly — no password needed.
            </div>
            <button onClick={handleInvite} disabled={inviting || !inviteForm.email.trim()} style={btnModal}>
              {inviting ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} />}
              Send Invite
            </button>
          </div>
        </Modal>
      )}

      {/* ── EDIT GIG MODAL ────────────────────────────────────────────────── */}
      {showEditGig && (
        <Modal title="Edit Gig" onClose={() => setShowEditGig(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <FieldLabel label="Gig Name *" />
              <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Gig name" style={modalInput} autoFocus />
            </div>
            <div>
              <FieldLabel label="Venue" />
              <input value={editForm.venue} onChange={e => setEditForm(f => ({ ...f, venue: e.target.value }))}
                placeholder="Venue name and city" style={modalInput} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <FieldLabel label="Start Date" />
                <input type="date" value={editForm.start_date} onChange={e => setEditForm(f => ({ ...f, start_date: e.target.value }))} style={modalInput} />
              </div>
              <div>
                <FieldLabel label="End Date" />
                <input type="date" value={editForm.end_date} onChange={e => setEditForm(f => ({ ...f, end_date: e.target.value }))} style={modalInput} />
              </div>
            </div>
            <div>
              <FieldLabel label="Status" />
              <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))} style={{ ...modalInput, cursor: 'pointer' }}>
                <option value="draft">Draft</option>
                <option value="confirmed">Confirmed</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div>
              <FieldLabel label="Description" />
              <textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Brief overview of the production..." rows={3}
                style={{ ...modalInput, resize: 'vertical', lineHeight: '1.5' }} />
            </div>
            <button onClick={saveGig} disabled={savingGig || !editForm.name?.trim()} style={btnModal}>
              {savingGig ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={16} />}
              Save Changes
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Avatar({ uid, initials, size = 32 }) {
  const colors = ['#1EC878', '#3B82F6', '#8B5CF6', '#F59E0B', '#EC4899', '#06B6D4']
  const colorIdx = uid ? uid.charCodeAt(0) % colors.length : 0
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `${colors[colorIdx]}30`, border: `1px solid ${colors[colorIdx]}50`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.35, fontWeight: '700', color: colors[colorIdx]
    }}>{initials}</div>
  )
}

function RoleBadge({ role, large = false }) {
  const cfg = {
    pm:     { label: 'PM',     color: '#1EC878', bg: 'rgba(30,200,120,0.12)' },
    crew:   { label: 'Crew',   color: '#4A6070', bg: 'rgba(74,96,112,0.12)' },
    viewer: { label: 'Viewer', color: '#374151', bg: 'rgba(55,65,81,0.12)' },
  }[role] || { label: role, color: '#4A6070', bg: 'rgba(74,96,112,0.12)' }
  return (
    <span style={{
      fontSize: large ? '12px' : '11px', fontWeight: '700',
      padding: large ? '4px 10px' : '2px 8px', borderRadius: '20px',
      color: cfg.color, background: cfg.bg,
      textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap'
    }}>{cfg.label}</span>
  )
}

function FeedPost({ post, displayName, initials, large = false }) {
  return (
    <div style={{
      padding: large ? '14px 16px' : '10px 12px',
      borderRadius: '12px',
      background: post.is_important ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.03)',
      border: post.is_important ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(255,255,255,0.06)',
      animation: 'fadeIn 0.3s ease'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <Avatar uid={post.user_id} initials={initials(post.user_id)} size={24} />
        <span style={{ fontSize: '13px', fontWeight: '600' }}>{displayName(post.user_id)}</span>
        {post.is_important && (
          <span style={{
            fontSize: '10px', fontWeight: '700', padding: '2px 7px', borderRadius: '20px',
            color: '#F87171', background: 'rgba(239,68,68,0.15)',
            textTransform: 'uppercase', letterSpacing: '0.05em'
          }}>Important</span>
        )}
        <span style={{ fontSize: '11px', color: '#2A3A48', marginLeft: 'auto' }}>
          {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
        </span>
      </div>
      <p style={{ margin: 0, fontSize: large ? '14px' : '13px', color: '#8A9BAE', lineHeight: '1.6', paddingLeft: '32px' }}>
        {post.content}
      </p>
    </div>
  )
}

function SectionTitle({ icon, title }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: 0 }}>
      <span style={{ color: '#4A6070' }}>{icon}</span>
      <span style={{ fontSize: '13px', fontWeight: '700', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</span>
    </div>
  )
}

function SmallBtn({ onClick, icon, label }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: '5px',
      padding: '5px 11px', borderRadius: '8px',
      background: 'rgba(30,200,120,0.1)', border: '1px solid rgba(30,200,120,0.2)',
      color: '#1EC878', fontSize: '12px', fontWeight: '600',
      fontFamily: "'DM Sans', sans-serif", cursor: 'pointer'
    }}>
      {icon} {label}
    </button>
  )
}

function EmptyMini({ text }) {
  return <p style={{ color: '#2A3A48', fontSize: '13px', margin: 0, textAlign: 'center', padding: '12px 0' }}>{text}</p>
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: '#0F1520', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '18px', padding: '26px', width: '100%', maxWidth: '500px',
        maxHeight: '90vh', overflowY: 'auto',
        animation: 'slideUp 0.25s ease'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '17px', fontWeight: '700', margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4A6070', padding: '4px', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function FieldLabel({ label }) {
  return (
    <label style={{
      display: 'block', fontSize: '12px', fontWeight: '600',
      color: '#4A6070', textTransform: 'uppercase',
      letterSpacing: '0.05em', marginBottom: '6px'
    }}>{label}</label>
  )
}

function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const card = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: '16px', padding: '18px 20px'
}

const btnPrimary = {
  display: 'inline-flex', alignItems: 'center', gap: '7px',
  padding: '10px 18px', borderRadius: '10px', border: 'none', cursor: 'pointer',
  background: 'linear-gradient(135deg, #1EC878, #0FA85A)',
  color: '#fff', fontWeight: '700', fontSize: '14px',
  fontFamily: "'DM Sans', sans-serif",
  boxShadow: '0 4px 16px rgba(30,200,120,0.25)',
  transition: 'all 0.2s', whiteSpace: 'nowrap'
}

const btnModal = {
  ...btnPrimary, width: '100%',
  justifyContent: 'center', padding: '13px', fontSize: '15px'
}

const modalInput = {
  width: '100%', padding: '10px 13px',
  background: 'rgba(0,0,0,0.4)',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: '9px', color: '#fff',
  fontSize: '14px', outline: 'none',
}

const linkBtn = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: '#1EC878', fontSize: '12px', fontWeight: '600',
  fontFamily: "'DM Sans', sans-serif", padding: '4px 0',
  display: 'block', width: '100%', textAlign: 'left'
}
