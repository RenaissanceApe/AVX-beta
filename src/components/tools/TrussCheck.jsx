import { Link } from 'react-router-dom'
import { CheckCircle2, AlertTriangle, CircleHelp, Ban } from 'lucide-react'
import {
  TRUSS_TABLES, pickableTables, tableById, tableName, tableStatus, markFor, lineTrussCheck, trussKgPerM, usableTable,
} from '../../lib/trussTables'
import { LIMITS } from '../../lib/rigging'
import { t, fmt } from '../../i18n'
import { btn, input, label, colors } from '../ui'
import { HintLabel } from '../help/HelpParts'
import { NumberField } from './RigFields'

const ICON = { pass: CheckCircle2, near: AlertTriangle, fail: AlertTriangle, outside: CircleHelp, missing: CircleHelp }
const colour = s => (s === 'fail' ? colors.danger : s === 'near' || s === 'outside' || s === 'missing' ? colors.warn : s === 'pass' ? colors.accentText : colors.muted)
const pct = u => Math.round(u * 100)
const BRANDS = [...new Set(TRUSS_TABLES.map(x => x.brand))]

// RG2: a truss line's type (a manufacturer's load table) and the pass/fail of each span between its
// hang points. Only a table an AVX admin has checked for this exact edition gives a pass/fail; the
// report names the table, its edition and who checked it.
export default function TrussCheck({ line, analysis, checks, settings, canEdit, onEdit }) {
  const table = tableById(line.truss_table_id)
  const status = table ? tableStatus(table, checks) : null
  const mark = table ? markFor(table, checks) : null
  const anyChecked = TRUSS_TABLES.some(x => usableTable(x, checks))
  const result = status === 'checked' ? lineTrussCheck(table, analysis, { factor: settings.dynamic_factor, defl_limit_mm: line.defl_limit_mm }) : null
  const perM = trussKgPerM(table)
  const id = `rl-type-${line.id}`
  const small = { fontSize: '13px', lineHeight: 1.5 }

  return (
    <div style={{ marginTop: '12px' }}>
      <h5 style={{ ...label, marginBottom: '4px' }}>{t('truss.title')}</h5>
      {canEdit ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px', alignItems: 'end' }}>
          <div style={{ gridColumn: 'span 2' }}>
            <HintLabel htmlFor={id} hint="rig-truss-type">{t('truss.type')}</HintLabel>
            <select id={id} value={line.truss_table_id || ''} onChange={e => onEdit({ truss_table_id: e.target.value || null })} style={{ ...input, appearance: 'auto' }}>
              <option value="">{t('truss.noType')}</option>
              {line.truss_table_id && !pickableTables().some(x => x.id === line.truss_table_id) && <option value={line.truss_table_id}>{table ? tableName(table) : line.truss_table_id}</option>}
              {BRANDS.map(b => (
                <optgroup key={b} label={b}>
                  {pickableTables().filter(x => x.brand === b).map(x => (
                    <option key={x.id} value={x.id}>{tableName(x)} · {t(`truss.status.${tableStatus(x, checks)}`)}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <NumberField id={`rl-defl-${line.id}`} hint="rig-defl-limit" text={t('truss.deflLimit')} value={line.defl_limit_mm} empty range={LIMITS.defl_limit_mm} step={1} onSave={v => onEdit({ defl_limit_mm: v })} />
          {perM !== null && Math.abs(perM - line.truss_kg_m) > 0.05 && (
            <button type="button" onClick={() => onEdit({ truss_kg_m: perM })} style={{ ...btn, padding: '6px 10px' }}>{t('truss.useWeight', { kg: perM })}</button>
          )}
        </div>
      ) : (
        <p style={{ ...small, color: colors.soft }}>{table ? tableName(table) : t('truss.noType')}{line.defl_limit_mm ? ` · ${t('truss.deflLimitIs', { mm: line.defl_limit_mm })}` : ''}</p>
      )}

      {!table && <p style={{ ...small, color: colors.muted, marginTop: '4px' }}>{t('truss.chooseType')}</p>}
      {table && status === 'blocked' && (
        <p style={{ ...small, color: colors.danger, display: 'flex', gap: '4px', alignItems: 'flex-start', marginTop: '4px' }}>
          <Ban size={13} aria-hidden="true" style={{ flexShrink: 0, marginTop: '3px' }} />
          <span>{t('truss.blocked')}{mark?.note ? ` ${t('truss.blockedWhy', { note: mark.note })}` : ''}</span>
        </p>
      )}
      {table && status === 'unchecked' && (
        <p role="status" style={{ ...small, color: colors.warn, marginTop: '4px' }}>
          {anyChecked ? t('truss.notChecked') : t('truss.noneChecked')}{' '}
          <Link to="/admin/truss" style={{ color: colors.accentText }}>{t('truss.openReview')}</Link>
        </p>
      )}

      {result && (
        <div style={{ marginTop: '6px' }}>
          <p style={{ ...small, color: colors.soft }}>
            {t('truss.usedTable', { table: tableName(table), title: table.source.title, edition: table.source.edition })}
            {' · '}{t('truss.checkedBy', { name: mark.checked_by_name, date: fmt(mark.checked_at, 'd MMM yyyy') })}
          </p>
          {(result.cantilever || result.continuous) && (
            <p style={{ ...small, color: colors.warn, display: 'flex', gap: '4px', alignItems: 'flex-start' }}>
              <AlertTriangle size={13} aria-hidden="true" style={{ flexShrink: 0, marginTop: '3px' }} />
              {t(result.cantilever ? 'truss.cantilever' : 'truss.continuous')}
            </p>
          )}
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
            {result.spans.map((s, i) => {
              const Icon = ICON[s.status]
              return (
                <li key={i} style={{ ...small, borderTop: i ? '1px solid var(--line)' : 'none', paddingTop: i ? '6px' : 0 }}>
                  <p style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong>{t('truss.span', { n: i + 1, from: s.from, to: s.to })}</strong>
                    <span style={{ color: colour(s.status), display: 'inline-flex', gap: '4px', alignItems: 'center', fontWeight: 600 }}>
                      <Icon size={13} aria-hidden="true" /> {t(`truss.verdict.${s.status}`, { use: s.use !== undefined ? pct(s.use) : 0, from: s.range?.[0], to: s.range?.[1] })}
                    </span>
                  </p>
                  {s.row && (
                    <>
                      <p style={{ color: colors.muted }}>
                        {s.exact ? t('truss.row', { m: s.rowSpan }) : s.below ? t('truss.rowBelow', { m: s.rowSpan }) : t('truss.rowLonger', { m: s.rowSpan })}
                      </p>
                      <p style={{ color: colors.soft, fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
                        {['udl', 'cpl', 'tpl', 'qpl'].filter(k => s.cases[k]).map(k => t(`truss.case.${k}`, { actual: s.cases[k].actual, allowed: s.cases[k].allowed, use: pct(s.cases[k].combined) })).join(' · ')}
                      </p>
                      <p style={{ color: s.deflection.verdict === 'fail' ? colors.danger : colors.muted }}>
                        {s.deflection.mm === null ? t('truss.deflUnknown')
                          : s.deflection.limit ? t(`truss.defl.${s.deflection.verdict}`, { mm: s.deflection.mm, limit: s.deflection.limit })
                            : t('truss.deflEstimate', { mm: s.deflection.mm })}
                      </p>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
          <p style={{ ...small, color: colors.muted, marginTop: '4px' }}>
            {t('truss.method', { factor: settings.dynamic_factor })}{' '}
            {result.selfWeightIncluded ? t('truss.selfIncluded') : t('truss.selfAdded')}
          </p>
          {table.conditions.length > 0 && (
            <details style={{ ...small, color: colors.muted, marginTop: '4px' }}>
              <summary style={{ cursor: 'pointer' }}>{t('truss.conditions')}</summary>
              <ul style={{ paddingLeft: '18px' }}>{table.conditions.map(c => <li key={c} lang="en">{c}</li>)}</ul>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
