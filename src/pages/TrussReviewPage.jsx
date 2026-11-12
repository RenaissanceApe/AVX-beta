import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ShieldCheck, ExternalLink, Ban, CheckCircle2, CircleHelp, Undo2, ArrowLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { track } from '../lib/usage'
import { loadTrussChecks } from '../lib/trussChecks'
import { TRUSS_TABLES, tableById, tableName, tableStatus, markFor } from '../lib/trussTables'
import { useI18n } from '../i18n'
import { btn, btnPrimary, btnDanger, card, colors, AvxLoader } from '../components/ui'
import AppShell from '../components/shell/AppShell'
import { PageHelp } from '../components/help/HelpParts'

const hint = { fontSize: '13px', color: colors.muted, lineHeight: 1.5 }
const h2 = { fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }
const STATUS_ICON = { checked: CheckCircle2, unchecked: CircleHelp, blocked: Ban }
const statusColour = s => (s === 'checked' ? colors.accentText : s === 'blocked' ? colors.danger : colors.warn)
const BRANDS = [...new Set(TRUSS_TABLES.map(x => x.brand))]

// The truss tables' second check (docs/TRUSS_DATA.md, RG2). Everyone signed in can see each table,
// its source and its marks; an AVX admin (with two-step sign-in) compares a table row by row with
// the manufacturer's document and marks that edition checked, or blocked with the reason, and can
// take a mark back. The marks count for every organisation.
//   /admin/truss            the list
//   /admin/truss?table=<id> one table
export default function TrussReviewPage() {
  const { t, fmt } = useI18n()
  const { notify } = useToast()
  const [params, setParams] = useSearchParams()
  const [checks, setChecks] = useState(null)
  const [admin, setAdmin] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const r = await loadTrussChecks()
    setChecks(r.checks)
  }, [])
  useEffect(() => {
    load()
    supabase.rpc('am_avx_admin').then(({ data, error }) => {
      if (error) return logger.warn('truss', error, { step: 'admin' })
      setAdmin(!!data)
    })
  }, [load])

  const table = tableById(params.get('table'))
  const open = id => setParams(id ? { table: id } : {})

  async function act(fn, args, done) {
    setBusy(true)
    const { error } = await supabase.rpc(fn, args)
    setBusy(false)
    if (error) { logger.error('truss', error, { step: fn }); return notify(userMessage(error), 'error') }
    notify(t(done), 'success')
    track(`truss:${fn}`)
    load()
  }

  if (!checks) return <AppShell><div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}><AvxLoader size={24} color={colors.accentText} /></div></AppShell>
  const counts = TRUSS_TABLES.reduce((m, x) => ({ ...m, [tableStatus(x, checks)]: (m[tableStatus(x, checks)] || 0) + 1 }), {})

  return (
    <AppShell>
      <div style={{ maxWidth: '880px', margin: '0 auto', padding: '24px 16px 48px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}><ShieldCheck size={22} aria-hidden="true" /> {t('trussReview.title')}</h1>
            <PageHelp page="truss-review" />
          </div>
          <p style={{ ...hint, marginTop: '4px' }}>{t('trussReview.intro')}</p>
          <p style={{ ...hint, marginTop: '4px' }}>{admin ? t('trussReview.asAdmin') : t('trussReview.asReader')}</p>
        </div>

        {table ? (
          <TableReview key={table.id} table={table} checks={checks} admin={admin} busy={busy} act={act} onBack={() => open(null)} />
        ) : (
          <>
            <p role="status" style={{ ...card, padding: '12px 14px', fontSize: '13px', lineHeight: 1.5 }}>
              {t('trussReview.counts', { checked: counts.checked || 0, unchecked: counts.unchecked || 0, blocked: counts.blocked || 0 })}
              {!counts.checked && <> {t('trussReview.noneYet')}</>}
            </p>
            {BRANDS.map(b => (
              <section key={b} aria-labelledby={`tr-${b}`} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <h2 id={`tr-${b}`} style={h2}>{b}</h2>
                <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {TRUSS_TABLES.filter(x => x.brand === b).map(x => {
                    const s = tableStatus(x, checks)
                    const Icon = STATUS_ICON[s]
                    const m = markFor(x, checks)
                    return (
                      <li key={x.id}>
                        <button type="button" onClick={() => open(x.id)} style={{ ...btn, width: '100%', justifyContent: 'flex-start', textAlign: 'left', flexWrap: 'wrap', gap: '8px', padding: '10px 12px' }}>
                          <strong style={{ overflowWrap: 'anywhere' }}>{tableName(x)}</strong>
                          <span style={{ color: colors.muted, fontWeight: 400 }}>{t('trussReview.edition', { edition: x.source.edition })}</span>
                          <span style={{ marginLeft: 'auto', color: statusColour(s), display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
                            <Icon size={14} aria-hidden="true" /> {t(`truss.status.${s}`)}
                            {m?.status === 'checked' && ` · ${m.checked_by_name}, ${fmt(m.checked_at, 'd MMM yyyy')}`}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </>
        )}
      </div>
    </AppShell>
  )
}

function colName(t, c) {
  let m
  if ((m = /^p(\d)_kg$/.exec(c))) return t('truss.col.p', { n: Number(m[1]) - 1 })
  if ((m = /^p(\d)_defl_mm$/.exec(c))) return t('truss.col.pDefl', { n: Number(m[1]) - 1 })
  return t(`truss.col.${c}`)
}

function TableReview({ table, checks, admin, busy, act, onBack }) {
  const { t, fmt } = useI18n()
  const status = tableStatus(table, checks)
  const mark = markFor(table, checks)
  const history = checks.filter(c => c.table_id === table.id)
  const [ticked, setTicked] = useState(() => new Set())
  const canMark = admin && !mark && table.status !== 'blocked'
  const all = ticked.size === table.rows.length
  const Icon = STATUS_ICON[status]
  const src = table.source
  const toggle = i => setTicked(s => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n })
  const head = useMemo(() => table.columns.map(c => colName(t, c)), [table, t])

  return (
    <section aria-labelledby="tr-table" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <button type="button" onClick={onBack} style={{ ...btn, alignSelf: 'flex-start' }}><ArrowLeft size={14} aria-hidden="true" /> {t('trussReview.back')}</button>
      <div>
        <h2 id="tr-table" style={{ ...h2, fontSize: '20px' }}>{tableName(table)}</h2>
        <p style={{ fontSize: '14px', color: statusColour(status), display: 'flex', gap: '4px', alignItems: 'center', marginTop: '4px', fontWeight: 600 }}>
          <Icon size={14} aria-hidden="true" /> {t(`truss.status.${status}`)}
        </p>
        {table.status === 'blocked' && <p style={{ ...hint, color: colors.danger }}>{t('trussReview.blockedInRepo')}</p>}
      </div>

      <div style={{ ...card, padding: '12px 14px', fontSize: '13px', lineHeight: 1.6 }}>
        <p><strong>{t('trussReview.source')}</strong> {src.publisher} · <span lang="en">{src.title}</span></p>
        <p>{t('trussReview.editionLine', { edition: src.edition, retrieved: src.retrieved })}{src.page ? ` · ${t('trussReview.page', { page: src.page })}` : ''}</p>
        <p style={{ overflowWrap: 'anywhere', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>SHA-256 {src.sha256}</p>
        <p><a href={src.url} target="_blank" rel="noreferrer" style={{ color: colors.accentText, display: 'inline-flex', gap: '4px', alignItems: 'center' }}>{t('trussReview.openDocument')} <ExternalLink size={13} aria-hidden="true" /></a></p>
        {table.crossCheck && <p style={{ color: colors.muted }}>{t('trussReview.crossCheck', { title: table.crossCheck.title, edition: table.crossCheck.edition, result: table.crossCheck.result })}</p>}
        {table.conditions.length > 0 && (
          <>
            <p style={{ marginTop: '6px' }}><strong>{t('truss.conditions')}</strong></p>
            <ul style={{ paddingLeft: '18px' }}>{table.conditions.map(c => <li key={c} lang="en">{c}</li>)}</ul>
          </>
        )}
        {(table.issues || []).length > 0 && (
          <>
            <p style={{ marginTop: '6px', color: colors.danger }}><strong>{t('trussReview.issues')}</strong></p>
            <ul style={{ paddingLeft: '18px' }}>{table.issues.map(c => <li key={c} lang="en">{c}</li>)}</ul>
          </>
        )}
        {(table.questions || []).length > 0 && (
          <>
            <p style={{ marginTop: '6px', color: colors.danger }}><strong>{t('trussReview.questions')}</strong></p>
            <ul style={{ paddingLeft: '18px' }}>{table.questions.map(c => <li key={c} lang="en">{c}</li>)}</ul>
          </>
        )}
      </div>

      <div>
        <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>{t('trussReview.rows', { count: table.rows.length })}</h3>
        <p style={hint}>{canMark ? t('trussReview.rowsHowAdmin') : t('trussReview.rowsHow')}</p>
        <div style={{ overflowX: 'auto', marginTop: '8px' }} tabIndex={0} role="region" aria-label={t('trussReview.rows', { count: table.rows.length })}>
          <table style={{ borderCollapse: 'collapse', fontSize: '13px', fontFamily: 'var(--font-mono)', minWidth: '100%' }}>
            <thead>
              <tr>
                {canMark && <th scope="col" style={th}>{t('trussReview.matches')}</th>}
                {head.map((h, i) => <th key={i} scope="col" style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i} style={{ background: ticked.has(i) ? colors.selection : undefined }}>
                  {canMark && (
                    <td style={td}>
                      <input type="checkbox" checked={ticked.has(i)} onChange={() => toggle(i)} aria-label={t('trussReview.rowMatches', { m: r[0] })} />
                    </td>
                  )}
                  {r.map((v, j) => j === 0 ? <th key={j} scope="row" style={td}>{v}</th> : <td key={j} style={td}>{v ?? '—'}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {canMark && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" disabled={!all || busy} style={btnPrimary}
            onClick={() => act('mark_truss_table', { p_table: table.id, p_edition: src.edition, p_sha256: src.sha256, p_status: 'checked', p_rows: table.rows.length }, 'trussReview.markedChecked')}>
            <CheckCircle2 size={14} aria-hidden="true" /> {t('trussReview.markChecked', { done: ticked.size, count: table.rows.length })}
          </button>
          <button type="button" disabled={busy} style={btnDanger}
            onClick={() => { const why = window.prompt(t('trussReview.blockWhy')); if (why && why.trim()) act('mark_truss_table', { p_table: table.id, p_edition: src.edition, p_sha256: src.sha256, p_status: 'blocked', p_note: why }, 'trussReview.markedBlocked') }}>
            <Ban size={14} aria-hidden="true" /> {t('trussReview.markBlocked')}
          </button>
          <span style={hint}>{t('trussReview.twoStep')}</span>
        </div>
      )}
      {admin && mark && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" disabled={busy} style={btn}
            onClick={() => { const why = window.prompt(t('trussReview.withdrawWhy')); if (why && why.trim()) act('withdraw_truss_mark', { p_id: mark.id, p_note: why }, 'trussReview.withdrawn') }}>
            <Undo2 size={14} aria-hidden="true" /> {t('trussReview.withdraw')}
          </button>
        </div>
      )}

      <div>
        <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>{t('trussReview.history')}</h3>
        {history.length === 0 ? <p style={hint}>{t('trussReview.noHistory')}</p> : (
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {history.map(c => (
              <li key={c.id} style={{ ...card, padding: '8px 12px', fontSize: '13px', lineHeight: 1.5 }}>
                <p>
                  <strong>{t(`truss.status.${c.status}`)}</strong> · {t('trussReview.by', { name: c.checked_by_name, date: fmt(c.checked_at, 'd MMM yyyy, HH:mm') })}
                  {' · '}{t('trussReview.edition', { edition: c.edition })}
                  {c.source_sha256 !== src.sha256 && ` · ${t('trussReview.otherDocument')}`}
                  {c.rows_checked && ` · ${t('trussReview.rowsCompared', { count: c.rows_checked })}`}
                </p>
                {c.note && <p style={{ color: colors.soft, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>“{c.note}”</p>}
                {c.withdrawn_at && (
                  <p style={{ color: colors.muted }}>
                    {t('trussReview.withdrawnBy', { name: c.withdrawn_by_name, date: fmt(c.withdrawn_at, 'd MMM yyyy, HH:mm') })}
                    {c.withdrawn_note && <> — “{c.withdrawn_note}”</>}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p style={hint}>{t('rig.aidTitle')} {t('trussReview.aid')}</p>
    </section>
  )
}

const th = { textAlign: 'right', padding: '4px 8px', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap', fontWeight: 600, fontFamily: 'inherit' }
const td = { textAlign: 'right', padding: '4px 8px', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap', fontWeight: 400 }
