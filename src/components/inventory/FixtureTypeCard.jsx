import { useCallback, useEffect, useState } from 'react'
import { FileUp, AlertTriangle } from 'lucide-react'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { saveFixtureType, fixtureTypesFor } from '../../lib/fixtureTypes'
import { t } from '../../i18n'
import { HintLabel } from '../help/HelpParts'
import { Modal, Section, btn, btnPrimary, input, label, card, colors, AvxLoader, space } from '../ui'

const figures = (kg, w) => [kg != null ? `${Number(kg)} kg` : null, w != null ? `${w} W` : null].filter(Boolean).join(' · ')
const modeText = m => `${m.name} · ${m.footprint ? t('dmx.channelsShort', { count: m.footprint }) : t('gdtf.channelsUnknown')}`

// A catalogue item's fixture type from its GDTF file (step 14): modes and their footprints for the
// DMX patch, weight and power for the item. Shown when the item has one; the page's ⋯ menu opens
// the dialog to add one (adding: true).
export default function FixtureTypeCard({ orgId, item, adding, onCloseAdding, onItemChanged }) {
  const [type, setType] = useState(undefined)
  const [open, setOpen] = useState(false)
  const load = useCallback(() => fixtureTypesFor([item.id]).then(rows => setType(rows[0] || null)), [item.id])
  useEffect(() => { load() }, [load])
  const close = () => { setOpen(false); onCloseAdding?.() }

  return (
    <>
      {type && (
        <Section id="item-gdtf" title={t('gdtf.title')}
          aside={<button type="button" onClick={() => setOpen(true)} style={{ ...btn, padding: '4px 8px', fontSize: '13px' }}><FileUp size={13} aria-hidden="true" /> {t('gdtf.replace')}</button>}>
          <p style={{ fontSize: '14px', marginBottom: space[2] }}>
            <strong>{[type.manufacturer, type.name].filter(Boolean).join(' ')}</strong>
            {type.file_name && <span style={{ color: colors.soft, fontSize: '13px' }}> · {type.file_name}</span>}
          </p>
          {figures(type.weight_kg, type.power_w) && <p style={{ fontSize: '13px', color: colors.soft, marginBottom: space[2] }}>{t('gdtf.fileFigures', { figures: figures(type.weight_kg, type.power_w) })}</p>}
          <h3 style={{ ...label, marginBottom: space[1] }}>{t('gdtf.modes')}</h3>
          <ul style={{ paddingLeft: '16px', fontSize: '14px', lineHeight: 1.6 }}>
            {(type.modes || []).map(m => <li key={m.name}>{modeText(m)}</li>)}
          </ul>
        </Section>
      )}
      {(open || adding) && <GdtfDialog orgId={orgId} item={item} onClose={close} onSaved={() => { close(); load(); onItemChanged?.() }} />}
    </>
  )
}

function GdtfDialog({ orgId, item, onClose, onSaved }) {
  const { notify } = useToast()
  const [lib, setLib] = useState(null)
  const [read, setRead] = useState(null) // { gdtf, bytes, name }
  const [problem, setProblem] = useState('')
  const [useFigures, setUseFigures] = useState(item.weight_kg == null || item.power_w == null)
  const [saving, setSaving] = useState(false)
  useEffect(() => { import('../../lib/mvr').then(setLib) }, [])

  async function choose(e) {
    const f = e.target.files?.[0]
    if (!f || !lib) return
    setProblem('')
    try {
      const bytes = new Uint8Array(await f.arrayBuffer())
      setRead({ gdtf: lib.parseGdtf(bytes), bytes, name: f.name })
    } catch (err) {
      logger.warn('gdtf', err?.message || 'read failed', { step: 'parse' })
      setRead(null)
      setProblem(t('gdtf.unreadable'))
    }
  }

  async function save() {
    setSaving(true)
    const { error } = await saveFixtureType({ orgId, itemId: item.id, gdtf: read.gdtf, bytes: read.bytes, fileName: read.name, useFigures })
    setSaving(false)
    if (error) { logger.error('gdtf', error, { step: 'save' }); return notify(userMessage(error), 'error') }
    track('gdtf:save')
    notify(t('gdtf.saved'), 'success')
    onSaved()
  }

  const fileFigures = read ? figures(read.gdtf.weightKg, read.gdtf.powerW) : ''
  return (
    <Modal title={t('gdtf.title')} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <HintLabel htmlFor="gdtf-file" hint="gdtf-file">{t('gdtf.choose')}</HintLabel>
          <input id="gdtf-file" type="file" accept=".gdtf" onChange={choose} disabled={!lib || saving} style={{ ...input, padding: '8px' }} />
          <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5, marginTop: '4px' }}>{t('gdtf.chooseHint')}</p>
        </div>
        {problem && <p role="alert" style={{ ...card, borderColor: 'var(--warn)', color: 'var(--warn)', fontSize: '14px', display: 'flex', gap: '8px' }}><AlertTriangle size={15} aria-hidden="true" style={{ flexShrink: 0 }} /> {problem}</p>}
        {read && (
          <>
            <div role="status">
              <strong style={{ fontSize: '14px' }}>{[read.gdtf.manufacturer, read.gdtf.name].filter(Boolean).join(' ')}</strong>
              <h3 style={{ ...label, margin: '8px 0 4px' }}>{t('gdtf.modes')}</h3>
              <ul style={{ paddingLeft: '16px', fontSize: '14px', lineHeight: 1.6 }}>
                {read.gdtf.modes.map(m => <li key={m.name}>{modeText(m)}</li>)}
              </ul>
            </div>
            {fileFigures && (
              <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '14px', lineHeight: 1.5 }}>
                <input type="checkbox" checked={useFigures} onChange={e => setUseFigures(e.target.checked)} style={{ marginTop: '4px' }} />
                <span>
                  {t('gdtf.useFigures', { figures: fileFigures })}
                  {figures(item.weight_kg, item.power_w) && <span style={{ display: 'block', fontSize: '13px', color: colors.soft }}>{t('gdtf.nowFigures', { figures: figures(item.weight_kg, item.power_w) })}</span>}
                </span>
              </label>
            )}
            <button type="button" onClick={save} disabled={saving} style={{ ...btnPrimary, justifyContent: 'center' }}>{saving && <AvxLoader size={15} />} {t('common.save')}</button>
          </>
        )}
      </div>
    </Modal>
  )
}
