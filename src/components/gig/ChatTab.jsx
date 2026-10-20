import { useEffect, useState } from 'react'
import { Loader2, Hash, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { logger, userMessage } from '../../lib/logger'
import { useToast } from '../../lib/ToastContext'
import { departmentLabel } from '../../lib/messages'
import { t } from '../../i18n'
import Conversation from '../messages/Conversation'
import { card, colors } from '../ui'

// The gig's chat (MESSAGING.md, M1–M3): everyone on the gig talks in the main channel, where
// changes to the gig's status, dates and venue show up too. Each function on the gig (Sound,
// Light…) and its managers also have a department channel, seen only by those people and the
// gig's managers. Viewers can read the main channel but not post.
export default function ChatTab({ gigId, canPost }) {
  const { notify } = useToast()
  const [mainId, setMainId] = useState(null)
  const [departments, setDepartments] = useState([])
  const [selected, setSelected] = useState('all')
  const [departmentId, setDepartmentId] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setSelected('all'); setDepartmentId(null)
    supabase.rpc('gig_conversation', { p_gig: gigId }).then(({ data, error }) => {
      if (cancelled) return
      if (error) { logger.warn('messages', 'Gig channel failed', { code: error.code }); return setFailed(true) }
      setMainId(data)
    })
    supabase.rpc('gig_departments', { p_gig: gigId }).then(({ data, error }) => {
      if (cancelled) return
      if (error) logger.warn('messages', 'Departments failed', { code: error.code })
      setDepartments(data || [])
    })
    return () => { cancelled = true }
  }, [gigId])

  async function open(department) {
    setSelected(department)
    if (department === 'all') return setDepartmentId(null)
    setDepartmentId(null)
    const { data, error } = await supabase.rpc('department_channel', { p_gig: gigId, p_department: department })
    if (error) { setSelected('all'); return notify(userMessage(error), 'error') }
    setDepartmentId(data)
  }

  if (failed) return <p style={{ color: colors.muted, fontSize: '14px', textAlign: 'center', padding: '40px 16px' }}>{t('chat.unavailable')}</p>
  if (!mainId) return <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><Loader2 size={20} color={colors.accentText} style={{ animation: 'spin 1s linear infinite' }} /></div>
  const chip = active => ({
    display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '16px', font: 'inherit', fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
    border: `1px solid ${active ? colors.accent : colors.border}`, background: active ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent', color: active ? colors.accentText : colors.soft,
  })
  const conversationId = selected === 'all' ? mainId : departmentId
  return (
    <div style={{ ...card, padding: '10px 12px' }}>
      {departments.length > 0 && (
        <div role="tablist" aria-label={t('chat.channels')} style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '8px', marginBottom: '4px', borderBottom: `1px solid ${colors.border}` }}>
          <button role="tab" aria-selected={selected === 'all'} onClick={() => open('all')} style={chip(selected === 'all')}><Hash size={13} /> {t('chat.dept.all')}</button>
          {departments.map(d => (
            <button key={d.department} role="tab" aria-selected={selected === d.department} onClick={() => open(d.department)} style={chip(selected === d.department)}
              title={t('chat.dept.people', { count: d.people })}>
              <Users size={13} /> {departmentLabel(d.department, d.label, t)} <span style={{ color: colors.muted, fontWeight: 400 }}>{d.people}</span>
            </button>
          ))}
        </div>
      )}
      {!conversationId ? <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><Loader2 size={20} color={colors.accentText} style={{ animation: 'spin 1s linear infinite' }} /></div> : (
        <Conversation key={conversationId} conversationId={conversationId} canPost={selected === 'all' ? canPost : true} height="62vh"
          emptyText={selected === 'all' ? t('chat.emptyGig') : t('chat.emptyDepartment', { name: departmentLabel(selected, departments.find(d => d.department === selected)?.label, t) })} />
      )}
    </div>
  )
}
