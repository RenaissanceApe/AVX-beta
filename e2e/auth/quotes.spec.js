// Quotes, invoices and payments (AT3): the owner's manual test lines T7, T67, T75, T77 and T102
// (docs/PENDING.md section 2) as signed-in journeys on the TEST project. The data is made through
// the database API as the test users (setup.js); the browser clicks only through what each line
// tests. docs/TESTING.md, "Automated test suite"; what stays manual is in docs/notes/AT3.md.
import { test, expect } from './fixtures.js'
import { expectAccessible } from './helpers.js'
import { addQuote, addItem, addClient, addGig, pageAs } from './setup.js'
import { readPdfText } from './files.js'
import { runOverdueInvoiceReminders } from './testSupport.js'
import { quoteSnapshot, quoteTotals } from '../../src/lib/quotes.js'
import { quoteInvoiceLines } from '../../src/lib/invoices.js'

test.use({ area: 'quotes' })

const AREA = '@quotes'
const stamp = () => Date.now().toString(36)
const localDate = (days = 0) => {
  const d = new Date(Date.now() + days * 86400e3)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const must = (what, { data, error }) => {
  if (error) throw new Error(`${what} failed: ${error.message}`)
  return data
}

// ---- Set-up for this file (the same calls the app makes, as the test user) ----

// A quote the client has accepted (the editor's status menu allows Accepted by hand)
async function acceptedQuote(account, org, fields = {}) {
  const quote = await addQuote(account, org, fields)
  return must('Accepting the quote', await account.client.from('quotes').update({ status: 'accepted' }).eq('id', quote.id).select().single())
}

// A client link for the quote (what "Send to client" → Create link does): saves a version, then
// send-quote makes the link without emailing it. Returns the path of the public page (/q/<token>).
async function quoteLink(account, quote) {
  const snapshot = quoteSnapshot(quote, quote.body)
  const version = must('Saving a quote version', await account.client.from('quote_versions').insert({
    quote_id: quote.id, org_id: quote.org_id, note: 'E2E', snapshot, total_net: quoteTotals({ ...quote, body: snapshot.body }).net,
  }).select('id').single())
  const { data, error } = await account.client.functions.invoke('send-quote', {
    body: { quote_id: quote.id, version_id: version.id, email: '', send_email: false, request_key: crypto.randomUUID() },
  })
  if (error) throw new Error(`send-quote failed: ${error.message}`)
  const token = new URL(data.link).pathname.split('/q/')[1]
  if (!token) throw new Error(`send-quote gave no link: ${JSON.stringify(data)}`)
  return `/q/${token}`
}

// An invoice for the whole quote, made by hand like the app does: draft → sent to the program → issued
async function issuedInvoice(account, quote, { legal = `FT E2E/${stamp()}`, gigId = null, issueDate = localDate(0), dueDate = localDate(30) } = {}) {
  const draft = must('Creating the invoice', await account.client.from('invoices').insert({
    org_id: quote.org_id, kind: 'invoice', quote_id: quote.id, gig_id: gigId, client_name: quote.client_name || 'E2E Client',
    scope: 'all', language: 'en', currency: 'EUR', lines: quoteInvoiceLines(quote), issue_date: issueDate, due_date: dueDate,
  }).select().single())
  must('Marking the invoice sent', await account.client.from('invoices').update({ status: 'sent' }).eq('id', draft.id))
  return must('Issuing the invoice', await account.client.from('invoices').update({ status: 'issued', legal_number: legal }).eq('id', draft.id).select().single())
}

// The public quote page in a window with no account (a client), English
async function clientPage(browser, baseURL, path) {
  const context = await browser.newContext({ baseURL })
  const page = await context.newPage()
  await page.goto(path)
  return page
}

// The client's answer form (Accept / Decline): the page also has the conversation's own name field
const answerForm = page => page.locator('form', { has: page.getByRole('button', { name: /^(Accept|Decline) quote$/ }) })

// The quote's saved fields, once the editor has saved them (it saves a moment after each change)
const saved = (account, quoteId, pick) => expect.poll(async () => pick((await account.client.from('quotes').select('*').eq('id', quoteId).single()).data), { timeout: 15_000 })

// Draws a stroke on the signature pad
async function drawSignature(page) {
  const canvas = page.locator('canvas').first()
  await expect(canvas).toBeVisible()
  const box = await canvas.boundingBox()
  await page.mouse.move(box.x + 20, box.y + box.height / 2)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + 20 + i * 18, box.y + box.height / 2 + (i % 2 ? -15 : 15), { steps: 3 })
  await page.mouse.up()
}

// ---- T7 ----

// covers: T7
test('quote to gig: catalogue items, availability, accepted from the client link, gig filled from it', { tag: ['@smoke', AREA] }, async ({ adminWithOrg, browser, baseURL }) => {
  const { page, account, org } = adminWithOrg
  const itemName = `E2E Speaker ${stamp()}`
  await addItem(account, org.id, { name: itemName, unit_price: 80 })
  const quote = await addQuote(account, org, { title: `E2E Quote to gig ${stamp()}`, client_name: 'E2E Client' })

  await page.goto(quote.path)
  await page.getByRole('tab', { name: /^Phase 1/ }).click()
  await page.getByLabel('From', { exact: true }).fill(localDate(20))
  await page.getByLabel('To', { exact: true }).fill(localDate(21))
  // Add the catalogue item through the price list
  await page.getByRole('button', { name: 'From price list' }).click()
  const picker = page.getByRole('dialog')
  await picker.getByLabel('Search').fill(itemName)
  await picker.getByText(itemName).click()
  await picker.getByRole('button', { name: /^Add/ }).click()
  await expect(page.getByRole('textbox', { name: 'Description' })).toHaveValue(itemName)
  await saved(account, quote.id, q => q.body.phases[0].sections[0].lines.map(l => l.description)).toEqual([itemName])
  await expectAccessible(page)

  // Availability: the item is checked against stock for the phase's dates
  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Availability' }).click()
  const avail = page.getByRole('dialog', { name: 'Is the equipment free?' })
  await expect(avail.getByText(/^For .*including prep and return days\.$/)).toBeVisible({ timeout: 15_000 })
  await expect(avail.getByText(itemName)).toBeVisible()
  await expectAccessible(page)
  await avail.getByRole('button', { name: /Close/ }).click()

  // The client accepts from the link
  const link = await quoteLink(account, { ...quote, body: (await account.client.from('quotes').select('body').eq('id', quote.id).single()).data.body })
  const client = await clientPage(browser, baseURL, link)
  await client.getByRole('button', { name: 'Accept', exact: true }).click()
  await answerForm(client).getByRole('textbox', { name: /Your name/ }).fill('E2E Client Person')
  await client.getByRole('button', { name: 'Accept quote' }).click()
  await expect(client.getByText(/^Accepted by E2E Client Person/)).toBeVisible({ timeout: 15_000 })
  await client.context().close()

  // Back in the app: the quote is accepted; create the gig and fill it from the quote
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Status' })).toHaveValue('accepted', { timeout: 15_000 })
  await page.getByRole('button', { name: 'Create gig' }).click()
  const plan = page.getByRole('dialog', { name: /^Fill .* from the quote$/ })
  await expect(plan.getByText(itemName)).toBeVisible({ timeout: 15_000 })
  await plan.getByRole('button', { name: /^Add to the gig/ }).click()
  await expect(page).toHaveURL(/\/gig\/[0-9a-f-]{36}/, { timeout: 15_000 })

  const { data: gig } = await account.client.from('quotes').select('gig_id, status, gig:gigs(id, status)').eq('id', quote.id).single()
  expect(gig.status).toBe('accepted')
  expect(gig.gig?.status).toBe('confirmed')
  const { data: gear } = await account.client.from('gig_equipment').select('quantity, item:price_items(name)').eq('gig_id', gig.gig_id)
  expect(gear?.map(g => g.item?.name)).toContain(itemName)
})

// ---- T67 (the quote and gig parts; the inventory, import and export parts: docs/notes/AT3.md) ----

// covers: T67
test('declining a quote asks why, and the button by the status shows the reason', { tag: AREA }, async ({ adminWithOrg }) => {
  const { page, account, org } = adminWithOrg
  const quote = await addQuote(account, org, { title: `E2E Declined ${stamp()}`, lines: [{ description: 'PA', qty: 1, unit_price: 100 }] })
  await page.goto(quote.path)
  await page.getByRole('combobox', { name: 'Status' }).selectOption('declined')
  const ask = page.getByRole('dialog', { name: 'Why was this quote lost?' })
  await expect(ask).toBeVisible()
  await expectAccessible(page)
  await ask.getByRole('combobox', { name: 'Reason' }).selectOption('price')
  await ask.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('button', { name: 'Lost: Price too high' })).toBeVisible()
  await saved(account, quote.id, q => [q.status, q.lost_reason]).toEqual(['declined', 'price'])

  // Skip keeps it declined with no reason
  const other = await addQuote(account, org, { title: `E2E Declined skip ${stamp()}` })
  await page.goto(other.path)
  await page.getByRole('combobox', { name: 'Status' }).selectOption('declined')
  await page.getByRole('dialog', { name: 'Why was this quote lost?' }).getByRole('button', { name: 'Skip' }).click()
  await expect(page.getByRole('button', { name: 'Why was it lost?' })).toBeVisible()
  await saved(account, other.id, q => [q.status, q.lost_reason]).toEqual(['declined', null])
})

// covers: T67
test('a client declines through the link with a note: the quote shows Declined and keeps the note', { tag: AREA }, async ({ adminWithOrg, browser, baseURL }) => {
  const { page, account, org } = adminWithOrg
  const quote = await addQuote(account, org, { title: `E2E Declined by link ${stamp()}`, lines: [{ description: 'PA', qty: 1, unit_price: 100 }] })
  const link = await quoteLink(account, quote)
  const note = `Too far away ${stamp()}`
  const client = await clientPage(browser, baseURL, link)
  await expect(client.getByText('Would you like to go ahead with this quote?')).toBeVisible({ timeout: 20_000 })
  await client.getByRole('button', { name: 'Decline', exact: true }).click()
  await answerForm(client).getByRole('textbox', { name: /Your name/ }).fill('E2E Client Person')
  await client.getByLabel('Reason (optional)').fill(note)
  await client.getByRole('button', { name: 'Decline quote' }).click()
  await expect(client.getByText(/^Declined by E2E Client Person/)).toBeVisible({ timeout: 15_000 })
  await client.context().close()

  await page.goto(quote.path)
  await expect(page.getByRole('combobox', { name: 'Status' })).toHaveValue('declined', { timeout: 15_000 })
  await page.getByRole('button', { name: 'Send to client' }).click()
  const sent = page.getByRole('dialog')
  await expect(sent.getByText(`“${note}”`)).toBeVisible({ timeout: 15_000 })
})

// covers: T67
test('"Create gig" from a quote with a client gives the gig that client', { tag: AREA }, async ({ adminWithOrg }) => {
  const { page, account, org } = adminWithOrg
  const client = await addClient(account, org.id, { name: `E2E Client ${stamp()}` })
  const quote = await addQuote(account, org, { title: `E2E Gig client ${stamp()}`, client_id: client.id, client_name: client.name })
  await page.goto(quote.path)
  await page.getByRole('button', { name: 'Create gig' }).click()
  await expect(page.getByRole('dialog', { name: /^Fill .* from the quote$/ })).toBeVisible({ timeout: 15_000 })
  await saved(account, quote.id, q => !!q.gig_id).toBe(true)
  const { data } = await account.client.from('quotes').select('gig:gigs(client_id)').eq('id', quote.id).single()
  expect(data.gig?.client_id).toBe(client.id)
})

// ---- T75 ----

// covers: T75
test('lines carry their own VAT: 0 % asks a reason, the summary and the printed quote show VAT per rate', { tag: AREA }, async ({ member }) => {
  const { page, account, org } = member
  const quote = await addQuote(account, org, {
    title: `E2E VAT rates ${stamp()}`,
    lines: [{ description: 'Speakers', qty: 1, unit_price: 100 }, { description: 'Books', qty: 1, unit_price: 50 }, { description: 'Export', qty: 1, unit_price: 10 }],
  })
  await page.goto(quote.path)
  await page.getByRole('tab', { name: /^Phase 1/ }).click()
  const vat = page.getByRole('spinbutton', { name: 'VAT %' })
  await expect(vat).toHaveCount(3)
  await expect(vat.nth(0)).toHaveValue('23')
  await vat.nth(1).fill('6')
  await vat.nth(2).fill('0')
  await expect(page.getByText('Reason for 0% VAT')).toBeVisible()
  await page.getByLabel('Reason for 0% VAT').selectOption({ index: 1 })
  await saved(account, quote.id, q => q.body.phases[0].sections[0].lines.map(l => [Number(l.vat_rate), !!l.vat_exemption])).toEqual([[23, false], [6, false], [0, true]])

  await page.getByRole('tab', { name: 'Summary' }).click()
  const main = page.getByRole('main')
  await expect(main.getByText('VAT 23% on €100.00')).toBeVisible()
  await expect(main.getByText('VAT 6% on €50.00')).toBeVisible()
  await expect(main.getByText(/VAT 0% on €10\.00/)).toBeVisible()
  await expectAccessible(page)

  await page.goto(`${quote.path}/print`)
  await expect(page.locator('.totals')).toContainText('VAT 23% on €100.00')
  await expect(page.locator('.totals')).toContainText('VAT 6% on €50.00')
  // 100 + 50 + 10 net, + 23 + 3 VAT
  await expect(page.locator('.totals')).toContainText('€186.00')
})

// covers: T75
test('invoices: a 30 % deposit, marked sent and issued by hand, then the rest less the deposit', { tag: AREA }, async ({ adminWithOrg }) => {
  const { page, account, org } = adminWithOrg
  const quote = await acceptedQuote(account, org, {
    title: `E2E Invoice ${stamp()}`, client_name: 'E2E Client', lines: [{ description: 'PA system', qty: 2, unit_price: 500 }],
  })
  await page.goto(`${org.path}/invoices`)
  await expect(page.getByRole('heading', { name: 'Invoices', level: 1 })).toBeVisible({ timeout: 15_000 })
  await expectAccessible(page)

  // The deposit
  await page.getByRole('button', { name: 'New invoice from a quote' }).first().click()
  const pick = page.getByRole('dialog', { name: 'Which quote?' })
  await pick.getByLabel('Search accepted quotes').fill(quote.title)
  await pick.getByRole('button', { name: new RegExp(quote.title) }).click()
  const modal = page.getByRole('dialog', { name: 'New invoice' })
  await expect(modal.getByText('What to invoice')).toBeVisible()
  // The whole quote first: €1,000 + 23 %
  await modal.getByText('The whole quote').click()
  await expect(modal.getByText('€1,230.00').first()).toBeVisible()
  await modal.getByText('A deposit').click()
  await modal.getByLabel('Deposit %').fill('30')
  await expect(modal.getByText('€369.00').first()).toBeVisible()
  await expectAccessible(page)
  await modal.getByRole('button', { name: 'Save draft' }).click()

  const deposit = page.getByRole('dialog', { name: /^Draft \d+$/ })
  await expect(deposit).toBeVisible({ timeout: 15_000 })
  await deposit.getByRole('button', { name: 'Mark as sent to my program' }).click()
  await expect(deposit.getByText('Waiting to be issued in your certified program. Add its number when it is.')).toBeVisible({ timeout: 15_000 })
  const legal = `FT E2E/${stamp()}`
  await deposit.getByRole('textbox', { name: 'Number in the certified program' }).fill(legal)
  await deposit.getByLabel('Link to the PDF (optional)').fill('https://example.com/e2e-invoice.pdf')
  await deposit.getByRole('button', { name: 'Mark as issued' }).click()
  const issued = page.getByRole('dialog', { name: legal })
  await expect(issued.getByText('Issued', { exact: true })).toBeVisible({ timeout: 15_000 })
  await expect(issued.getByRole('link', { name: 'Open the PDF' })).toHaveAttribute('href', 'https://example.com/e2e-invoice.pdf')
  await issued.getByRole('button', { name: /Close/ }).click()

  // The rest, less the deposit
  await page.getByRole('button', { name: 'New invoice from a quote' }).first().click()
  await page.getByRole('dialog', { name: 'Which quote?' }).getByRole('button', { name: new RegExp(quote.title) }).click()
  const rest = page.getByRole('dialog', { name: 'New invoice' })
  await rest.getByText('The rest, less deposits').click()
  await expect(rest.getByText('The whole quote, less 1 deposit invoice already made.')).toBeVisible()
  await expect(rest.getByText(`Less deposit ${legal}`)).toBeVisible()
  await expect(rest.getByText('€861.00').first()).toBeVisible()
  await rest.getByRole('button', { name: 'Save draft' }).click()
  await expect(page.getByRole('dialog', { name: /^Draft \d+$/ })).toBeVisible({ timeout: 15_000 })

  const { data: rows } = await account.client.from('invoices').select('scope, status, total').eq('quote_id', quote.id).is('removed_at', null).order('number')
  expect(rows).toEqual([{ scope: 'deposit', status: 'issued', total: 369 }, { scope: 'rest', status: 'draft', total: 861 }])
})

// A credit note for an issued invoice, made the way the app saves one (lines at the invoice's VAT)
async function issuedCredit(account, invoice, net) {
  const credit = must('Credit note', await account.client.from('invoices').insert({
    org_id: invoice.org_id, kind: 'credit_note', credited_invoice_id: invoice.id, client_name: invoice.client_name, language: 'en', currency: 'EUR',
    scope: 'credit', lines: [{ id: crypto.randomUUID(), kind: 'other', description: 'Credit, VAT 23%', qty: 1, unit_price: net, discount_pct: 0, vat_rate: 23 }],
  }).select().single())
  must('Sending the credit note', await account.client.from('invoices').update({ status: 'sent' }).eq('id', credit.id))
  return must('Issuing the credit note', await account.client.from('invoices').update({ status: 'issued', legal_number: `NC E2E/${stamp()}` }).eq('id', credit.id).select().single())
}

// covers: T75
test('a credit note for part of an issued invoice is fine; crediting more than is left is refused', { tag: AREA }, async ({ adminWithOrg }) => {
  const { page, account, org } = adminWithOrg
  const quote = await acceptedQuote(account, org, { title: `E2E Credit ${stamp()}`, client_name: 'E2E Client', lines: [{ description: 'PA system', qty: 1, unit_price: 100 }] })
  const invoice = await issuedInvoice(account, quote)
  const part = await issuedCredit(account, invoice, 40)
  expect(Number(part.total)).toBe(49.2)
  // 123 − 49.20 = 73.80 left: crediting €100 + VAT is refused by the database
  const tooMuch = await account.client.from('invoices').insert({
    org_id: org.id, kind: 'credit_note', credited_invoice_id: invoice.id, client_name: 'E2E Client', language: 'en', currency: 'EUR', scope: 'credit',
    lines: [{ id: crypto.randomUUID(), kind: 'other', description: 'Credit', qty: 1, unit_price: 100, discount_pct: 0, vat_rate: 23 }],
  }).select().single()
  expect(tooMuch.error?.message).toMatch(/credits more than is left/)

  // The invoice shows what is still due after the credit note
  await page.goto(`${org.path}/invoices?view=unpaid`)
  await page.getByRole('button', { name: new RegExp(invoice.legal_number.replace(/[/]/g, '\\/')) }).click()
  const dialog = page.getByRole('dialog', { name: invoice.legal_number })
  await expect(dialog.getByRole('region', { name: 'Payments' })).toContainText('To pay after credit notes€73.80')
})

// covers: T75
// Known app bug #208: "Credit note" on an issued invoice doesn't open a new credit note. The page
// opens the credit note with the same React key as the invoice it credits (InvoicesPage.jsx and
// QuoteInvoices.jsx: key={open.invoice?.id || … || open.creditOf?.id}), so the invoice's window stays
// as it is. Expected to fail until it is fixed; then the test.fail line comes out.
test('"Credit note" on an issued invoice opens a new credit note, which refuses more than is left', { tag: AREA }, async ({ adminWithOrg }) => {
  test.fail(true, 'App bug #208: the Credit note button doesn\'t open a new credit note')
  const { page, account, org } = adminWithOrg
  const quote = await acceptedQuote(account, org, { title: `E2E Credit button ${stamp()}`, client_name: 'E2E Client', lines: [{ description: 'PA system', qty: 1, unit_price: 100 }] })
  const invoice = await issuedInvoice(account, quote)
  await page.goto(`${org.path}/invoices?view=unpaid`)
  await page.getByRole('button', { name: new RegExp(invoice.legal_number.replace(/[/]/g, '\\/')) }).click()
  await page.getByRole('dialog', { name: invoice.legal_number }).getByRole('button', { name: 'Credit note' }).click()
  const credit = page.getByRole('dialog', { name: 'New credit note' })
  await expect(credit).toBeVisible()
  await expect(credit.getByText(`credits ${invoice.legal_number}`)).toBeVisible()
  await credit.locator('input[inputmode="decimal"]').nth(1).fill('100')
  await credit.getByRole('button', { name: 'Save draft' }).click()
  await expect(page.getByText('That credits more than is left on the invoice.')).toBeVisible({ timeout: 15_000 })
})

// covers: T75
test('an issued invoice: "Invoiced" in the quotes list, told to the client in the quote\'s conversation, no Moloni button', { tag: AREA }, async ({ adminWithOrg, browser, baseURL }) => {
  const { page, account, org } = adminWithOrg
  const quote = await acceptedQuote(account, org, { title: `E2E Told ${stamp()}`, client_name: 'E2E Client', lines: [{ description: 'PA system', qty: 1, unit_price: 137 }] })
  const link = await quoteLink(account, quote)
  const invoice = await issuedInvoice(account, quote)

  // An amount no other test uses, so the line is this quote's
  await page.goto(`${org.path}/quotes`)
  await expect(page.getByText('Invoiced €137.00')).toBeVisible({ timeout: 15_000 })

  await page.goto(`${org.path}/invoices?view=unpaid`)
  await page.getByRole('button', { name: new RegExp(invoice.legal_number.replace(/[/]/g, '\\/')) }).click()
  const dialog = page.getByRole('dialog', { name: invoice.legal_number })
  await expect(dialog.getByRole('button', { name: /Moloni/ })).toHaveCount(0)
  await expect(page.getByText(/Moloni/)).toHaveCount(0)
  await dialog.getByRole('button', { name: "Tell the client in the quote's conversation" }).click()
  await expect(page.getByText("Posted in the quote's conversation")).toBeVisible({ timeout: 15_000 })

  const client = await clientPage(browser, baseURL, link)
  await expect(client.getByRole('log').getByText(`Invoice ${invoice.legal_number} (€168.51) has been issued.`)).toBeVisible({ timeout: 20_000 })
  await client.context().close()
})

// covers: T75
test('a viewer has no Invoices page', { tag: AREA }, async ({ viewer }) => {
  const { page, org } = viewer
  await page.goto(`${org.path}/invoices`)
  await expect(page.getByText("Only the organisation's admins and members can see invoices.")).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('link', { name: 'Invoices' })).toHaveCount(0)
  await expectAccessible(page)
})

// covers: T75. Skips until the owner installs test_support.sql.
test('an overdue invoice: the next morning\'s job tells the quote\'s author and the admins', { tag: AREA }, async ({ adminWithOrg }) => {
  const { page, account, org } = adminWithOrg
  const quote = await acceptedQuote(account, org, { title: `E2E Overdue ${stamp()}`, client_name: 'E2E Client', lines: [{ description: 'PA', qty: 1, unit_price: 100 }] })
  // Issued 33 days ago, due 3 days ago
  const invoice = await issuedInvoice(account, quote, { issueDate: localDate(-33), dueDate: localDate(-3) })
  await runOverdueInvoiceReminders(account, org.id)
  // The admin (also the quote's author) is told
  const { data: notes } = await account.client.from('notifications').select('kind, details').eq('user_id', account.id).eq('kind', 'invoice_overdue')
  expect(notes.filter(n => n.details?.invoice_id === invoice.id).map(n => n.details.days)).toEqual([3])
  await page.goto(`${org.path}/invoices?view=unpaid`)
  await expect(page.getByRole('button', { name: new RegExp(invoice.legal_number.replace(/[/]/g, '\\/')) })).toContainText('3 days late', { timeout: 15_000 })
})

// ---- T77 ----

// covers: T77
test('payments: a part payment by MB Way, refusals, paid for the rest, a payment removed', { tag: AREA }, async ({ adminWithOrg }) => {
  const { page, account, org } = adminWithOrg
  const quote = await acceptedQuote(account, org, { title: `E2E Payments ${stamp()}`, client_name: 'E2E Client', lines: [{ description: 'PA system', qty: 1, unit_price: 1000 }] })
  const invoice = await issuedInvoice(account, quote)
  const name = new RegExp(invoice.legal_number.replace(/[/]/g, '\\/'))

  await page.goto(`${org.path}/invoices?view=unpaid`)
  await page.getByRole('button', { name }).click()
  const dialog = page.getByRole('dialog', { name: invoice.legal_number })
  const amount = dialog.getByRole('textbox', { name: 'Amount' })
  await expect(amount).toHaveValue('1230', { timeout: 15_000 })
  await expectAccessible(page)

  // More than is left, or a date tomorrow: refused before it reaches the database
  await amount.fill('2000')
  await expect(dialog.getByText('That is more than is left to pay (€1,230.00).')).toBeVisible()
  await expect(dialog.getByRole('button', { name: /^Record payment$/ })).toBeDisabled()
  await amount.fill('230')
  await dialog.getByLabel('Date paid').fill(localDate(1))
  await expect(dialog.getByText("The date can't be in the future.")).toBeVisible()
  await expect(dialog.getByRole('button', { name: /^Record payment$/ })).toBeDisabled()
  // …and by the database too
  const future = await account.client.from('invoice_payments').insert({ org_id: org.id, invoice_id: invoice.id, paid_on: localDate(1), amount: 10, method: 'cash' })
  expect(future.error?.message).toMatch(/can't be in the future/)
  const over = await account.client.from('invoice_payments').insert({ org_id: org.id, invoice_id: invoice.id, paid_on: localDate(0), amount: 5000, method: 'cash' })
  expect(over.error?.message).toMatch(/more than is left to pay/)

  // A part payment by MB Way
  await dialog.getByLabel('Date paid').fill(localDate(0))
  await dialog.getByLabel('How').selectOption({ label: 'MB Way' })
  await dialog.getByRole('button', { name: /^Record payment$/ }).click()
  await expect(page.getByText('Payment of €230.00 recorded')).toBeVisible({ timeout: 15_000 })
  await expect(dialog.getByRole('listitem').filter({ hasText: 'MB Way' })).toContainText('€230.00')
  await expect(amount).toHaveValue('1000')
  await dialog.getByRole('button', { name: /Close/ }).click()
  await expect(page.getByRole('button', { name }).getByText(/€1,000\.00 left to pay/)).toBeVisible({ timeout: 15_000 })

  // Mark as paid for the rest
  await page.getByRole('button', { name }).click()
  await dialog.getByRole('button', { name: 'Mark as paid' }).click()
  await expect(dialog.getByText('Paid', { exact: true }).first()).toBeVisible({ timeout: 15_000 })
  let row = must('Invoice', await account.client.from('invoices').select('status, paid_on').eq('id', invoice.id).single())
  expect(row).toEqual({ status: 'paid', paid_on: localDate(0) })

  // Remove a payment: back to unpaid
  page.once('dialog', d => d.accept())
  await dialog.getByRole('button', { name: 'Remove payment' }).first().click()
  await expect.poll(async () => (await account.client.from('invoices').select('status').eq('id', invoice.id).single()).data.status, { timeout: 15_000 }).toBe('issued')

  // A credit note covering what is left makes it paid
  const left = must('Payments', await account.client.from('invoice_payments').select('amount').eq('invoice_id', invoice.id).is('removed_at', null))
    .reduce((s, p) => s - Number(p.amount), 1230)
  await issuedCredit(account, invoice, Math.round(left / 1.23 * 100) / 100)
  row = must('Invoice', await account.client.from('invoices').select('status').eq('id', invoice.id).single())
  expect(row.status).toBe('paid')
})

// covers: T75, T77 (the Portuguese wording)
test('in Portuguese: the invoices page, an issued invoice\'s payments and the declined question', { tag: AREA }, async ({ adminWithOrg, browser, baseURL }) => {
  const { account, org } = adminWithOrg
  const quote = await acceptedQuote(account, org, { title: `E2E PT ${stamp()}`, client_name: 'E2E Cliente', lines: [{ description: 'Som', qty: 1, unit_price: 100 }] })
  const invoice = await issuedInvoice(account, quote)
  const page = await pageAs(browser, account, { baseURL, lang: 'pt' })
  try {
    await page.goto(`${org.path}/invoices?view=unpaid`)
    await expect(page.getByRole('heading', { name: 'Faturas', level: 1 })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Nova fatura de um orçamento' }).first()).toBeVisible()
    await page.getByRole('button', { name: new RegExp(invoice.legal_number.replace(/[/]/g, '\\/')) }).click()
    const dialog = page.getByRole('dialog', { name: invoice.legal_number })
    const payments = dialog.getByRole('region', { name: 'Pagamentos' })
    await expect(payments.getByText('Falta pagar')).toBeVisible({ timeout: 15_000 })
    await expect(payments.getByRole('button', { name: 'Marcar como paga' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Nota de crédito' })).toBeVisible()
    await expectAccessible(page)

    const draft = await addQuote(account, org, { title: `E2E PT recusado ${stamp()}` })
    await page.goto(draft.path)
    await page.getByRole('combobox', { name: 'Estado' }).selectOption('declined')
    await expect(page.getByRole('dialog', { name: 'Porque se perdeu este orçamento?' })).toBeVisible()
  } finally {
    await page.context().close()
  }
})

// covers: T77
test('a repair charged to the client goes on one invoice draft of the gig only, and off again', { tag: AREA }, async ({ adminWithOrg }) => {
  const { page, account, org } = adminWithOrg
  const gig = await addGig(account, org.id, { name: `E2E Repair gig ${stamp()}` })
  const item = await addItem(account, org.id, { name: `E2E Mixer ${stamp()}` })
  const problem = `Broken fader ${stamp()}`
  const repair = must('Repair', await account.client.from('repairs').insert({ org_id: org.id, item_id: item.id, gig_id: gig.id, problem, cost: 40, charge_client: true }).select().single())
  const quote = await acceptedQuote(account, org, { title: `E2E Repair quote ${stamp()}`, client_name: 'E2E Client', gig_id: gig.id, lines: [{ description: 'PA', qty: 1, unit_price: 100 }] })
  const mkDraft = async () => must('Draft', await account.client.from('invoices').insert({
    org_id: org.id, kind: 'invoice', quote_id: quote.id, gig_id: gig.id, client_name: 'E2E Client', scope: 'all', language: 'en', currency: 'EUR', lines: quoteInvoiceLines(quote),
  }).select().single())
  const first = await mkDraft()
  const second = await mkDraft()

  await page.goto(`${org.path}/invoices`)
  await page.getByRole('button', { name: new RegExp(`Draft ${first.number}\\b`) }).click()
  const dialog = page.getByRole('dialog', { name: `Draft ${first.number}` })
  await expect(dialog.getByText('1 repair to charge the client')).toBeVisible({ timeout: 15_000 })
  await expect(dialog.getByText(problem)).toBeVisible()
  await expectAccessible(page)
  await dialog.getByRole('button', { name: 'Add to invoice' }).click()
  await dialog.getByRole('button', { name: 'Save draft' }).click()
  await expect.poll(async () => (await account.client.from('repairs').select('invoice_id').eq('id', repair.id).single()).data.invoice_id, { timeout: 15_000 }).toBe(first.id)
  await dialog.getByRole('button', { name: /Close/ }).click()

  // The other draft of the gig doesn't offer it
  await page.getByRole('button', { name: new RegExp(`Draft ${second.number}\\b`) }).click()
  const other = page.getByRole('dialog', { name: `Draft ${second.number}` })
  await expect(other.getByText('What to invoice').or(other.getByText('Lines'))).toBeVisible({ timeout: 15_000 })
  await expect(other.getByText(/repairs? to charge the client/)).toHaveCount(0)
  await other.getByRole('button', { name: /Close/ }).click()

  // Take the line out of the first draft: not billed again
  await page.getByRole('button', { name: new RegExp(`Draft ${first.number}\\b`) }).click()
  const again = page.getByRole('dialog', { name: `Draft ${first.number}` })
  await again.getByRole('textbox').filter({ hasText: '' }).first().waitFor()
  const lines = again.getByRole('button', { name: 'Remove this line' })
  await lines.last().click()
  await again.getByRole('button', { name: 'Save draft' }).click()
  await expect.poll(async () => (await account.client.from('repairs').select('invoice_id').eq('id', repair.id).single()).data.invoice_id, { timeout: 15_000 }).toBe(null)
})

// covers: T77
test('a viewer can\'t read payments', { tag: AREA }, async ({ adminWithOrg, viewer }) => {
  const { account, org } = adminWithOrg
  const quote = await acceptedQuote(account, org, { title: `E2E Viewer payments ${stamp()}`, client_name: 'E2E Client', lines: [{ description: 'PA', qty: 1, unit_price: 100 }] })
  const invoice = await issuedInvoice(account, quote)
  must('Payment', await account.client.from('invoice_payments').insert({ org_id: org.id, invoice_id: invoice.id, paid_on: localDate(0), amount: 10, method: 'cash' }))
  const { data } = await viewer.account.client.from('invoice_payments').select('id').eq('invoice_id', invoice.id)
  expect(data ?? []).toEqual([])
  const { data: inv } = await viewer.account.client.from('invoices').select('id').eq('id', invoice.id)
  expect(inv ?? []).toEqual([])
})

// ---- T102 ----

// covers: T102
test('a quote accepted with a drawn signature: signature and fingerprint shown, signed PDF downloads', { tag: AREA }, async ({ adminWithOrg, browser, baseURL }) => {
  const { page, account, org } = adminWithOrg
  const quote = await addQuote(account, org, { title: `E2E Signed ${stamp()}`, client_name: 'E2E Client', lines: [{ description: 'PA', qty: 1, unit_price: 100 }] })
  const client = await clientPage(browser, baseURL, await quoteLink(account, quote))
  await client.getByRole('button', { name: 'Accept', exact: true }).click()
  await answerForm(client).getByRole('textbox', { name: /Your name/ }).fill('E2E Signer')
  await client.getByRole('button', { name: 'Add a drawn signature (optional)' }).click()
  await drawSignature(client)
  await client.getByRole('button', { name: 'Accept quote' }).click()
  await expect(client.getByText(/^Accepted by E2E Signer/)).toBeVisible({ timeout: 20_000 })
  await expect(client.getByRole('img', { name: 'Signature of E2E Signer' })).toBeVisible()
  await expect(client.getByText(/^Document fingerprint \(SHA-256\): \S+/)).toBeVisible()
  // The client's PDF has the signature block
  const [clientPdf] = await Promise.all([client.waitForEvent('download'), client.getByRole('button', { name: 'PDF' }).click()])
  const clientText = (await readPdfText(clientPdf)).text
  expect(clientText).toContain('Signature')
  expect(clientText).toContain('E2E Signer')
  await client.context().close()

  // In the app: Send to client → Signed PDF
  await page.goto(quote.path)
  await page.getByRole('button', { name: 'Send to client' }).click()
  const sent = page.getByRole('dialog')
  await expect(sent.getByText('Signed with a drawn signature')).toBeVisible({ timeout: 15_000 })
  const [signed] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), sent.getByRole('button', { name: 'Signed PDF' }).click()])
  const signedText = (await readPdfText(signed)).text
  expect(signedText).toContain(quote.title)
  expect(signedText).toContain('E2E Signer')
  expect(signedText).toMatch(/SHA-256/)
})

// covers: T102
test('a quote accepted without drawing works as before, with no "Signed" line', { tag: AREA }, async ({ adminWithOrg, browser, baseURL }) => {
  const { page, account, org } = adminWithOrg
  const quote = await addQuote(account, org, { title: `E2E Unsigned ${stamp()}`, client_name: 'E2E Client', lines: [{ description: 'PA', qty: 1, unit_price: 100 }] })
  const client = await clientPage(browser, baseURL, await quoteLink(account, quote))
  await client.getByRole('button', { name: 'Accept', exact: true }).click()
  await answerForm(client).getByRole('textbox', { name: /Your name/ }).fill('E2E Plain')
  await client.getByRole('button', { name: 'Accept quote' }).click()
  await expect(client.getByText(/^Accepted by E2E Plain/)).toBeVisible({ timeout: 20_000 })
  await expect(client.getByRole('img', { name: /^Signature of/ })).toHaveCount(0)
  await expect(client.getByText(/Document fingerprint/)).toHaveCount(0)
  await client.context().close()

  await page.goto(quote.path)
  await expect(page.getByRole('combobox', { name: 'Status' })).toHaveValue('accepted', { timeout: 15_000 })
  await page.getByRole('button', { name: 'Send to client' }).click()
  const sent = page.getByRole('dialog')
  await expect(sent.getByText(/accepted by E2E Plain/)).toBeVisible({ timeout: 15_000 })
  await expect(sent.getByText('Signed with a drawn signature')).toHaveCount(0)
  await expect(sent.getByRole('button', { name: 'Signed PDF' })).toHaveCount(0)
})


// covers: T7, T67, T102 (the client's quote page they all open)
// Known app bug #146: the client's quote page has three serious colour-contrast findings (the
// header text over the brand colour, and the grey text of the conversation and its form). This test
// documents it: it is expected to fail until #146 is fixed; then Playwright reports it as passing
// unexpectedly, and the test.fail line comes out.
test('the client\'s quote page passes the accessibility check', { tag: AREA }, async ({ adminWithOrg, browser, baseURL }) => {
  test.fail(true, 'App bug #146: serious colour-contrast findings on the client quote page (/q/…)')
  const { account, org } = adminWithOrg
  const quote = await addQuote(account, org, { title: `E2E Client page ${stamp()}`, lines: [{ description: 'PA', qty: 1, unit_price: 100 }] })
  const client = await clientPage(browser, baseURL, await quoteLink(account, quote))
  await expect(client.getByText('Would you like to go ahead with this quote?')).toBeVisible({ timeout: 20_000 })
  try {
    await expectAccessible(client)
  } finally {
    await client.context().close()
  }
})
