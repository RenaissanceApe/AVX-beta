import { useState } from 'react'
import { Loader2, CheckCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { useI18n } from '../../i18n'
import { Modal, btnPrimary, input, label } from '../ui'
import GigLabelFields from './GigLabelFields'
import { useGigLabels } from '../../lib/gigLabels'
import { DangerZone, DangerConfirmModal } from '../DangerConfirm'
import { removeGigFiles } from '../../lib/storage'
import { OwnClashWarning } from './Booking'

// What deleting a gig destroys, as readable lines for the confirmation dialog
async function gigDeletionImpact(gigId, t) {
  const count = table => supabase.from(table).select('*', { count: 'exact', head: true }).eq('gig_id', gigId).then(r => r.count || 0)
  const [files, posts, crew, schedule, quotes] = await Promise.all([
    count('assets'), count('feed_posts'), count('gig_members'), count('gig_schedule'), count('quotes'),
  ])
  return [
    t('danger.gigFiles', { count: files }),
    t('danger.gigPosts', { count: posts }),
    t('danger.gigSchedule', { count: schedule }),
    t('danger.gigCrew', { count: crew }),
    t('danger.gigHistory'),
    ...(quotes ? [t('danger.gigQuotes', { count: quotes })] : []),
  ]
}

export default function EditGigModal({ gig, canDelete = false, onClose, onSaved, onDeleted }) {
  const { t } = useI18n()
  const { notify } = useToast()
  const [form, setForm] = useState({
    name: gig.name, venue: gig.venue || '', start_date: gig.start_date || '', end_date: gig.end_date || '',
    description: gig.description || '', status: gig.status,
    custom_status_id: gig.custom_status_id || null, gig_type_id: gig.gig_type_id || null,
  })
  const labels = useGigLabels(gig.org_id)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }))

  async function save(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    // Empty date inputs must be sent as null, not ''
    const changes = { ...form, name: form.name.trim(), start_date: form.start_date || null, end_date: form.end_date || null }
    const { error } = await supabase.from('gigs').update(changes).eq('id', gig.id)
    setSaving(false)
    if (error) {
      logger.error('gig', error, { step: 'saveGig', gigId: gig.id })
      return notify(t('gig.saveFailed', { reason: userMessage(error) }), 'error')
    }
    onSaved(changes)
    onClose()
  }

  async function deleteGig() {
    await removeGigFiles([gig.id])
    const { data, error } = await supabase.from('gigs').delete().eq('id', gig.id).select('id')
    if (error) {
      logger.error('gig', error, { step: 'deleteGig', gigId: gig.id })
      throw error
    }
    if (!data?.length) throw new Error(t('error.permission'))
    onDeleted()
  }

  if (confirmDelete) return (
    <DangerConfirmModal title={t('danger.deleteGigTitle', { name: gig.name })} name={gig.name}
      loadImpact={() => gigDeletionImpact(gig.id, t)} onConfirm={deleteGig} onClose={() => setConfirmDelete(false)} />
  )

  return (
    <Modal title={t('gig.edit')} onClose={onClose}>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <label style={label} htmlFor="eg-name">{t('gigForm.name')} *</label>
          <input id="eg-name" value={form.name} onChange={set('name')} maxLength={200} style={input} autoFocus required />
        </div>
        <div>
          <label style={label} htmlFor="eg-venue">{t('gigForm.venue')}</label>
          <input id="eg-venue" value={form.venue} onChange={set('venue')} placeholder={t('gigForm.venuePlaceholder')} maxLength={300} style={input} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '12px' }}>
          <div>
            <label style={label} htmlFor="eg-start">{t('gigForm.start')}</label>
            <input id="eg-start" type="date" value={form.start_date} onChange={set('start_date')} style={input} />
          </div>
          <div>
            <label style={label} htmlFor="eg-end">{t('gigForm.end')}</label>
            <input id="eg-end" type="date" value={form.end_date} onChange={set('end_date')} style={input} />
          </div>
        </div>
        <OwnClashWarning startDate={form.start_date} endDate={form.end_date} excludeGig={gig.id} />
        <GigLabelFields idPrefix="eg" labels={labels} value={form} onChange={patch => setForm(f => ({ ...f, ...patch }))} />
        <div>
          <label style={label} htmlFor="eg-desc">{t('gigForm.description')}</label>
          <textarea id="eg-desc" value={form.description} onChange={set('description')} placeholder={t('gigForm.descriptionPlaceholder')}
            rows={3} maxLength={5000} style={{ ...input, resize: 'vertical', lineHeight: 1.5 }} />
        </div>
        <button type="submit" disabled={saving || !form.name.trim()} style={{ ...btnPrimary, justifyContent: 'center', padding: '13px' }}>
          {saving ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={16} />} {t('common.saveChanges')}
        </button>
      </form>
      {canDelete && (
        <DangerZone description={t('danger.gigZoneText')} actionLabel={t('danger.deleteGig')} onAction={() => setConfirmDelete(true)} />
      )}
    </Modal>
  )
}
