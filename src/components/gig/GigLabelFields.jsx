import { useI18n } from '../../i18n'
import { input, label } from '../ui'
import { HintLabel } from '../help/HelpParts'
import { BASE_STATUSES } from '../../lib/gigLabels'

const select = { ...input, cursor: 'pointer' }

// Status (the organisation's own when it has some, else the built-in ones) and gig type, for the
// new-gig and edit-gig forms (docs/TOOLS_PLAN.md step 6, S1).
//   value: { status, custom_status_id, gig_type_id }   onChange(patch)
export default function GigLabelFields({ idPrefix, labels, value, onChange }) {
  const { t } = useI18n()
  const { statuses = [], types = [] } = labels || {}
  const own = statuses.length > 0
  // A gig whose built-in status has no custom one (e.g. "active" when none stands for it) still shows
  const currentMissing = own && !statuses.some(s => s.id === value.custom_status_id)
  return (
    <>
      <div>
        <HintLabel htmlFor={`${idPrefix}-status`} hint="gig-status">{t('gigForm.status')}</HintLabel>
        {own ? (
          <select id={`${idPrefix}-status`} value={value.custom_status_id || ''} style={select}
            onChange={e => { const s = statuses.find(x => x.id === e.target.value); if (s) onChange({ custom_status_id: s.id, status: s.base_status }) }}>
            {currentMissing && <option value="">{t(`status.${value.status || 'draft'}`)}</option>}
            {statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        ) : (
          <select id={`${idPrefix}-status`} value={value.status} onChange={e => onChange({ status: e.target.value, custom_status_id: null })} style={select}>
            {BASE_STATUSES.map(s => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
          </select>
        )}
      </div>
      {types.length > 0 && (
        <div>
          <label style={label} htmlFor={`${idPrefix}-type`}>{t('gigForm.type')}</label>
          <select id={`${idPrefix}-type`} value={value.gig_type_id || ''} onChange={e => onChange({ gig_type_id: e.target.value || null })} style={select}>
            <option value="">{t('gigForm.noType')}</option>
            {types.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </div>
      )}
    </>
  )
}
