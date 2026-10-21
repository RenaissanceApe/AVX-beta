import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Printer, Trash2, Wand2, AlertTriangle, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { saveSnapshot, loadSnapshot, isNetworkError } from '../../lib/offline'
import { boxesOf, nextBoxName, patchView, autoAssign, socketCode, MAX_BOX_INPUTS } from '../../lib/patch'
import { t } from '../../i18n'
import { btn, btnPrimary, iconBtn, input, label, card, colors, tint } from '../ui'
import EmptyState from '../EmptyState'

// The audio patch (docs/FIELD_TOOLS.md, F2): the gig's stage boxes, socket by socket, with the
// input line plugged into each. Editors add boxes, mark the ones split to a monitor desk, pick
// the line for a socket, and fill the free sockets in channel order. The socket is kept on the
// input line (its "Stage box" field), so the input list and the patch always agree.
export default function PatchTool({ gig, canEdit }) {
  const { notify } = useToast()
  const [audio, setAudio] = useState(null)
  const [inputs, setInputs] = useState([])
  const [savedAt, setSavedAt] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [show, lines] = await Promise.all([
      supabase.from('gig_show').select('audio').eq('gig_id', gig.id).maybeSingle(),
      supabase.from('gig_inputs').select('id, channel, source, stage_box, phantom').eq('gig_id', gig.id).order('channel'),
    ])
    if (lines.error && isNetworkError(lines.error)) {
      const snap = loadSnapshot(`patch.${gig.id}`)
      setAudio(snap?.data?.audio || {})
      setInputs(snap?.data?.inputs || [])
      setSavedAt(snap?.savedAt || null)
      return
    }
    if (lines.error) logger.error('patch', lines.error, { step: 'load' })
    const next = { audio: show.data?.audio || {}, inputs: lines.data || [] }
    setAudio(next.audio)
    setInputs(next.inputs)
    setSavedAt(null)
    saveSnapshot(`patch.${gig.id}`, next)
  }, [gig.id])
  useEffect(() => { load() }, [load])

  const boxes = useMemo(() => boxesOf(audio), [audio])
  const view = useMemo(() => patchView(boxes, inputs), [boxes, inputs])

  async function saveBoxes(next) {
    const value = { ...(audio || {}), boxes: next }
    setAudio(value)
    const { error } = await supabase.from('gig_show').upsert({ gig_id: gig.id, audio: value })
    if (error) { logger.error('patch', error, { step: 'boxes' }); notify(userMessage(error), 'error'); load() }
  }
  const editBox = (i, patch) => saveBoxes(boxes.map((b, n) => (n === i ? { ...b, ...patch } : b)))

  async function setLine(lineId, stage_box) {
    setInputs(list => list.map(l => (l.id === lineId ? { ...l, stage_box } : l)))
    const { error } = await supabase.from('gig_inputs').update({ stage_box }).eq('id', lineId)
    if (error) { notify(userMessage(error), 'error'); load() }
  }
  // Choosing a line for a socket: the line moves there; whoever was in it is left without one
  async function choose(box, socket, lineId) {
    const code = socketCode(box.name, socket.socket)
    for (const old of socket.lines) if (old.id !== lineId) await setLine(old.id, null)
    if (lineId) await setLine(lineId, code)
    track('patch:assign')
  }

  async function fill() {
    const updates = autoAssign(boxes, inputs)
    if (!updates.length) return notify(t('patch.nothingToFill'), 'info')
    setBusy(true)
    for (const u of updates) {
      const { error } = await supabase.from('gig_inputs').update({ stage_box: u.stage_box }).eq('id', u.id)
      if (error) { setBusy(false); notify(userMessage(error), 'error'); return load() }
    }
    setBusy(false)
    track('patch:fill')
    notify(t('patch.filled', { count: updates.length }), 'success')
    load()
  }

  if (audio === null) return <Loader2 size={20} color={colors.accentText} style={{ animation: 'spin 1s linear infinite' }} />
  const lineName = l => `${l.channel} · ${l.source}`

  return (
    <section aria-labelledby="patch-title">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <div style={{ flex: '1 1 200px' }}>
          <h2 id="patch-title" style={{ fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>{t('tools.name.patch')}</h2>
          <p style={{ color: colors.muted, fontSize: '13px' }}>
            {t('patch.boxCount', { count: boxes.length })} · {t('patch.placed', { done: inputs.length - view.loose.length, total: inputs.length })}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {canEdit && <button type="button" onClick={() => saveBoxes([...boxes, { name: nextBoxName(boxes), inputs: 16, split: false }])} style={btnPrimary}><Plus size={14} /> {t('patch.addBox')}</button>}
          {boxes.length > 0 && <Link to={`/gig/${gig.id}/patch`} style={{ ...btn, textDecoration: 'none' }}><Printer size={14} /> {t('inputs.print')}</Link>}
        </div>
      </div>
      {savedAt && <p role="status" style={{ fontSize: '12px', color: 'var(--warn)', marginBottom: '10px' }}>{t('patch.offline')}</p>}

      {view.clashes.length > 0 && (
        <p role="status" style={{ ...card, borderColor: tint('var(--warn)', 45), color: 'var(--warn)', fontSize: '13px', display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
          <AlertTriangle size={15} aria-hidden="true" /> {t('patch.clashes', { sockets: view.clashes.join(', ') })}
        </p>
      )}

      {boxes.length === 0 ? (
        <EmptyState compact title={t('patch.emptyTitle')} body={canEdit ? t('patch.emptyEditor') : t('patch.emptyReader')} guide="pm-patch" />
      ) : boxes.map((b, i) => {
        const box = view.boxes[i]
        return (
          <section key={b.name} aria-labelledby={`box-${i}`} style={{ ...card, marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
              <h3 id={`box-${i}`} style={{ fontSize: '16px', fontWeight: 800, flex: '1 1 120px', display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                {b.name}
                <span style={{ fontSize: '12px', fontWeight: 600, color: colors.muted }}>{t('patch.used', { done: box.sockets.filter(s => s.lines.length).length, total: b.inputs })}</span>
                {b.split && <span style={{ fontSize: '11px', fontWeight: 800, color: colors.accentText }}>{t('patch.splitBadge')}</span>}
              </h3>
              {canEdit && (
                <>
                  <div style={{ width: '90px' }}>
                    <label style={label} htmlFor={`box-name-${i}`}>{t('patch.boxName')}</label>
                    <input id={`box-name-${i}`} maxLength={12} defaultValue={b.name} key={`n${b.name}`} style={input}
                      onBlur={e => { const v = e.target.value.trim(); if (v && v !== b.name && !boxes.some(x => x.name.toLowerCase() === v.toLowerCase())) editBox(i, { name: v }) }} />
                  </div>
                  <div style={{ width: '90px' }}>
                    <label style={label} htmlFor={`box-inputs-${i}`}>{t('patch.boxInputs')}</label>
                    <input id={`box-inputs-${i}`} type="number" min={1} max={MAX_BOX_INPUTS} defaultValue={b.inputs} key={`i${b.name}${b.inputs}`} style={input}
                      onBlur={e => { const v = Math.min(MAX_BOX_INPUTS, Math.max(1, Math.round(Number(e.target.value) || b.inputs))); if (v !== b.inputs) editBox(i, { inputs: v }) }} />
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer', paddingBottom: '10px' }}>
                    <input type="checkbox" checked={b.split} onChange={e => editBox(i, { split: e.target.checked })} style={{ accentColor: 'var(--accent)' }} /> {t('patch.split')}
                  </label>
                  <button type="button" onClick={() => saveBoxes(boxes.filter((_, n) => n !== i))} aria-label={t('patch.removeBox', { name: b.name })} style={{ ...iconBtn, marginBottom: '6px' }}><Trash2 size={14} /></button>
                </>
              )}
            </div>
            <ol style={{ listStyle: 'none', padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '4px' }}>
              {box.sockets.map(s => {
                const clash = s.lines.length > 1
                const here = s.lines[0]
                return (
                  <li key={s.socket} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px', borderRadius: '8px', fontSize: '13px',
                    border: `1px solid ${clash ? 'var(--warn)' : colors.border}`, background: here ? tint(colors.accent, 7) : 'transparent' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, minWidth: '2em', color: colors.accentText }}>{String(s.socket).padStart(2, '0')}</span>
                    {canEdit ? (
                      <select aria-label={t('patch.socketLabel', { socket: socketCode(b.name, s.socket) })} value={here?.id || ''} onChange={e => choose(b, s, e.target.value || null)}
                        style={{ ...input, appearance: 'auto', padding: '4px 6px', fontSize: '13px', minHeight: '32px', flex: 1, minWidth: 0 }}>
                        <option value="">{t('patch.free')}</option>
                        {here && <option value={here.id}>{lineName(here)}</option>}
                        {view.loose.map(l => <option key={l.id} value={l.id}>{lineName(l)}</option>)}
                      </select>
                    ) : (
                      <span style={{ flex: 1, minWidth: 0, color: here ? 'var(--text)' : colors.muted }}>{here ? lineName(here) : t('patch.free')}</span>
                    )}
                    {here?.phantom && <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--warn)' }}>48V</span>}
                    {clash && <span title={s.lines.map(lineName).join(', ')} style={{ color: 'var(--warn)' }}><AlertTriangle size={13} aria-label={t('patch.clashOne')} /></span>}
                  </li>
                )
              })}
            </ol>
          </section>
        )
      })}

      {view.loose.length > 0 && (
        <section aria-labelledby="loose-lines" style={{ marginTop: '6px' }}>
          <h3 id="loose-lines" style={{ ...label, marginBottom: '6px' }}>{t('patch.loose', { count: view.loose.length })}</h3>
          <p style={{ fontSize: '13px', color: colors.soft, lineHeight: 1.6 }}>{view.loose.map(lineName).join(' · ')}</p>
          {canEdit && boxes.length > 0 && (
            <button type="button" onClick={fill} disabled={busy} style={{ ...btn, marginTop: '8px' }}>
              {busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Wand2 size={14} />} {t('patch.fill')}
            </button>
          )}
        </section>
      )}
      {inputs.length === 0 && boxes.length > 0 && <p style={{ fontSize: '13px', color: colors.muted, marginTop: '8px' }}>{t('patch.noInputs')}</p>}
    </section>
  )
}
