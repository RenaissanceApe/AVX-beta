import { useEffect, useMemo, useState } from 'react'
import { FileUp, FileDown, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { saveFixtureType, orgFixtureTypes, exportMvr } from '../../lib/fixtureTypes'
import { t } from '../../i18n'
import { Modal, btn, btnPrimary, input, label, card, colors, AvxLoader } from '../ui'
import { HintLabel } from '../help/HelpParts'

// MVR in and out (docs/FIELD_TOOLS.md, "How MVR and GDTF work"): two buttons for the DMX patch
// and the light plot. Import reads the file in the browser, asks which catalogue item each
// fixture type is, shows what will happen, and saves only when Import is pressed.
export default function MvrButtons({ gig, canEdit, canExport, catalogue, onImported }) {
  const { notify } = useToast()
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)

  async function doExport() {
    setExporting(true)
    try {
      const { error, count } = await exportMvr(gig)
      if (error) { logger.error('mvr', error, { step: 'export' }); notify(userMessage(error), 'error') }
      else { track('mvr:export'); notify(t('mvr.exported', { count }), 'success') }
    } catch (e) {
      logger.error('mvr', e, { step: 'export' })
      notify(userMessage(e), 'error')
    }
    setExporting(false)
  }

  return (
    <>
      {canEdit && <button type="button" onClick={() => setImporting(true)} style={btn}><FileUp size={14} aria-hidden="true" /> {t('mvr.import')}</button>}
      {canExport && <button type="button" onClick={doExport} disabled={exporting} style={btn}>{exporting ? <AvxLoader size={14} /> : <FileDown size={14} aria-hidden="true" />} {t('mvr.export')}</button>}
      {importing && <MvrImportDialog gig={gig} catalogue={catalogue} onClose={() => setImporting(false)} onDone={() => { setImporting(false); onImported?.() }} />}
    </>
  )
}

function MvrImportDialog({ gig, catalogue, onClose, onDone }) {
  const { notify } = useToast()
  const [lib, setLib] = useState(null)
  const [reading, setReading] = useState(false)
  const [problem, setProblem] = useState('')
  const [file, setFile] = useState(null) // { name, parsed, types }
  const [context, setContext] = useState(null) // { existing, show, typeRows }
  const [choices, setChoices] = useState({})
  const [saveTypes, setSaveTypes] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { import('../../lib/mvr').then(setLib) }, [])

  async function choose(e) {
    const f = e.target.files?.[0]
    if (!f || !lib) return
    setReading(true)
    setProblem('')
    try {
      const parsed = lib.parseMvr(new Uint8Array(await f.arrayBuffer()))
      const [fx, show, typeRows] = await Promise.all([
        supabase.from('gig_fixtures').select('id, mvr_uuid, item_id').eq('gig_id', gig.id),
        supabase.from('gig_show').select('stage, lighting').eq('gig_id', gig.id).maybeSingle(),
        gig.org_id ? orgFixtureTypes(gig.org_id) : [],
      ])
      if (fx.error) throw fx.error
      const types = lib.fixtureTypes(parsed)
      setChoices(Object.fromEntries(types.map(ty => [ty.key, { item_id: lib.suggestItem(ty, catalogue, typeRows) || '', footprint: '' }])))
      setContext({ existing: fx.data || [], show: show.data || {}, typeRows })
      setFile({ name: f.name, parsed, types })
    } catch (err) {
      logger.warn('mvr', err?.message || 'read failed', { step: 'parse' })
      setProblem(t('mvr.unreadable'))
      setFile(null)
    }
    setReading(false)
  }

  const plan = useMemo(() => (file && context && lib ? lib.planImport(file.parsed, {
    existing: context.existing, bars: context.show.lighting?.bars || [],
    stage: context.show.stage, choices, fixtureTypeRows: context.typeRows,
  }) : null), [file, context, choices, lib])
  const typesWithFiles = file ? file.types.filter(ty => ty.gdtf && choices[ty.key]?.item_id) : []
  const total = plan ? plan.inserts.length + plan.updates.length : 0
  const set = (key, patch) => setChoices(c => ({ ...c, [key]: { ...c[key], ...patch } }))

  async function save() {
    if (!plan || !total) return
    setSaving(true)
    let error = null
    try {
      if (plan.newBars.length) {
        const lighting = context.show.lighting || {}
        ;({ error } = await supabase.from('gig_show').upsert({ gig_id: gig.id, lighting: { ...lighting, bars: [...(lighting.bars || []), ...plan.newBars] } }))
      }
      for (let i = 0; !error && i < plan.inserts.length; i += 200) {
        ;({ error } = await supabase.from('gig_fixtures').insert(plan.inserts.slice(i, i + 200).map(r => ({ ...r, gig_id: gig.id }))))
      }
      for (const { id, ...row } of plan.updates) {
        if (error) break
        ;({ error } = await supabase.from('gig_fixtures').update(row).eq('id', id))
      }
      if (!error) {
        // The fixtures are in both tools: add them to the gig if they aren't there
        for (const tool of ['dmx_patch', 'light_plot']) await supabase.from('gig_tools').upsert({ gig_id: gig.id, tool }, { onConflict: 'gig_id,tool', ignoreDuplicates: true })
        if (saveTypes && gig.org_id) {
          for (const ty of typesWithFiles) {
            const hit = lib.gdtfFileFor(file.parsed, ty.spec)
            const res = await saveFixtureType({ orgId: gig.org_id, itemId: choices[ty.key].item_id, gdtf: ty.gdtf, bytes: hit?.bytes, fileName: hit?.name, useFigures: true })
            if (res.error) { logger.warn('mvr', res.error, { step: 'gdtf-save' }); notify(t('mvr.typesNotSaved'), 'error'); break }
          }
        }
      }
    } catch (err) { error = err }
    setSaving(false)
    if (error) { logger.error('mvr', error, { step: 'import' }); return notify(userMessage(error), 'error') }
    track('mvr:import')
    notify(t('mvr.imported', { count: total }), 'success')
    onDone()
  }

  return (
    <Modal title={t('mvr.title')} onClose={onClose} maxWidth={640}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <HintLabel htmlFor="mvr-file" hint="mvr-file">{t('mvr.choose')}</HintLabel>
          <input id="mvr-file" type="file" accept=".mvr" onChange={choose} disabled={!lib || reading || saving} style={{ ...input, padding: '8px' }} />
          <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5, marginTop: '4px' }}>{t('mvr.chooseHint')}</p>
        </div>
        {reading && <p role="status" style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '14px' }}><AvxLoader size={15} /> {t('mvr.reading')}</p>}
        {problem && <p role="alert" style={{ ...card, borderColor: 'var(--warn)', color: 'var(--warn)', fontSize: '14px', display: 'flex', gap: '8px' }}><AlertTriangle size={15} aria-hidden="true" style={{ flexShrink: 0 }} /> {problem}</p>}

        {file && file.parsed.fixtures.length === 0 && <p role="status" style={{ fontSize: '14px' }}>{t('mvr.nothing')}</p>}
        {file && file.parsed.fixtures.length > 0 && (
          <>
            <p role="status" style={{ fontSize: '14px' }}>
              <strong>{file.name}</strong>: {t('dmx.count', { count: file.parsed.fixtures.length })} · {t('mvr.types', { count: file.types.length })}
              {file.parsed.provider && ` · ${t('mvr.from', { program: file.parsed.provider })}`}
            </p>
            <section aria-labelledby="mvr-match">
              <h3 id="mvr-match" style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>{t('mvr.matchTitle')}</h3>
              <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5, marginBottom: '8px' }}>{t('mvr.matchHint')}</p>
              <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {file.types.map((ty, i) => {
                  const choice = choices[ty.key] || {}
                  const itemModes = context.typeRows.find(r => r.item_id === choice.item_id)?.modes || []
                  const needsFootprint = ty.missingFootprint > 0 && !(itemModes.length === 1 || (ty.modes.length > 0 && ty.modes.every(m => itemModes.some(x => x.name.toLowerCase() === m.toLowerCase() && x.footprint))))
                  return (
                    <li key={ty.key} style={{ ...card, padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <span>
                        <strong style={{ display: 'block', fontSize: '14px' }}>{ty.type || ty.spec}</strong>
                        <span style={{ fontSize: '13px', color: colors.soft }}>
                          {[t('dmx.count', { count: ty.count }), ty.modes.length ? t('mvr.modes', { list: ty.modes.join(', ') }) : null, ty.gdtf ? t('mvr.hasGdtf') : null].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <div style={{ display: 'grid', gridTemplateColumns: needsFootprint ? 'minmax(0, 2fr) minmax(0, 1fr)' : 'minmax(0, 1fr)', gap: '8px' }}>
                        {catalogue.length > 0 && (
                          <div>
                            <label style={label} htmlFor={`mvr-item-${i}`}>{t('inputs.item')}</label>
                            <select id={`mvr-item-${i}`} value={choice.item_id || ''} onChange={e => set(ty.key, { item_id: e.target.value })} style={{ ...input, appearance: 'auto' }}>
                              <option value="">{t('mvr.notInCatalogue')}</option>
                              {catalogue.map(it => <option key={it.id} value={it.id}>{it.name}{it.category ? ` · ${it.category}` : ''}</option>)}
                            </select>
                          </div>
                        )}
                        {needsFootprint && (
                          <div>
                            <HintLabel htmlFor={`mvr-fp-${i}`} hint="dmx-footprint">{t('dmx.footprint')}</HintLabel>
                            <input id={`mvr-fp-${i}`} type="number" min={1} max={512} value={choice.footprint || ''} onChange={e => set(ty.key, { footprint: e.target.value })} style={input} />
                          </div>
                        )}
                      </div>
                      {needsFootprint && !choice.footprint && <p style={{ fontSize: '13px', color: 'var(--warn)' }}>{t('mvr.footprintNeeded')}</p>}
                    </li>
                  )
                })}
              </ul>
            </section>
            {typesWithFiles.length > 0 && (
              <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '14px', lineHeight: 1.5 }}>
                <input type="checkbox" checked={saveTypes} onChange={e => setSaveTypes(e.target.checked)} style={{ marginTop: '4px' }} />
                <span>{t('mvr.saveTypes', { count: typesWithFiles.length })}</span>
              </label>
            )}
            {plan && (
              <section aria-labelledby="mvr-plan" style={{ ...card, padding: '12px' }}>
                <h3 id="mvr-plan" style={{ ...label, marginBottom: '4px' }}>{t('mvr.planTitle')}</h3>
                <ul style={{ paddingLeft: '16px', fontSize: '14px', lineHeight: 1.6 }}>
                  {plan.inserts.length > 0 && <li>{t('mvr.plan.add', { count: plan.inserts.length })}</li>}
                  {plan.updates.length > 0 && <li>{t('mvr.plan.update', { count: plan.updates.length })}</li>}
                  {plan.newBars.length > 0 && <li>{t('mvr.plan.bars', { count: plan.newBars.length })}</li>}
                  {plan.unaddressed > 0 && <li>{t('mvr.plan.unaddressed', { count: plan.unaddressed })}</li>}
                  {plan.noFootprint > 0 && <li style={{ color: 'var(--warn)' }}>{t('mvr.plan.noFootprint', { count: plan.noFootprint })}</li>}
                  {plan.tooMany > 0 && <li style={{ color: 'var(--warn)' }}>{t('mvr.plan.tooMany', { count: plan.tooMany })}</li>}
                </ul>
                <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5, marginTop: '8px' }}>{t('mvr.origin')}</p>
              </section>
            )}
            <button type="button" onClick={save} disabled={saving || !total} style={{ ...btnPrimary, justifyContent: 'center' }}>
              {saving && <AvxLoader size={15} />} {t('mvr.importButton', { count: total })}
            </button>
          </>
        )}
      </div>
    </Modal>
  )
}
