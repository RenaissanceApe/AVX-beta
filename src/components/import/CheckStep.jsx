import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Upload, Plus, Undo2, Info, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { selectAll } from '../../lib/selectAll'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { FIXES, checkImport, withPending, fieldsFor, splitParts, mergeResults, fixRows, presetFixes, liveFixes } from '../../lib/importer'
import { t } from '../../i18n'
import { Hint } from '../help/HelpParts'
import { btn, btnPrimary, label, colors, AvxLoader, space } from '../ui'
import FixGroup, { reasonText } from './FixGroup'
import { isContacts, isHeld, isJob, contactsOff, stored } from './kinds'

// The Check step of the import wizard (docs/SWITCHING.md, "Import overhaul: fix it here"): what
// the import will do, every problem grouped by cause and value with fixes on the spot, the fixes
// made so far (each can be taken back), heads-ups and rows left out on purpose. The fixes are
// kept by the wizard page (Back and Next keep them). What a fix adds, restores or switches is sent
// with the import itself (fixRows) and saved in its own batch, so if any of it fails nothing is
// imported and one undo in Earlier imports takes it all back (IM3). With a saved matching, the
// fixes can be remembered with it.
export default function CheckStep({ orgId, kind, table, mapping, headerRow, defaults, dateOrders, custom, retry, fileName, presetName, fixes, setFixes, onBack, onDone }) {
  const { notify } = useToast()
  const [existing, setExisting] = useState(null)
  const [busy, setBusy] = useState(false)
  // Bulk items whose units can switch them to per unit (only while their stock is the opening quantity)
  const [perUnitOk, setPerUnitOk] = useState([])
  const [perUnitOff, setPerUnitOff] = useState(false)
  const [remember, setRemember] = useState(true)

  useEffect(() => {
    const all = (q, step) => selectAll(q).then(({ data, error }) => { if (error) logger.error('import', error, { step }); return data || [] })
    const none = Promise.resolve([])
    const itemCols = 'id, name, code, tracking, kit_type, kind, brand, category, archived_at'
    if (isHeld(kind)) {
      Promise.all([
        supabase.rpc('org_member_list', { p_org: orgId }).then(r => r.data || []),
        all(() => supabase.from('org_invites').select('email').eq('org_id', orgId).order('id'), 'invites'),
        all(() => supabase.from('held_invites').select('email').eq('org_id', orgId).eq('status', 'held').order('id'), 'held'),
      ]).then(([m, i, h]) => setExisting({ members: m.map(x => x.email), invites: i.map(x => x.email), held: h.map(x => x.email) }))
      return
    }
    if (isJob(kind)) {
      Promise.all([
        all(() => supabase.from('gigs').select('id, name, start_date, import_ref').eq('org_id', orgId).order('id'), 'gigs'),
        kind === 'gig_equipment' ? all(() => supabase.from('price_items').select(itemCols).eq('org_id', orgId).order('id'), 'items') : none,
        kind === 'gig_equipment' ? all(() => supabase.from('gig_equipment').select('gig_id, item_id').eq('org_id', orgId).order('id'), 'lines') : none,
        kind === 'quotes' ? all(() => supabase.from('quotes').select('import_ref, status').eq('org_id', orgId).not('import_ref', 'is', null).order('id'), 'quotes') : none,
        kind !== 'gig_equipment' ? all(() => supabase.from('clients').select('id, name, archived_at').eq('org_id', orgId).order('id'), 'clients') : none,
      ]).then(([gigs, items, lines, quotes, clients]) => setExisting({ gigs, items, lines, quotes, clients }))
      return
    }
    if (isContacts(kind)) {
      all(() => supabase.from(kind).select('id, name, email, tax_id, archived_at').eq('org_id', orgId).order('id'), 'contacts').then(contacts => setExisting({ contacts }))
      return
    }
    Promise.all([
      all(() => supabase.from('stock_locations').select('id, name, archived_at').eq('org_id', orgId).order('id'), 'locations'),
      all(() => supabase.from('price_items').select(itemCols).eq('org_id', orgId).order('id'), 'items'),
      kind === 'units' ? all(() => supabase.from('stock_units').select('code, item_id').eq('org_id', orgId).order('id'), 'units') : none,
      kind === 'kits' ? all(() => supabase.from('item_parts').select('parent_id, child_id, kind').eq('org_id', orgId).order('id'), 'parts') : none,
      // Items with stock can't change how they're kept (the stock totals tell which)
      kind === 'items' ? all(() => supabase.from('stock_levels').select('item_id').eq('org_id', orgId).order('item_id'), 'stock') : none,
    ]).then(([locations, items, units, parts, stock]) => setExisting({ locations, items, units, parts, stocked: [...new Set(stock.map(s => s.item_id))] }))
  }, [orgId, kind])

  useEffect(() => {
    if (kind !== 'units' || !existing?.items) return
    const bulk = existing.items.filter(i => i.tracking === 'bulk' && !i.archived_at).map(i => i.id)
    if (!bulk.length) return
    supabase.rpc('import_per_unit_ok', { p_org: orgId, p_items: bulk }).then(({ data, error }) => {
      // Until the hand-run file has run, switching isn't switched on (0A000)
      if (error?.code === '0A000') return setPerUnitOff(true)
      if (error) logger.error('import', error, { step: 'perUnit' })
      setPerUnitOk((data || []).map(String))
    })
  }, [orgId, kind, existing])

  // Fixes remembered with a saved matching that no longer fit what the organisation has are dropped
  useEffect(() => {
    if (!existing) return
    const kept = liveFixes(fixes, existing)
    if (kept.length !== fixes.length) setFixes(kept)
  }, [existing]) // eslint-disable-line react-hooks/exhaustive-deps

  const check = useMemo(() => (existing ? checkImport({ table, mapping, kind, headerRow, defaults, dateOrders, custom, only: retry?.lines || null, refused: retry?.refused || null, existing, fixes }) : null),
    [table, mapping, kind, headerRow, defaults, dateOrders, custom, retry, existing, fixes])
  // Every field a column can go to (the organisation's own included), and its name on the page
  const fields = useMemo(() => fieldsFor(kind, custom), [kind, custom])
  const fieldLabel = useMemo(() => key => fields.find(f => f.key === key)?.label || t(`imp.field.${kind}.${key}`), [fields, kind])

  // What the pickers offer: what exists plus what the fixes will add
  const ctx = useMemo(() => {
    if (!existing || !check) return null
    const ex = withPending(existing, fixes)
    return {
      raw: check.raw,
      fields,
      fieldLabel,
      dateOrders,
      locations: (ex.locations || []).filter(l => !l.archived_at),
      archivedLocations: (existing.locations || []).filter(l => l.archived_at),
      archivedItems: (existing.items || []).filter(i => i.archived_at),
      items: (ex.items || []).filter(i => !i.archived_at),
      gigs: existing.gigs || [],
      clients: (ex.clients || []).filter(c => !c.archived_at),
      contacts: (existing.contacts || []).filter(c => !c.archived_at),
      // Why a fix can't be used for this group (null when it can)
      blocked: (fix, group) => {
        if (fix === 'startTracking') {
          const item = (ex.items || []).find(i => !i.archived_at && i.name.toLowerCase() === String(group.value).toLowerCase() && i.tracking === 'none')
          return !item || !['rental', 'sale'].includes(item.kind) ? t('imp.fix.notStockKind') : null
        }
        if (fix === 'perUnit') {
          const item = (ex.items || []).find(i => !i.archived_at && i.name.toLowerCase() === String(group.value).toLowerCase() && i.tracking === 'bulk')
          if (perUnitOff) return t('imp.fix.perUnitNotYet')
          return !item || !perUnitOk.includes(String(item.id)) ? t('imp.fix.perUnitOff') : null
        }
        return null
      },
    }
  }, [existing, check, fixes, fields, fieldLabel, dateOrders, perUnitOk, perUnitOff])

  // With a saved matching, the fixes that don't depend on the file's lines are remembered with it
  async function rememberFixes() {
    if (!presetName || !remember || isJob(kind) || isHeld(kind)) return
    const where = stored(kind)
    let q = supabase.from('import_presets').update({ fixes: presetFixes(fixes), updated_at: new Date().toISOString() })
      .eq('org_id', orgId).eq('kind', where.kind).eq('name', presetName)
    q = where.subject ? q.eq('subject', where.subject) : q.is('subject', null)
    const { error } = await q
    if (error) logger.error('import', error, { step: 'rememberFixes' })
  }

  async function importNow() {
    setBusy(true)
    // What the fixes add, restore or switch goes ahead of the first part's rows, in the same batch
    const additions = isHeld(kind) ? [] : fixRows(fixes)
    // More than 5000 rows go in parts, each its own import (a quote's lines stay together)
    const parts = splitParts(check.sendable, kind)
    const results = [], sent = []
    for (const [n, rows] of parts.entries()) {
      const payload = n === 0 ? [...additions, ...rows] : rows
      const { data, error } = isHeld(kind)
        ? await supabase.rpc('import_crew', { p_org: orgId, p_rows: rows, p_file: fileName })
        : isJob(kind) ? await supabase.rpc('import_jobs', { p_org: orgId, p_kind: kind, p_rows: payload, p_file: fileName })
        : await supabase.rpc('run_import', { p_org: orgId, p_kind: kind, p_rows: payload, p_file: fileName, p_preset: presetName })
      if (error) {
        logger.error('import', error, { step: 'run', kind, part: n + 1 })
        // The first part carries the fixes' additions: if one of them fails, nothing is imported
        notify(contactsOff(error, kind) ? t('imp.contactsOff') : n === 0 && /^Fix not saved/.test(error.message || '') ? t('imp.addFailed') : userMessage(error), 'error')
        if (!n) return setBusy(false)
        break
      }
      results.push(data)
      sent.push(...rows)
    }
    await rememberFixes()
    setBusy(false)
    track(`import:${kind}`)
    setFixes([])
    onDone({ ...mergeResults(results), sent, leftOut: leftOutEntries(), partial: results.length < parts.length ? { done: results.length, total: parts.length } : null })
  }

  // The rows the check leaves out, each with its problem as the page says it (for the left-out file)
  function leftOutEntries() {
    const out = check.groups.filter(g => !g.note).flatMap(g => g.lines.map(l => ({ line: l.line, problem: groupText(g) })))
    for (const f of fixes) if (f.type === 'skip') for (const line of f.lines) out.push({ line, problem: groupText(f) })
    return out
  }
  const groupText = g => {
    const what = [g.field ? fieldLabel(g.field) : null, g.value != null && g.value !== '' ? `“${g.value}”` : null].filter(Boolean).join(' ')
    const why = FIXES[g.reason]?.purpose ? t(`imp.purpose.${g.reason}`, { count: 1 }) : reasonText(g)
    return what && !g.refused && g.reason !== 'refused' ? `${what}: ${why}` : why
  }

  if (!check || !ctx) return <AvxLoader size={20} color={colors.accentText} />
  const { counts, groups, rows, plan, sendable, adds } = check
  const problems = groups.filter(g => !g.purpose && !g.note)
  const notes = groups.filter(g => g.note)
  const purpose = groups.filter(g => g.purpose)
  const used = fields.filter(f => Object.values(check.mapping).includes(f.key))
  const addsText = ['location', 'item', 'client'].filter(w => adds[w]).map(w => t(`imp.adds.${w}`, { count: adds[w] }))
  const apply = made => setFixes(list => [...list, ...made])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[5] }}>
      {retry && (
        <p role="status" style={{ display: 'flex', gap: space[2], alignItems: 'center', fontSize: '14px', margin: 0 }}>
          <Info size={14} aria-hidden="true" style={{ flexShrink: 0 }} /> {t('imp.retrying', { count: retry.lines.length })}
        </p>
      )}
      <div role="status" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: space[4] }}>
        <Count label={t('imp.willCreate')} value={counts.create} />
        <Count label={t('imp.willMatch')} value={counts.match} hint={t('imp.willMatchHint')} />
        <Count label={t('imp.waiting')} value={counts.problems} warn={counts.problems > 0} />
        <Count label={t('imp.leftOutCount')} value={counts.leftOut + counts.purpose} />
      </div>

      {problems.length > 0 && (
        <section aria-labelledby="imp-problems">
          <h2 id="imp-problems" style={{ font: '700 16px/24px var(--font-mono)', marginBottom: space[1], display: 'flex', gap: space[2], alignItems: 'center' }}>
            {t('imp.problemsTitle', { count: counts.problems })} <Hint id="imp-fixes" />
          </h2>
          <p style={{ fontSize: '13px', color: colors.soft, lineHeight: 1.6, marginBottom: space[2] }}>{t('imp.problemsHint')}</p>
          {problems.map(g => <FixGroup key={g.key} group={g} kind={kind} ctx={ctx} onApply={apply} />)}
        </section>
      )}
      {problems.length === 0 && (
        <p role="status" style={{ display: 'flex', gap: space[2], alignItems: 'center', fontSize: '14px', margin: 0 }}>
          <Check size={14} color={colors.accentText} aria-hidden="true" /> {t('imp.noProblems')}
        </p>
      )}

      {fixes.length > 0 && (
        <section aria-labelledby="imp-fixes">
          <h2 id="imp-fixes" style={{ font: '700 16px/24px var(--font-mono)', marginBottom: space[2] }}>{t('imp.fixesTitle', { count: fixes.length })}</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, borderTop: `1px solid ${colors.border}` }}>
            {fixes.map((f, i) => {
              const text = fixText(f, fieldLabel)
              return (
                <li key={i} style={{ display: 'flex', gap: space[3], alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', padding: `${space[2]} 0`, borderBottom: `1px solid ${colors.border}`, fontSize: '13px' }}>
                  <span style={{ display: 'flex', gap: space[2], alignItems: 'baseline', minWidth: 0, overflowWrap: 'anywhere' }}>
                    {f.type === 'add' ? <Plus size={12} aria-hidden="true" style={{ flexShrink: 0 }} /> : <Check size={12} aria-hidden="true" style={{ flexShrink: 0 }} />}
                    <span>{text}{['add', 'restore', 'track', 'perUnit'].includes(f.type) && <strong style={{ color: colors.accentText }}> · {t('imp.willBeAdded')}</strong>}</span>
                  </span>
                  <button type="button" onClick={() => setFixes(list => list.filter((_, n) => n !== i))} aria-label={`${t('imp.takeBack')}: ${text}`} style={{ ...btn, padding: '4px 10px', minHeight: '32px' }}>
                    <Undo2 size={12} aria-hidden="true" /> {t('imp.takeBack')}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {notes.length > 0 && (
        <section aria-labelledby="imp-notes">
          <h2 id="imp-notes" style={{ font: '700 16px/24px var(--font-mono)', marginBottom: space[1] }}>{t('imp.notesTitle')}</h2>
          {notes.map(g => (g.fixes.length
            ? <FixGroup key={g.key} group={g} kind={kind} ctx={ctx} onApply={apply} />
            : <p key={g.key} style={{ display: 'flex', gap: space[2], alignItems: 'baseline', fontSize: '13px', color: colors.soft, lineHeight: 1.6, borderTop: `1px solid ${colors.border}`, padding: `${space[3]} 0`, margin: 0 }}>
                <Info size={13} aria-hidden="true" style={{ flexShrink: 0, alignSelf: 'center' }} />
                <span><strong style={{ color: 'var(--text)' }}>{t('imp.group.rows', { count: g.lines.length })}</strong> · {t(`imp.note.${g.reason}`)}</span>
              </p>))}
        </section>
      )}

      {purpose.length > 0 && (
        <section aria-labelledby="imp-purpose">
          <h2 id="imp-purpose" style={{ font: '700 16px/24px var(--font-mono)', marginBottom: space[1] }}>{t('imp.purposeTitle', { count: counts.purpose })}</h2>
          <p style={{ fontSize: '13px', color: colors.muted, marginBottom: space[2] }}>{t('imp.purposeHint')}</p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '13px', lineHeight: 1.7 }}>
            {purpose.map(g => (
              <li key={g.key}>
                <strong>{t(`imp.purpose.${g.reason}`, { count: g.lines.length })}</strong>
                {g.lines.some(l => l.value) && `: ${g.lines.slice(0, 8).map(l => l.value).filter(Boolean).join(', ')}${g.lines.length > 8 ? '…' : ''}`}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div role="region" aria-label={t('imp.preview')} tabIndex={0} style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <caption style={{ ...label, display: 'table-caption', captionSide: 'top', textAlign: 'left', paddingBottom: '6px', marginBottom: 0 }}>{t('imp.preview')}</caption>
          <thead>
            <tr style={{ textAlign: 'left', color: colors.muted }}>
              <th style={{ padding: '4px 6px' }}>{t('imp.lineShort')}</th>
              {used.map(f => <th key={f.key} style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>{fieldLabel(f.key)}</th>)}
              <th style={{ padding: '4px 6px' }}>{t('imp.result')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 30).map((r, i) => {
              const p = plan[i]
              const out = p.action === 'skip' && (p.leftOut || p.purpose)
              return (
                <tr key={r._row} style={{ borderTop: `1px solid ${colors.border}`, color: p.action === 'skip' && !out ? 'var(--warn)' : out ? colors.muted : undefined }}>
                  <td style={{ padding: '4px 6px', fontFamily: 'var(--font-mono)' }}>{r._row}</td>
                  {used.map(f => <td key={f.key} style={{ padding: '4px 6px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cellText(f.custom ? r.custom_values?.[f.key.slice(3)] : r[f.key])}</td>)}
                  <td style={{ padding: '4px 6px', whiteSpace: 'nowrap', fontWeight: 700 }}>{t(out ? 'imp.action.out' : `imp.action.${p.action}`)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length > 30 && <p style={{ fontSize: '13px', color: colors.muted, marginTop: space[1] }}>{t('imp.andMore', { count: rows.length - 30 })}</p>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
        {counts.problems > 0 && <p id="imp-waiting" role="status" style={{ fontSize: '13px', color: 'var(--warn)', margin: 0 }}>{t('imp.waitingOut', { count: counts.problems })}</p>}
        {presetName && !isJob(kind) && !isHeld(kind) && presetFixes(fixes).length > 0 && (
          <div style={{ display: 'flex', gap: space[2], alignItems: 'flex-start' }}>
            <label style={{ display: 'flex', gap: space[2], alignItems: 'flex-start', fontSize: '14px', cursor: 'pointer' }}>
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} style={{ marginTop: '4px', accentColor: 'var(--accent)' }} />
              <span>{t('imp.rememberFixes', { name: presetName })}</span>
            </label>
            <Hint id="imp-remember" />
          </div>
        )}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" onClick={onBack} style={btn}><ArrowLeft size={14} /> {t('imp.back')}</button>
          <button type="button" onClick={importNow} disabled={busy || !sendable.length} aria-describedby={counts.problems > 0 ? 'imp-waiting' : undefined} style={btnPrimary}>
            {busy ? <AvxLoader size={14} /> : <Upload size={14} />} {[t('imp.importButton', { count: sendable.length }), ...addsText].join(' · ')}
          </button>
        </div>
      </div>
    </div>
  )
}

// A value in the preview (a yes/no field's value is true or false)
const cellText = v => (v === true ? t('imp.word.yesNo.yes') : v === false ? t('imp.word.yesNo.no') : v ?? '')

// One fix as a line in "Your fixes"
function fixText(f, fieldLabel) {
  const what = [f.field ? fieldLabel(f.field) : null, f.value != null && f.value !== '' ? `“${f.value}”` : null].filter(Boolean).join(' ')
  return t(`imp.done.${f.fix}`, { what, to: f.to ?? '', count: f.count ?? f.lines?.length ?? 0 })
}

function Count({ label: text, value, hint, warn }) {
  return (
    // A big number and its label on the page ground (a count you don't open isn't a card)
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '24px', fontWeight: 700, color: warn ? 'var(--warn)' : 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: '13px', color: colors.soft }}>{text}</div>
      {hint && <div style={{ fontSize: '13px', color: colors.muted, marginTop: space[1] }}>{hint}</div>}
    </div>
  )
}
