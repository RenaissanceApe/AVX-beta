import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { selectAll } from '../../lib/selectAll'
import { logger } from '../../lib/logger'
import { t } from '../../i18n'
import { input } from '../ui'
import { HintLabel } from '../help/HelpParts'

// The gig's client, from Contacts. Only admins and members can read clients, so for anyone else
// (and an organisation with no clients yet) the field isn't shown.
export default function GigClientField({ orgId, value, onChange, idPrefix = 'gig' }) {
  const [clients, setClients] = useState(null)
  useEffect(() => {
    let live = true
    selectAll(() => supabase.from('clients').select('id, name, archived_at').eq('org_id', orgId).order('name').order('id'))
      .then(({ data, error }) => {
        if (error) logger.error('gig', error, { step: 'loadClients' })
        if (live) setClients(data || [])
      })
    return () => { live = false }
  }, [orgId])
  const shown = (clients || []).filter(c => !c.archived_at || c.id === value)
  if (!shown.length) return null
  const id = `${idPrefix}-client`
  return (
    <div>
      <HintLabel htmlFor={id} hint="gig-client">{t('gigForm.client')}</HintLabel>
      <select id={id} value={value || ''} onChange={e => onChange(e.target.value || null)} style={{ ...input, cursor: 'pointer' }}>
        <option value="">{t('gigForm.noClient')}</option>
        {shown.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </div>
  )
}
