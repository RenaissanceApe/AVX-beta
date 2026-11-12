import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { logger } from '../../lib/logger'
import { track } from '../../lib/usage'
import { bridlesOf } from '../../lib/bridle'
import { hardwareOf, hardwareKind, hardwareInUse, HARDWARE_KINDS, HARDWARE_LIMITS } from '../../lib/riggingHardware'
import { t } from '../../i18n'
import { btn, input, label, iconBtn, card, colors } from '../ui'
import EmptyState from '../EmptyState'
import { NumberField, TextField } from './RigFields'
import BridleCard from './BridleCard'

const uid = p => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

// RG2 in a gig's rigging tool: the bridles (gig_show.rigging.bridles) and the rigging hardware
// list (gig_show.rigging.hardware: shackles, slings, steels, spansets with their WLL). Hardware can
// come from the gig's equipment; each bridle leg picks its weakest piece from the list.
export default function BridlesAndHardware({ gig, rigging, onSave, canEdit }) {
  const bridles = useMemo(() => bridlesOf(rigging), [rigging])
  const hardware = useMemo(() => hardwareOf(rigging), [rigging])
  const used = useMemo(() => hardwareInUse(bridles), [bridles])
  const saveBridles = list => onSave({ bridles: list })
  const saveHardware = list => onSave({ hardware: list })
  const editBridle = (id, patch) => saveBridles(bridles.map(b => (b.id === id ? { ...b, ...patch } : b)))
  const editHw = (id, patch) => saveHardware(hardware.map(h => (h.id === id ? { ...h, ...patch } : h)))

  // Rigging hardware in the gig's equipment, not yet in the list
  const [equipment, setEquipment] = useState([])
  useEffect(() => {
    if (!canEdit) return
    supabase.from('gig_equipment').select('id, item_id, item_name, quantity').eq('gig_id', gig.id).limit(500)
      .then(({ data, error }) => {
        if (error) return logger.warn('rigging', error, { step: 'hardware' })
        setEquipment((data || []).filter(l => hardwareKind(l.item_name)))
      })
  }, [canEdit, gig.id])
  const fresh = equipment.filter(l => !hardware.some(h => h.item_id && h.item_id === (l.item_id || l.id)))

  function addFromEquipment() {
    const room = HARDWARE_LIMITS.items - hardware.length
    const add = fresh.slice(0, room).map(l => ({
      id: uid('h'), kind: hardwareKind(l.item_name), name: l.item_name, wll_kg: null, qty: Number(l.quantity) || 1, item_id: l.item_id || l.id, source: '',
    }))
    saveHardware([...hardware, ...add])
    track('rigging:hardwareFromEquipment')
  }

  function addBridle() {
    saveBridles([...bridles, { id: uid('b'), name: t('bridle.newName', { n: bridles.length + 1 }), mode: 'legs', span: 2, rise: 0, leg1: 1.5, leg2: 1.5, x: null, depth: null, load: 0, hw1: null, hw2: null }])
    track('rigging:addBridle')
  }

  return (
    <>
      <section aria-labelledby="rig-bridles" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
          <h3 id="rig-bridles" style={label}>{t('bridle.list')}</h3>
          {canEdit && bridles.length < 40 && <button type="button" onClick={addBridle} style={{ ...btn, padding: '6px 10px', marginLeft: 'auto' }}><Plus size={14} /> {t('bridle.add')}</button>}
        </div>
        <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5, marginBottom: '8px' }}>{t('bridle.intro')}</p>
        {bridles.length === 0 ? (
          <EmptyState compact title={t('bridle.emptyTitle')} body={canEdit ? t('bridle.emptyEditor') : t('bridle.emptyReader')} guide="pm-bridles" />
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {bridles.map(b => (
              <li key={b.id}>
                <BridleCard value={b} idPrefix={`br-${b.id}`} hardware={hardware} canEdit={canEdit} onChange={patch => editBridle(b.id, patch)}
                  onRemove={() => saveBridles(bridles.filter(x => x.id !== b.id))} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="rig-hardware" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
          <h3 id="rig-hardware" style={label}>{t('hw.title')}</h3>
          {canEdit && hardware.length < HARDWARE_LIMITS.items && (
            <button type="button" onClick={() => saveHardware([...hardware, { id: uid('h'), kind: 'shackle', name: '', wll_kg: null, qty: 1, item_id: null, source: '' }])} style={{ ...btn, padding: '6px 10px', marginLeft: 'auto' }}>
              <Plus size={14} /> {t('hw.add')}
            </button>
          )}
        </div>
        <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5, marginBottom: '8px' }}>{t('hw.intro')}</p>
        {canEdit && fresh.length > 0 && (
          <p style={{ fontSize: '13px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '8px' }}>
            {t('hw.inEquipment', { count: fresh.length })}
            <button type="button" onClick={addFromEquipment} style={{ ...btn, padding: '4px 8px' }}>{t('hw.addFromEquipment')}</button>
          </p>
        )}
        {hardware.length === 0 ? (
          <EmptyState compact title={t('hw.emptyTitle')} body={canEdit ? t('hw.emptyEditor') : t('hw.emptyReader')} guide="pm-bridles" />
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {hardware.map(h => {
              const short = (used[h.id] || 0) > h.qty
              return (
                <li key={h.id} style={{ ...card, padding: '8px 12px', fontSize: '13px', lineHeight: 1.5 }}>
                  {canEdit ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '8px', alignItems: 'end' }}>
                      <div>
                        <label style={label} htmlFor={`hw-kind-${h.id}`}>{t('hw.kind')}</label>
                        <select id={`hw-kind-${h.id}`} value={h.kind} onChange={e => editHw(h.id, { kind: e.target.value })} style={{ ...input, appearance: 'auto' }}>
                          {HARDWARE_KINDS.map(k => <option key={k} value={k}>{t(`hw.kind.${k}`)}</option>)}
                        </select>
                      </div>
                      <TextField id={`hw-name-${h.id}`} text={t('hw.name')} value={h.name} max={80} onSave={v => editHw(h.id, { name: v })} />
                      <NumberField id={`hw-wll-${h.id}`} hint="hw-wll" text={t('hw.wll')} value={h.wll_kg} empty range={HARDWARE_LIMITS.wll_kg} step={1} onSave={v => editHw(h.id, { wll_kg: v })} />
                      <NumberField id={`hw-qty-${h.id}`} text={t('hw.qty')} value={h.qty} range={HARDWARE_LIMITS.qty} step={1} onSave={v => editHw(h.id, { qty: v })} />
                      <TextField id={`hw-src-${h.id}`} text={t('hw.source')} value={h.source} max={120} onSave={v => editHw(h.id, { source: v })} />
                      <button type="button" onClick={() => saveHardware(hardware.filter(x => x.id !== h.id))} aria-label={t('inputs.remove', { name: h.name || t(`hw.kind.${h.kind}`) })} style={iconBtn}><Trash2 size={14} /></button>
                    </div>
                  ) : (
                    <p>
                      <strong>{h.name || t(`hw.kind.${h.kind}`)}</strong> · {t(`hw.kind.${h.kind}`)} · {h.wll_kg ? t('rig.wllKg', { kg: h.wll_kg }) : t('rig.noWllShort')} · {t('hw.qtyIs', { count: h.qty })}
                      {h.source && <span style={{ color: colors.muted }}> · {h.source}</span>}
                    </p>
                  )}
                  {!h.wll_kg && <p style={{ color: colors.warn, display: 'flex', gap: '4px', alignItems: 'center' }}><AlertTriangle size={13} aria-hidden="true" /> {t('hw.noWll')}</p>}
                  {short && <p style={{ color: colors.warn, display: 'flex', gap: '4px', alignItems: 'center' }}><AlertTriangle size={13} aria-hidden="true" /> {t('hw.short', { used: used[h.id], qty: h.qty })}</p>}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </>
  )
}
