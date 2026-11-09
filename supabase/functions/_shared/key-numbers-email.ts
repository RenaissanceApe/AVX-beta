// The weekly key-numbers email (K9, docs/ANALYTICS.md "How K9 works"): the text and the layout,
// in English and Portuguese. Pure functions, so Vitest checks them (src/lib/keyNumbersEmail.test.js).
// `numbers` is what public.weekly_key_numbers returns: the Overview's numbers (report_overview and
// the K4–K8 functions merged), the same keys src/lib/analytics/tiles.js reads.

export type Lang = 'en' | 'pt'
type Numbers = Record<string, unknown>
type Money = Record<string, number | string>

const TEXT: Record<Lang, Record<string, string>> = {
  en: {
    subject: '{org}: key numbers for the week of {date}',
    intro: 'Your weekly key numbers for {org}. Money excludes VAT; each currency is shown on its own.',
    open: 'Open the reports',
    footer: 'You get this because you turned on the weekly key numbers in AVX (Settings → Notifications). Turn it off there at any time.',
    gigsThisMonth: 'Gigs this month', revenueThisMonth: 'Revenue this month', revenueNext30: 'Confirmed revenue, next 30 days',
    waitingQuotes: 'Quotes waiting', followUp: 'Quotes to follow up', overdueNow: 'Overdue invoices', cashIn30: 'Expected in, next 30 days',
    expensesDue14: 'Bills due in 14 days', crewToPay: 'Crew fees to pay', openPositions14: 'Open crew positions, next 14 days',
    itemsShort30: 'Items short, next 30 days', overdueTasks: 'Overdue tasks',
    countQuotes: '{count} quotes', countQuote: '1 quote', countInvoices: '{count} invoices', countInvoice: '1 invoice',
  },
  pt: {
    subject: '{org}: números-chave da semana de {date}',
    intro: 'Os números-chave semanais de {org}. Valores sem IVA; cada moeda aparece à parte.',
    open: 'Abrir os relatórios',
    footer: 'Recebe este email porque ativou os números-chave semanais no AVX (Definições → Notificações). Pode desativá-los aí a qualquer momento.',
    gigsThisMonth: 'Eventos este mês', revenueThisMonth: 'Receita este mês', revenueNext30: 'Receita confirmada, próximos 30 dias',
    waitingQuotes: 'Orçamentos à espera', followUp: 'Orçamentos a acompanhar', overdueNow: 'Faturas em atraso', cashIn30: 'A receber, próximos 30 dias',
    expensesDue14: 'Contas a pagar em 14 dias', crewToPay: 'Cachês da equipa a pagar', openPositions14: 'Funções por preencher, próximos 14 dias',
    itemsShort30: 'Artigos em falta, próximos 30 dias', overdueTasks: 'Tarefas em atraso',
    countQuotes: '{count} orçamentos', countQuote: '1 orçamento', countInvoices: '{count} faturas', countInvoice: '1 fatura',
  },
}

const fill = (s: string, vars: Record<string, unknown>) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''))
const locale = (lang: Lang) => (lang === 'pt' ? 'pt-PT' : 'en-GB')

export function formatMoney(amount: number, currency: string, lang: Lang) {
  try {
    return new Intl.NumberFormat(locale(lang), { style: 'currency', currency }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

// Money per currency, the biggest first, never added together; nothing → a zero in euros
export function moneyText(by: unknown, lang: Lang) {
  const lines = Object.entries((by || {}) as Money).map(([c, a]) => [c, Number(a) || 0] as const).sort((x, y) => y[1] - x[1])
  if (!lines.length) return formatMoney(0, 'EUR', lang)
  return lines.map(([c, a]) => formatMoney(a, c, lang)).join(' · ')
}

// The Monday (UTC) of the week a date is in, as YYYY-MM-DD: one email per person, organisation and week
export function weekStart(at: Date) {
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()))
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

function dateText(iso: string, lang: Lang) {
  return new Intl.DateTimeFormat(locale(lang), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))
}

const get = (o: Numbers, path: string) => path.split('.').reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined), o)
const num = (v: unknown) => Number(v) || 0

// The lines of the email: [label, value, extra?, link path]
export function keyNumberLines(n: Numbers, lang: Lang) {
  const s = TEXT[lang]
  const count = (c: number, one: string, many: string) => (c === 1 ? s[one] : fill(s[many], { count: c }))
  return [
    { key: 'gigsThisMonth', value: String(num(get(n, 'gigs_this_month.total'))), path: '' },
    { key: 'revenueThisMonth', value: moneyText(n.revenue_this_month, lang), path: '/reports?tab=money' },
    { key: 'revenueNext30', value: moneyText(n.revenue_next_30, lang), path: '/reports?tab=revenue' },
    { key: 'waitingQuotes', value: moneyText(get(n, 'waiting.totals'), lang), extra: count(num(get(n, 'waiting.count')), 'countQuote', 'countQuotes'), path: '/reports?tab=sales' },
    { key: 'followUp', value: String(num(get(n, 'follow_up.count'))), path: '/quotes?status=follow_up' },
    { key: 'overdueNow', value: moneyText(n.overdue_now, lang), extra: count(num(n.overdue_count), 'countInvoice', 'countInvoices'), path: '/invoices?view=unpaid' },
    { key: 'cashIn30', value: moneyText(n.cash_in_30, lang), path: '/reports?tab=money&view=cash' },
    { key: 'expensesDue14', value: moneyText(n.expenses_due_14, lang), path: '/expenses?view=unpaid' },
    { key: 'crewToPay', value: moneyText(n.crew_to_pay, lang), path: '/expenses?view=crew' },
    { key: 'openPositions14', value: String(num(n.open_positions_14)), path: '/reports?tab=operations&view=staffing' },
    { key: 'itemsShort30', value: String(num(n.items_short_30)), path: '/reports?tab=warehouse' },
    { key: 'overdueTasks', value: String(num(n.overdue_tasks)), path: '/reports?tab=operations&view=tasks' },
  ].map(l => ({ ...l, label: s[l.key] }))
}

function escapeHtml(v: string) {
  return v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

export function renderKeyNumbersEmail(n: Numbers, opts: { lang: Lang; orgName: string; orgId: string; appUrl: string; week: string }) {
  const { lang, orgName, orgId, appUrl, week } = opts
  const s = TEXT[lang]
  const base = `${appUrl}/org/${orgId}`
  const lines = keyNumberLines(n, lang)
  const subject = fill(s.subject, { org: orgName, date: dateText(week, lang) })
  const intro = fill(s.intro, { org: orgName })
  const html = `<!doctype html><html lang="${lang}"><body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:12px;padding:28px" cellpadding="0" cellspacing="0">
<tr><td colspan="2" style="font-size:20px;font-weight:800;padding-bottom:6px">AVX</td></tr>
<tr><td colspan="2" style="font-size:14px;color:#444;padding-bottom:18px">${escapeHtml(intro)}</td></tr>
${lines.map(l => `<tr><td style="padding:10px 8px 10px 0;border-top:1px solid #eee;font-size:14px"><a href="${escapeHtml(base + l.path)}" style="color:#111;text-decoration:none">${escapeHtml(l.label)}</a></td><td style="padding:10px 0;border-top:1px solid #eee;font-size:14px;font-weight:700;text-align:right">${escapeHtml(l.value)}${l.extra ? `<div style="font-size:12px;font-weight:400;color:#666">${escapeHtml(l.extra)}</div>` : ''}</td></tr>`).join('\n')}
<tr><td colspan="2" style="padding-top:20px"><a href="${escapeHtml(base)}/reports" style="display:inline-block;background:#1ec878;color:#04110a;font-weight:700;font-size:14px;padding:12px 20px;border-radius:8px;text-decoration:none">${escapeHtml(s.open)}</a></td></tr>
<tr><td colspan="2" style="padding-top:22px;font-size:12px;color:#888;line-height:1.5">${escapeHtml(s.footer)}</td></tr>
</table></td></tr></table></body></html>`
  const text = [intro, '', ...lines.map(l => `• ${l.label}: ${l.value}${l.extra ? ` (${l.extra})` : ''}`), '', `${s.open}: ${base}/reports`, '', s.footer].join('\n')
  return { subject, html, text }
}
