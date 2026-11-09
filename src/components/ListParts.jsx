import { colors, space } from './ui'

// The list-page pattern (DESIGN.md "Room to breathe", DR3): filters as tabs with a 2px bar, rows with
// hairlines between them instead of a card per row. Used by Quotes, Invoices, Inventory, Contacts,
// Expenses, Hours, Leave, Jobs and Find crew.

// The page column under the AppShell: 960px, the page gutter, the header 32px above the first section.
export const pageWrap = { maxWidth: '960px', margin: '0 auto', padding: `${space[6]} var(--gutter) ${space[7]}` }

// Filters or tabs as a row of words; the selected one is `text` + a 2px accent bar (never a fill).
//   <FilterTabs label={t('quotes.status')} value={status} onChange={setStatus}
//     items={[{ key: 'all', label: t('quotes.allStatuses'), count: 12 }, …]} />
// tabs: true for tabs that switch a whole panel (role="tab"); otherwise each is a toggle button (aria-pressed).
export function FilterTabs({ items, value, onChange, label, tabs = false, style }) {
  return (
    <div role={tabs ? 'tablist' : 'group'} aria-label={label} style={{
      display: 'flex', gap: space[1], borderBottom: `1px solid ${colors.line}`, overflowX: 'auto', overflowY: 'hidden',
      scrollbarWidth: 'none', ...style,
    }}>
      {items.map(it => {
        const on = value === it.key
        return (
          <button key={it.key} type="button" onClick={() => onChange(it.key)}
            {...(tabs ? { role: 'tab', 'aria-selected': on } : { 'aria-pressed': on })}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: space[2], padding: `${space[3]} ${space[3]}`, minHeight: '44px',
              border: 'none', borderBottom: `2px solid ${on ? colors.accent : 'transparent'}`, marginBottom: '-1px',
              background: 'none', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, font: 'inherit', fontSize: '14px',
              fontWeight: on ? 700 : 500, color: on ? colors.text : colors.muted,
            }}>
            {it.icon}{it.label}
            {it.count != null && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: colors.muted }}>{it.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

// A list of rows with a hairline between them (and one above the first).
//   <ul style={rowList}>{items.map(x => <li key={x.id} style={row}>…</li>)}</ul>
export const rowList = { listStyle: 'none', margin: 0, padding: 0, borderTop: `1px solid ${colors.line}` }
export const row = {
  display: 'flex', alignItems: 'center', gap: space[3], padding: `${space[3]} 0`, minHeight: '52px',
  borderBottom: `1px solid ${colors.line}`, minWidth: 0,
}
// A whole row you can open: a button with no box of its own.
export const rowButton = {
  ...row, width: '100%', background: 'none', border: 'none', borderBottom: `1px solid ${colors.line}`, textAlign: 'left',
  cursor: 'pointer', color: colors.text, font: 'inherit',
}
// The name line and the meta line of a row.
export const rowName = { display: 'block', fontSize: '14px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
export const rowMeta = { display: 'block', fontSize: '13px', color: colors.muted, overflowWrap: 'anywhere' }
