import { useState } from 'react'
import { Loader2, CheckCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { removeGigFiles } from '../lib/storage'
import { useI18n } from '../i18n'
import { Modal, btnPrimary, input, label, colors } from './ui'
import { DangerZone, DangerConfirmModal } from './DangerConfirm'

// What deleting an organisation destroys, as readable lines for the confirmation dialog
async function orgDeletionImpact(orgId, t) {
  const count = (table, column = 'org_id') => supabase.from(table).select('*', { count: 'exact', head: true }).eq(column, orgId).then(r => r.count || 0)
  const [gigs, members, quotes, templates, prices] = await Promise.all([
    count('gigs'), count('org_members'), count('quotes'), count('quote_templates'), count('price_items'),
  ])
  return [
    t('danger.orgGigs', { count: gigs }),
    t('danger.orgMembers', { count: members }),
    t('danger.orgQuotes', { count: quotes }),
    t('danger.orgTemplates', { count: templates + prices }),
    t('danger.orgBranding'),
  ]
}

// Organisation settings for admins: name, equipment prep/return days, and (well hidden) deletion.
export default function OrgSettingsModal({ org, onClose, onChanged, onDeleted }) {
  const { t } = useI18n()
  const { notify } = useToast()
  const [name, setName] = useState(org.name)
  const [prep, setPrep] = useState(String(org.equipment_prep_days ?? 0))
  const [ret, setRet] = useState(String(org.equipment_return_days ?? 0))
  const days = v => Math.min(14, Math.max(0, Math.round(Number(v) || 0)))
  const changed = name.trim() !== org.name || days(prep) !== (org.equipment_prep_days ?? 0) || days(ret) !== (org.equipment_return_days ?? 0)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function save(e) {
    e.preventDefault()
    if (!name.trim() || !changed) return
    setSaving(true)
    const { error } = await supabase.from('organisations')
      .update({ name: name.trim(), equipment_prep_days: days(prep), equipment_return_days: days(ret) }).eq('id', org.id)
    setSaving(false)
    if (error) {
      logger.error('org', error, { step: 'rename', orgId: org.id })
      return notify(userMessage(error), 'error')
    }
    notify(t('orgSettings.saved'), 'success')
    onChanged()
  }

  async function deleteOrganisation() {
    const { data: gigs, error: gigsError } = await supabase.from('gigs').select('id').eq('org_id', org.id)
    if (gigsError) throw gigsError
    await removeGigFiles((gigs || []).map(g => g.id))
    const { data, error } = await supabase.from('organisations').delete().eq('id', org.id).select('id')
    if (error) {
      logger.error('org', error, { step: 'deleteOrg', orgId: org.id })
      throw error
    }
    if (!data?.length) throw new Error(t('error.permission'))
    notify(t('org.deleted', { org: org.name }), 'success')
    onDeleted()
  }

  if (confirmDelete) return (
    <DangerConfirmModal title={t('danger.deleteOrgTitle', { name: org.name })} name={org.name}
      loadImpact={() => orgDeletionImpact(org.id, t)} onConfirm={deleteOrganisation} onClose={() => setConfirmDelete(false)} />
  )

  return (
    <Modal title={t('orgSettings.title', { org: org.name })} onClose={onClose}>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div>
          <label style={label} htmlFor="org-name">{t('dash.orgName')}</label>
          <input id="org-name" value={name} onChange={e => setName(e.target.value)} maxLength={120} style={input} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <label style={label} htmlFor="org-prep">{t('orgSettings.prepDays')}</label>
            <input id="org-prep" type="number" min={0} max={14} value={prep} onChange={e => setPrep(e.target.value)} style={input} />
          </div>
          <div>
            <label style={label} htmlFor="org-return">{t('orgSettings.returnDays')}</label>
            <input id="org-return" type="number" min={0} max={14} value={ret} onChange={e => setRet(e.target.value)} style={input} />
          </div>
        </div>
        <p style={{ fontSize: '12px', color: colors.muted, lineHeight: 1.5, marginTop: '-4px' }}>{t('orgSettings.equipmentDaysHint')}</p>
        <button type="submit" disabled={saving || !name.trim() || !changed} style={{ ...btnPrimary, justifyContent: 'center' }}>
          {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={15} />} {t('common.saveChanges')}
        </button>
        <p style={{ fontSize: '12px', color: colors.muted, lineHeight: 1.5 }}>{t('orgSettings.companyHint')}</p>
      </form>
      <DangerZone description={t('danger.orgZoneText')} actionLabel={t('org.delete')} onAction={() => setConfirmDelete(true)} />
    </Modal>
  )
}
