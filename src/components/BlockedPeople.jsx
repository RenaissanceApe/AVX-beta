import { useEffect, useState } from 'react'
import { Ban } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { track } from '../lib/usage'
import { t } from '../i18n'

// Account → People you blocked (docs/MESSAGING.md, M6a). Shown only when there's someone.
export default function BlockedPeople({ style }) {
  const { notify } = useToast()
  const [rows, setRows] = useState([])

  useEffect(() => {
    supabase.rpc('my_blocks').then(({ data, error }) => {
      if (error) return logger.error('blocks', error, { step: 'load' })
      setRows(data || [])
    })
  }, [])

  async function unblock(r) {
    const { error } = await supabase.rpc('block_user', { p_user: r.user_id, p_block: false })
    if (error) return notify(userMessage(error), 'error')
    track('messages:unblocked')
    setRows(list => list.filter(x => x.user_id !== r.user_id))
    notify(t('chat.block.undone', { name: r.full_name || t('common.someone') }), 'success')
  }

  if (!rows.length) return null
  return (
    <div style={style}>
      <span style={{ fontWeight: 600, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}><Ban size={14} /> {t('account.blocked')}</span>
      <span style={{ display: 'block', color: '#4A6070', fontSize: '12px', marginTop: '3px', lineHeight: 1.5 }}>{t('account.blockedHint')}</span>
      <ul style={{ listStyle: 'none', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {rows.map(r => (
          <li key={r.user_id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.full_name || t('common.someone')}</span>
            <button type="button" onClick={() => unblock(r)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: '#9FB0C0', padding: '4px 10px', fontSize: '12px', cursor: 'pointer' }}>
              {t('chat.block.unblock')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
