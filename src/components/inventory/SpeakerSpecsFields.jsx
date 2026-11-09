import { AlertTriangle } from 'lucide-react'
import { SPEAKER_TYPES, SPEC_FIELDS, RIGGING_FIELDS, presetById, presetPatch, presetLabel, specProblems } from '../../lib/speakers'
import { PRESETS } from '../../data/speakers'
import { t } from '../../i18n'
import { input, label, colors } from '../ui'
import { HintLabel, Hint } from '../help/HelpParts'

const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }
const HINTS = {
  sensitivity_db: 'spk-sensitivity', max_spl_db: 'spk-max-spl', dispersion_h: 'spk-dispersion', dispersion_v: 'spk-dispersion',
  freq_low_hz: 'spk-freq', freq_high_hz: 'spk-freq', impedance_ohm: 'spk-impedance', amp_channels: 'spk-amp-channels',
}

// The speaker part of the catalogue item form (A1): kind, specs from the datasheet, the source,
// and the manufacturer's rigging data, which needs a second person's check before RG3 uses it.
// A preset fills what its datasheet gives; onPreset also gets weight and power for the main form.
export default function SpeakerSpecsFields({ form, setForm, onPreset }) {
  const problems = specProblems(form)
  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }))
  const hasRigging = ['cog', 'pickup_points', 'frame_limits'].some(k => String(form[`rig_${k}`] || '').trim())
  const preset = presetById(form.speaker_preset)

  function applyPreset(e) {
    const p = presetById(e.target.value)
    if (!p) return
    const patch = presetPatch(p)
    setForm(f => {
      const next = { ...f, speaker_type: patch.speaker_type, speaker_preset: patch.speaker_preset, spec_source: patch.spec_source }
      for (const fld of SPEC_FIELDS) next[fld.key] = patch[fld.key] ?? ''
      for (const k of RIGGING_FIELDS) next[`rig_${k}`] = patch.rigging?.[k] || ''
      return next
    })
    onPreset?.({ brand: p.brand, model: p.model, weight_kg: patch.weight_kg, power_w: patch.power_w })
  }

  return (
    <details open={Boolean(form.speaker_type)} style={{ border: '1px solid var(--line)', padding: '10px 12px' }}>
      <summary style={{ cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}>{t('spk.section')}</summary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
        <div style={grid}>
          <div>
            <HintLabel htmlFor="spk-preset" hint="spk-preset">{t('spk.preset')}</HintLabel>
            <select id="spk-preset" value="" onChange={applyPreset} disabled={!PRESETS.length} style={{ ...input, cursor: 'pointer' }}>
              <option value="">{PRESETS.length ? t('spk.presetChoose') : t('spk.presetNone')}</option>
              {PRESETS.map(p => <option key={p.id} value={p.id}>{presetLabel(p)}</option>)}
            </select>
          </div>
          <div>
            <label style={label} htmlFor="spk-type">{t('spk.type')}</label>
            <select id="spk-type" value={form.speaker_type} onChange={set('speaker_type')} style={{ ...input, cursor: 'pointer' }}>
              <option value="">{t('spk.typeOpt.none')}</option>
              {SPEAKER_TYPES.map(k => <option key={k} value={k}>{t(`spk.typeOpt.${k}`)}</option>)}
            </select>
          </div>
        </div>
        {preset && <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5 }}>{t('spk.fromPreset', { name: presetLabel(preset) })}</p>}
        <div style={grid}>
          {SPEC_FIELDS.map(f => {
            const id = `spk-${f.key}`
            const err = problems[f.key]
            return (
              <div key={f.key} style={{ minWidth: 0 }}>
                <HintLabel htmlFor={id} hint={HINTS[f.key]}>{t(`spk.field.${f.key}`)}</HintLabel>
                <input id={id} inputMode={f.whole ? 'numeric' : 'decimal'} value={form[f.key]} onChange={set(f.key)} aria-invalid={Boolean(err)}
                  aria-describedby={err ? `${id}-err` : undefined} style={input} />
                {err && <p id={`${id}-err`} style={{ fontSize: '13px', color: colors.danger, marginTop: '2px' }}>{t(`spk.err.${err}`, { min: f.min, max: f.max })}</p>}
              </div>
            )
          })}
        </div>
        <div>
          <HintLabel htmlFor="spk-source" hint="spk-source">{t('spk.source')}</HintLabel>
          <input id="spk-source" value={form.spec_source} onChange={set('spec_source')} maxLength={500} placeholder={t('spk.sourcePlaceholder')} style={input} />
        </div>
        <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <legend style={{ ...label, padding: 0, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>{t('spk.rigging')} <Hint id="spk-rigging" label={t('spk.rigging')} /></legend>
          {hasRigging && (
            <p role="note" style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '13px', color: 'var(--warn)', lineHeight: 1.5 }}>
              <AlertTriangle size={14} aria-hidden="true" style={{ flexShrink: 0, marginTop: '2px' }} /> {t('spk.riggingUnchecked')}
            </p>
          )}
          {RIGGING_FIELDS.map(k => (
            <div key={k}>
              <label style={label} htmlFor={`spk-rig-${k}`}>{t(`spk.rig.${k}`)}</label>
              <textarea id={`spk-rig-${k}`} value={form[`rig_${k}`]} onChange={set(`rig_${k}`)} rows={k === 'source' ? 1 : 2} maxLength={900}
                style={{ ...input, resize: 'vertical' }} />
            </div>
          ))}
        </fieldset>
      </div>
    </details>
  )
}
