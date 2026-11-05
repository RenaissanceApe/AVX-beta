// CSV for reports (Inventory → Reports and the Reports area). The figures themselves are
// counted in the database since K1 (docs/ANALYTICS.md, "How K1 works").

// The report as CSV (semicolon-separated, which spreadsheets in Portugal open directly)
export function reportCsv(rows, headers) {
  const cell = v => {
    const s = v == null ? '' : typeof v === 'number' ? String(Math.round(v * 100) / 100).replace('.', ',') : String(v)
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [headers.map(h => cell(h.label)).join(';'), ...rows.map(r => headers.map(h => cell(h.value(r))).join(';'))].join('\n')
}
