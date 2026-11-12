// Settings, account, privacy, the organisation export and phone layouts (AT12): the owner's manual
// test lines T39, T44, T56, T57, T87–T92, T105, T125, T126, T132, T162 and T163 (docs/PENDING.md
// section 2) as signed-in journeys on the TEST project. Data is made through the set-up
// (setup.js); only what a line tests is clicked through. What stays manual is in docs/notes/AT12.md.
import { test, expect } from './fixtures.js'
import { expectAccessible, deleteAccount } from './helpers.js'
import { addClient, addGig, addItem, addOrg, addQuote, addToGig, addToOrg, pageAs } from './setup.js'
import { RUN } from './accounts.js'
import { readZip, totpCode, zipText } from './files.js'
import { expire, requireTestSupport } from './testSupport.js'
import jsQR from 'jsqr'
import { quoteSnapshot, quoteTotals } from '../../src/lib/quotes.js'

test.use({ area: 'settings' })

const TAG = '@settings'
// Checks on the shared test database can take a while (docs/TESTING.md)
const LOAD = { timeout: 45_000 }
const uniq = () => `${RUN}-${Date.now().toString(36)}`
const ok = (what, { data, error }) => {
  if (error) throw new Error(`${what} failed: ${error.message}`)
  return data
}
const day = (offset = 0) => {
  const d = new Date(Date.now() + offset * 86400e3)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// The person has read their notifications: from ten unread the bell's name doesn't match its
// "9+" (issue #209), and the people here collect notifications as the file runs
async function readBell(...accounts) {
  const now = new Date().toISOString()
  for (const a of accounts) ok('Reading notifications', await a.client.from('notifications').update({ read_at: now }).eq('user_id', a.id).is('read_at', null))
}

// A phone-sized window signed in as the account
const PHONES = [320, 390]
const phone = (browser, baseURL, account, width, lang = 'en') =>
  pageAs(browser, account, { baseURL, lang, viewport: { width, height: 740 }, isMobile: true, hasTouch: true })

// The screen fits the phone: no sideways scroll, each key control inside the screen, axe passes
// axe: false only where a known app bug is documented by its own test
async function fitsPhone(page, what, keys = [], { axe = true } = {}) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    { message: `${what}: the page scrolls sideways`, timeout: 10_000 }).toBeLessThanOrEqual(0)
  const width = page.viewportSize().width
  for (const key of keys) {
    await expect(key).toBeVisible(LOAD)
    const box = await key.boundingBox()
    expect(box, `${what}: a key control has no box`).not.toBeNull()
    expect(box.x, `${what}: a key control starts off screen`).toBeGreaterThanOrEqual(-0.5)
    expect(box.x + box.width, `${what}: a key control runs past the right edge`).toBeLessThanOrEqual(width + 0.5)
  }
  if (axe) await expectAccessible(page)
}

// Opens the ⋯ ("More actions") whose menu has this item, and returns the menu. A screen can have
// several ⋯ (the page's and a tab's); the others are closed again.
async function menuWith(page, item, { name = 'More actions' } = {}) {
  const buttons = page.getByRole('button', { name, exact: true })
  await expect(buttons.first()).toBeVisible(LOAD)
  const count = await buttons.count()
  for (let i = 0; i < count; i++) {
    const button = buttons.nth(i)
    if (!(await button.isVisible())) continue
    await button.click()
    const menu = page.getByRole('menu', { name })
    await expect(menu.first()).toBeVisible()
    if (await menu.getByRole('menuitem', { name: item, exact: true }).count()) return menu
    await page.keyboard.press('Escape')
    if (await menu.count()) await button.click()
  }
  throw new Error(`No ⋯ on the page holds "${item}"`)
}

// Two-step sign-in for a set-up account (posting a job needs it): an authenticator factor, verified
// with the TOTP helper, so the account's session is two-step from then on. Returns a function that
// removes the factor again, so the sweep (password sign-in) can still delete the account.
async function withTwoStep(account) {
  const { data: factors } = await account.client.auth.mfa.listFactors()
  for (const f of factors?.all || []) await account.client.auth.mfa.unenroll({ factorId: f.id })
  const factor = ok('Adding two-step sign-in', await account.client.auth.mfa.enroll({ factorType: 'totp', friendlyName: `e2e ${uniq()}` }))
  ok('Confirming two-step sign-in', await account.client.auth.mfa.challengeAndVerify({ factorId: factor.id, code: await totpCode(factor.totp.secret) }))
  return async () => {
    const { error } = await account.client.auth.mfa.unenroll({ factorId: factor.id })
    if (error) process.stderr.write(`Removing the test account's two-step factor failed (${error.message}); the sweep may not delete it.\n`)
  }
}

// ---- T44: the Settings page ----

// covers: T44
test('settings on a computer: sections on the left, each opens on the right; changes are kept', { tag: ['@smoke', TAG] }, async ({ world, browser, baseURL }) => {
  const account = await world.account('extra')
  await readBell(account)
  const page = await pageAs(browser, account, { baseURL, viewport: { width: 1280, height: 800 } })
  try {
    await page.goto('/settings')
    const nav = page.getByRole('navigation', { name: 'Settings' })
    for (const name of ['Profile', 'Sign-in and security', 'Availability', 'Notifications', 'Language and appearance', 'Privacy and blocking', 'Calendar feed', 'Your data']) {
      await expect(nav.getByRole('link', { name, exact: true })).toBeVisible(LOAD)
    }
    // Profile opens beside the list
    await expect(page.locator('#settings-section-title')).toHaveText('Profile')
    const newName = `E2E Extra Renamed ${uniq()}`
    await page.locator('#account-name').fill(newName)
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Profile updated.')).toBeVisible(LOAD)

    // Language and appearance: Light theme, saved at once on this device
    await nav.getByRole('link', { name: 'Language and appearance' }).click()
    await expect(nav).toBeVisible()
    await expect(page.locator('#settings-section-title')).toHaveText('Language and appearance')
    await page.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio', { name: 'Light' }).click()
    await expect(page.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true')

    // Notifications: the email summary switch, saved on change
    await nav.getByRole('link', { name: 'Notifications' }).click()
    await expect(page).toHaveURL(/\/settings\/notifications$/)
    const digest = page.getByRole('checkbox', { name: /^Email summary/ })
    await expect(digest).toBeVisible(LOAD)
    const was = await digest.isChecked()
    const saved = page.waitForResponse(r => r.url().includes('/rest/v1/profiles') && r.request().method() === 'PATCH', LOAD)
    await digest.click()
    expect((await saved).ok()).toBe(true)
    await expectAccessible(page)

    // Kept after a reload
    await page.reload()
    await expect(page.getByRole('checkbox', { name: /^Email summary/ })).toBeChecked({ checked: !was, ...LOAD })
    await page.goto('/settings/profile')
    await expect(page.locator('#account-name')).toHaveValue(newName, LOAD)
    await page.goto('/settings/preferences')
    await expect(page.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true', LOAD)
  } finally {
    await page.context().close()
  }
})

// covers: T44
for (const width of PHONES) {
  test(`settings on a phone (${width} px): the list first, each section with a way back; Portuguese names`, { tag: TAG }, async ({ world, browser, baseURL }) => {
    const account = await world.account('extra')
    await readBell(account)
    for (const lang of ['en', 'pt']) {
      const page = await phone(browser, baseURL, account, width, lang)
      try {
        const names = lang === 'en'
          ? { title: 'Settings', sections: ['Profile', 'Notifications', 'Language and appearance', 'Your data'], notifications: 'Notifications' }
          : { title: 'Definições', sections: ['Perfil', 'Início de sessão e segurança', 'Disponibilidade', 'Notificações', 'Língua e aparência', 'Privacidade e bloqueios', 'Calendário no telemóvel', 'Os seus dados'], notifications: 'Notificações' }
        await page.goto('/settings')
        const nav = page.getByRole('navigation', { name: names.title })
        for (const name of names.sections) await expect(nav.getByRole('link', { name, exact: true })).toBeVisible(LOAD)
        // The list only: no section open beside it
        await expect(page.locator('#settings-section-title')).toHaveCount(0)
        await fitsPhone(page, `settings list (${lang})`, [nav.getByRole('link', { name: names.notifications, exact: true })])

        await nav.getByRole('link', { name: names.notifications, exact: true }).click()
        await expect(page.locator('#settings-section-title')).toHaveText(names.notifications, LOAD)
        await expect(nav).toBeHidden()
        const back = page.getByRole('link', { name: names.title, exact: true })
        await fitsPhone(page, `settings section (${lang})`, [back])
        await back.click()
        await expect(page).toHaveURL(/\/settings$/)
        await expect(nav).toBeVisible()
      } finally {
        await page.context().close()
      }
    }
  })
}

// ---- T162: profiles privacy ----

// covers: T162
test('privacy: crew still see names and phones on the gig and the call sheet, but can\'t read phones from profiles', { tag: TAG }, async ({ adminWithOrg, crewOnGig }) => {
  const { account: admin } = adminWithOrg
  const { page, account: crew, gig } = crewOnGig
  const phoneNo = '+351 912 000 162'
  ok('Setting the admin\'s phone', await admin.client.from('profiles').update({ phone: phoneNo }).eq('id', admin.id))
  await readBell(crew)

  // The gig's crew list and the call sheet show the PM's name and phone
  await page.goto(`${gig.path}?tab=crew`)
  await expect(page.getByText(admin.name).first()).toBeVisible(LOAD)
  await expect(page.getByRole('link', { name: phoneNo }).first()).toBeVisible(LOAD)
  await page.goto(`${gig.path}/callsheet`)
  await expect(page.getByText(admin.name).first()).toBeVisible(LOAD)
  await expect(page.locator('a.tel', { hasText: phoneNo })).toBeVisible(LOAD)

  // With the crew's own session: profiles.phone is refused, my_profile() is only their own row
  const refused = await crew.client.from('profiles').select('id, phone').eq('id', admin.id)
  expect(refused.error, 'reading another person\'s phone from profiles should be refused').not.toBeNull()
  const names = ok('Reading names', await crew.client.from('profiles').select('id, full_name').eq('id', admin.id))
  expect(names.map(p => p.full_name)).toEqual([admin.name])
  const mine = ok('my_profile', await crew.client.rpc('my_profile'))
  expect(mine.map(p => p.id)).toEqual([crew.id])
  const phones = ok('gig_crew_phones', await crew.client.rpc('gig_crew_phones', { p_gig: gig.id }))
  expect(phones.find(p => p.user_id === admin.id)?.phone).toBe(phoneNo)
})

// covers: T162
test('privacy: Settings → Profile keeps your phone and the email summary switch; Messages and the bell show names', { tag: TAG }, async ({ adminWithOrg, crewOnGig }) => {
  const { account: admin, org } = adminWithOrg
  const { page, account: crew } = crewOnGig
  await readBell(crew)
  // Profile: the phone shows and saving it works
  const phoneNo = `+351 913 ${String(Date.now()).slice(-6)}`
  await page.goto('/settings/profile')
  const field = page.locator('#account-phone')
  await expect(field).toBeVisible(LOAD)
  await field.fill(phoneNo)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Profile updated.')).toBeVisible(LOAD)
  await page.reload()
  await expect(page.locator('#account-phone')).toHaveValue(phoneNo, LOAD)
  const mine = ok('my_profile', await crew.client.rpc('my_profile'))
  expect(mine[0].phone).toBe(phoneNo)

  // Notifications: the email summary switch saves
  await page.goto('/settings/notifications')
  const digest = page.getByRole('checkbox', { name: /^Email summary/ })
  await expect(digest).toBeVisible(LOAD)
  const was = await digest.isChecked()
  const saved = page.waitForResponse(r => r.url().includes('/rest/v1/profiles') && r.request().method() === 'PATCH', LOAD)
  await digest.click()
  expect((await saved).ok()).toBe(true)
  await page.reload()
  await expect(page.getByRole('checkbox', { name: /^Email summary/ })).toBeChecked({ checked: !was, ...LOAD })
  expect(ok('my_profile', await crew.client.rpc('my_profile'))[0].email_digest).toBe(!was)

  // Messages: the admin writes in a new gig's chat; the crew see the admin's name
  const gig2 = await addGig(admin, org.id, { name: `E2E Privacy gig ${uniq()}` })
  await addToGig(admin, gig2.id, crew)
  const { data: conversation } = await admin.client.rpc('gig_conversation', { p_gig: gig2.id })
  const text = `Hello crew ${uniq()}`
  ok('Writing a message', await admin.client.from('messages').insert({ conversation_id: conversation, body: text }))
  await page.goto(`/messages/${conversation}`)
  const row = page.locator('.chat-row', { hasText: text })
  await expect(row).toBeVisible(LOAD)
  await expect(page.getByText(admin.name).first()).toBeVisible()

  // The bell: "<admin> added you to <gig>"
  await page.goto('/me')
  const bell = page.getByRole('button', { name: /unread notification/ })
  await expect(bell).toBeVisible(LOAD)
  await bell.click()
  const panel = page.getByRole('dialog', { name: 'Notifications' })
  await expect(panel.getByRole('button', { name: new RegExp(`${admin.name}.*${gig2.name}`) }).first()).toBeVisible(LOAD)
})

// covers: T162
test('privacy: a new account in no company and on no gig sees no other names anywhere', { tag: TAG }, async ({ world, browser, baseURL }) => {
  const [lonely, admin] = await Promise.all([world.account('newbie'), world.admin()])
  const page = await pageAs(browser, lonely, { baseURL })
  try {
    const profiles = ok('Reading profiles', await lonely.client.from('profiles').select('id, full_name'))
    expect(profiles.map(p => p.id)).toEqual([lonely.id])
    expect(ok('my_profile', await lonely.client.rpc('my_profile')).map(p => p.id)).toEqual([lonely.id])
    expect((await lonely.client.from('profiles').select('phone').eq('id', lonely.id)).error, 'profiles.phone is refused, even your own').not.toBeNull()
    for (const path of ['/me', '/messages', '/settings/profile']) {
      await page.goto(path)
      await expect(page.locator('.shell-bar')).toBeVisible(LOAD)
      await expect(page.getByText(admin.name)).toHaveCount(0)
    }
    await expect(page.locator('#account-name')).toHaveValue(lonely.name, LOAD)
  } finally {
    await page.context().close()
  }
})

// ---- T163: closing an account keeps the company's data ----

// covers: T163
test('closing an account: a member deletes theirs, the company keeps the client and quote they added', { tag: TAG }, async ({ adminWithOrg, world, browser, baseURL }) => {
  const { account: admin, org } = adminWithOrg
  const leaver = await world.account('extra2')
  await addToOrg(admin, org.id, leaver, 'member')
  const client = await addClient(leaver, org.id, { name: `E2E Leaver client ${uniq()}` })
  const quote = await addQuote(leaver, org, { title: `E2E Leaver quote ${uniq()}`, client_id: client.id, lines: [{ description: 'Mixer', qty: 1, unit_price: 50 }] })
  const page = await pageAs(browser, leaver, { baseURL })
  try {
    await deleteAccount(page)
    await expect(page.getByText('Your account has been deleted.')).toBeVisible(LOAD)
  } finally {
    await page.context().close()
  }
  // The account is gone: signing in fails
  const { error } = await leaver.client.auth.signInWithPassword({ email: leaver.email, password: 'e2e-Password-123' })
  expect(error, 'the closed account can still sign in').not.toBeNull()
  // The admin still has both
  const { page: adminPage } = adminWithOrg
  await adminPage.goto(`${org.path}/contacts`)
  await expect(adminPage.getByText(client.name)).toBeVisible(LOAD)
  await adminPage.goto(`${org.path}/quotes`)
  await expect(adminPage.getByText(quote.title).first()).toBeVisible(LOAD)
  const kept = ok('Reading the quote', await admin.client.from('quotes').select('id, created_by').eq('id', quote.id))
  expect(kept).toEqual([{ id: quote.id, created_by: null }])
})

// ---- T39: the organisation export ----

// covers: T39
test('organisation export: the zip has numbered CSVs, messages.json and a README; accents and decimals; items and units import back', { tag: TAG }, async ({ adminWithOrg, secondCompany }) => {
  const { page, account, org } = adminWithOrg
  await readBell(account, secondCompany.account)
  const id = uniq()
  const name = `Projetor Ação Çé ${id}`
  const item = await addItem(account, org.id, { name, code: `EX-${id}`, tracking: 'serial', unit_price: 12.5, weight_kg: 3.75 })
  ok('Adding a unit', await account.client.from('stock_units').insert({ org_id: org.id, item_id: item.id, serial: `SN-${id}` }))

  await page.goto(`${org.path}?panel=settings`)
  const button = page.getByRole('button', { name: 'Download everything (zip)' })
  await expect(button).toBeVisible(LOAD)
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 90_000 }), button.click()])
  expect(download.suggestedFilename()).toMatch(/^avx-.+-\d{4}-\d{2}-\d{2}\.zip$/)
  await expect(page.getByText(/^Downloaded\. Records: /)).toBeVisible(LOAD)
  const files = await readZip(download)
  const names = Object.keys(files)
  expect(names).toEqual(expect.arrayContaining(['01-organisation.csv', '05-items.csv', '07-units.csv', 'messages.json', 'README.txt']))
  expect(names.filter(n => n.endsWith('.csv')).every(n => /^\d{2}-[a-z-]+\.csv$/.test(n))).toBe(true)
  expect(JSON.parse(zipText(files, 'messages.json')).organisation).toBe(org.name)
  expect(zipText(files, 'README.txt')).toContain('messages.json')

  // Spreadsheet-friendly: a BOM (Excel reads the accents), semicolons, decimal commas
  expect(Array.from(files['05-items.csv'].slice(0, 3)), '05-items.csv starts with a BOM').toEqual([0xEF, 0xBB, 0xBF])
  const items = zipText(files, '05-items.csv').replace(/^\uFEFF/, '')
  const header = items.split('\r\n')[0].split(';')
  const row = items.split('\r\n').find(l => l.includes(name))
  expect(row, 'the item is in 05-items.csv').toBeTruthy()
  const cells = row.split(';')
  expect(cells[header.indexOf('name')].replace(/"/g, '')).toBe(name)
  expect(cells[header.indexOf('unit price')].replace(/"/g, '')).toBe('12,5')
  expect(cells[header.indexOf('weight kg')].replace(/"/g, '')).toBe('3,75')
  const units = zipText(files, '07-units.csv')
  expect(units).toContain(`SN-${id}`)

  // Importing them into another organisation: the columns are matched without changes
  const other = secondCompany
  for (const [kind, file, needed] of [['items', '05-items.csv', ['name', 'code', 'unit price']], ['units', '07-units.csv', ['item', 'serial']]]) {
    await other.page.goto(`${other.org.path}/inventory/import?kind=${kind}`)
    const input = other.page.locator('input[type="file"]')
    await expect(input).toBeAttached(LOAD)
    await input.setInputFiles({ name: file, mimeType: 'text/csv', buffer: Buffer.from(files[file]) })
    await other.page.getByRole('button', { name: 'Next' }).click()
    const match = other.page.getByRole('list', { name: 'Match columns' })
    await expect(match).toBeVisible(LOAD)
    for (const column of needed) {
      const select = match.getByRole('combobox', { name: `What column ${column} becomes`, exact: true })
      await expect(select, `${file}: "${column}" isn't matched`).not.toHaveValue('')
    }
  }
})

// ---- T56: send limits ----

// covers: T56
test('send limits: the 6th test notification within an hour says to try again in an hour', { tag: TAG }, async ({ world, browser, baseURL }) => {
  const account = await world.account('worker')
  await readBell(account)
  // Five tests go through (no device here, so none is delivered)
  for (let i = 1; i <= 5; i++) {
    const { data, error } = await account.client.functions.invoke('send-push', { body: { action: 'test' } })
    expect(error, `test ${i} was refused: ${error?.message}`).toBeNull()
    expect(data).toEqual({ sent: 0 })
  }
  // The 6th, from Settings → Notifications on a device where notifications are on
  const page = await pageAs(browser, account, { baseURL, permissions: ['notifications'] })
  try {
    // A stand-in subscription: headless Chromium has no push service, so "on" comes from it.
    // The headless shell that CI installs also answers Notification.permission with "denied" even
    // with the permission granted above (the full Chromium says "granted"), so it's set here too.
    await page.addInitScript(() => {
      if (window.PushManager) PushManager.prototype.getSubscription = async () => ({ endpoint: 'https://push.invalid/e2e', toJSON: () => ({}) })
      if (window.Notification) Object.defineProperty(Notification, 'permission', { get: () => 'granted', configurable: true })
    })
    await page.goto('/settings/notifications')
    const test6 = page.getByRole('button', { name: 'Send a test' })
    await expect(test6).toBeVisible(LOAD)
    const answered = page.waitForResponse(r => r.url().includes('/functions/v1/send-push'), LOAD)
    await test6.click()
    expect((await answered).status()).toBe(429)
    await expect(page.getByText("You've sent several test notifications. Try again in an hour.")).toBeVisible(LOAD)
  } finally {
    await page.context().close()
  }
})

// ---- T57: no double sends ----

// covers: T57
test('no double sends: the connection drops after Send, the second click is the same send', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, account, org } = adminWithOrg
  await readBell(account)
  const quote = await addQuote(account, org, { title: `E2E Once ${uniq()}`, lines: [{ description: 'Speaker', qty: 2, unit_price: 80 }] })
  const to = `e2e-client-${uniq()}@example.com`
  await page.goto(quote.path)
  await page.getByRole('button', { name: 'Send to client' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Send to client' })
  await dialog.getByLabel('Client email').fill(to)
  // A link only (no email leaves the test project); the same request key applies to both
  await dialog.getByRole('checkbox', { name: 'Email the link to the client' }).uncheck()

  // The first click reaches the server, but its answer never gets back (the Wi-Fi went off)
  let first = true
  await page.route('**/functions/v1/send-quote', async route => {
    if (!first) return route.continue()
    first = false
    await route.fetch()
    await route.abort('internetdisconnected')
  })
  await dialog.getByRole('button', { name: 'Create link' }).click()
  await expect.poll(() => first).toBe(false)
  const button = dialog.getByRole('button', { name: 'Create link' })
  await expect(button).toBeEnabled(LOAD)
  await button.click()
  await expect(page.getByText('This send already went through a moment ago: see the history below.', { exact: false })).toBeVisible(LOAD)

  // One send recorded, and its link is still open
  const shares = ok('Reading the sends', await account.client.from('quote_shares').select('sent_to, status, request_key').eq('quote_id', quote.id))
  expect(shares).toHaveLength(1)
  expect(shares[0]).toMatchObject({ sent_to: to, status: 'open' })
  expect(shares[0].request_key).toBeTruthy()
})

// ---- T125, T126: held invitations ----

// covers: T125. Needs test_support (an expired held invitation can only be made by the nightly job).
test('an expired held invitation shows "Expired" and its line, in English and Portuguese; Send still works', { tag: TAG }, async ({ adminWithOrg, browser, baseURL }) => {
  const { page, account, org } = adminWithOrg
  await requireTestSupport(account)
  await readBell(account)
  const id = uniq()
  // A held invitation, as Import → Crew makes it (import_crew, the import's own call)
  const email = `e2e-held-${id}@example.com`
  ok('Importing a person', await account.client.rpc('import_crew', { p_org: org.id, p_rows: [{ email, full_name: `E2E Held ${id}`, role: 'viewer' }], p_file: 'e2e.csv' }))
  const held = ok('Reading the held invitation', await account.client.from('held_invites').select().eq('org_id', org.id).eq('email', email).single())
  await expire(account, 'held_invite', held.id, 61)

  await page.goto(`${org.path}?panel=members`)
  const row = page.locator('li, tr, div').filter({ has: page.getByRole('checkbox', { name: `Select ${held.full_name}` }) }).last()
  await expect(row).toContainText('Expired', LOAD)
  await expect(row).toContainText('Not sent within 60 days. You can still send or discard it.')
  await expectAccessible(page)

  const pt = await pageAs(browser, account, { baseURL, lang: 'pt' })
  try {
    await pt.goto(`${org.path}?panel=members`)
    const ptRow = pt.locator('li, tr, div').filter({ has: pt.getByRole('checkbox', { name: new RegExp(held.full_name) }) }).last()
    await expect(ptRow).toContainText('Expirado', LOAD)
    await expect(ptRow).toContainText('Não foi enviado em 60 dias. Ainda o pode enviar ou descartar.')
  } finally {
    await pt.context().close()
  }

  // Send: selected and sent (an existing account is added straight away, no email)
  const target = await adminWithOrg.world.account('crew2')
  ok('Pointing the invitation at an existing account', await account.client.from('held_invites').update({ email: target.email }).eq('id', held.id))
  await page.reload()
  await page.getByRole('checkbox', { name: `Select ${held.full_name}` }).check(LOAD)
  page.once('dialog', d => d.accept())
  await page.getByRole('button', { name: 'Send 1 invitation' }).click()
  await expect(page.getByText('1 invitation sent.')).toBeVisible(LOAD)
  const after = ok('Reading the invitation', await account.client.from('held_invites').select('status').eq('id', held.id))
  expect(after[0].status).toBe('sent')
})

// covers: T126
test('the held-invitation reminder opens the organisation\'s Members panel', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, account, org } = adminWithOrg
  await readBell(account)
  // One unread reminder, as the nightly job writes it (a stand-in answer; the database doesn't change)
  const reminder = {
    id: '00000000-0000-4000-8000-000000000126', user_id: account.id, org_id: org.id, actor_id: null, kind: 'held_invites_waiting',
    details: { count: 2, org_name: org.name }, read_at: null, created_at: new Date().toISOString(),
  }
  await page.route(/\/rest\/v1\/notifications\?/, async route => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 204, body: '' })
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([reminder]) })
  })
  await page.goto('/me')
  await page.getByRole('button', { name: '1 unread notification' }).click(LOAD)
  const item = page.getByRole('dialog', { name: 'Notifications' })
    .getByRole('button', { name: new RegExp(`2 imported people in ${org.name} are still waiting to be invited or discarded`) })
  await expect(item).toBeVisible(LOAD)
  await item.click()
  await expect(page).toHaveURL(new RegExp(`/org/${org.id}\\?panel=members$`), LOAD)
  await expect(page.getByRole('dialog', { name: `${org.name} — members` })).toBeVisible(LOAD)
})

// ---- T132: the QR on prints ----

// The link in the call sheet's QR code (drawn in the browser, read with jsQR)
async function qrLink(page) {
  const qr = page.getByRole('img', { name: 'QR code that opens this page in AVX' })
  await expect(qr).toBeVisible(LOAD)
  const pixels = await qr.evaluate(async el => {
    const svg = el.querySelector('svg').outerHTML.replace(/width="100%" height="100%"/, 'width="400" height="400"')
    const img = new Image()
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 440
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, 440, 440)
    ctx.drawImage(img, 20, 20, 400, 400)
    return Array.from(ctx.getImageData(0, 0, 440, 440).data)
  })
  const code = jsQR(Uint8ClampedArray.from(pixels), 440, 440)
  expect(code, 'the QR code could not be read').not.toBeNull()
  return code.data
}

// covers: T132
test('the call sheet\'s QR opens it in AVX; someone not on the gig gets "Call sheet not available"', { tag: TAG }, async ({ adminWithOrg, crewOnGig, secondCompany }) => {
  const { page, account } = adminWithOrg
  const { gig } = crewOnGig
  await readBell(account)
  await page.emulateMedia({ media: 'print' })
  await page.goto(`${gig.path}/callsheet`)
  const link = await qrLink(page)
  expect(link).toBe(new URL(`${gig.path}/callsheet`, page.url()).href)

  await crewOnGig.page.goto(link)
  await expect(crewOnGig.page.getByRole('heading', { name: gig.name }).first()).toBeVisible(LOAD)
  await expect(crewOnGig.page.getByText('Call sheet not available.')).toHaveCount(0)

  await secondCompany.page.goto(link)
  await expect(secondCompany.page.getByText('Call sheet not available.')).toBeVisible(LOAD)
  await expect(secondCompany.page.getByText(gig.name)).toHaveCount(0)
})

// covers: T132 (signed out: the QR's link asks for a sign-in first)
test('the call sheet\'s link asks a signed-out person to sign in', { tag: TAG }, async ({ world, page }) => {
  const gig = await world.gig()
  await page.goto(`${gig.path}/callsheet`)
  await expect(page).toHaveURL(/\/auth/, LOAD)
})

// ---- T105: the workspace switcher on a phone ----

// covers: T105
for (const width of PHONES) {
  test(`workspace switcher on a phone (${width} px): opens under the bar, full width, scrolls above the tabs, closes`, { tag: TAG }, async ({ world, browser, baseURL }) => {
    test.setTimeout(180_000) // making 14 companies on a busy test database can take a while
    const account = await world.account('pm')
    await readBell(account)
    // Many companies (made once per file for this person, side by side)
    const orgs = await world.once('manyOrgs', async () => {
      const { data: mine } = await account.client.from('organisations').select('id').eq('created_by', account.id)
      const missing = Math.max(0, 14 - (mine || []).length)
      await Promise.all(Array.from({ length: missing }, (_, i) => addOrg(account, { name: `E2E Many ${RUN} ${String(i + 1).padStart(2, '0')} ${uniq()}` })))
      return ok('Listing the companies', await account.client.from('organisations').select('id, name').eq('created_by', account.id).order('name'))
    })
    const page = await phone(browser, baseURL, account, width)
    try {
      await page.goto(`/org/${orgs[0].id}`)
      const switcher = page.locator('.shell-switch-btn')
      await expect(switcher).toBeVisible(LOAD)
      await switcher.click()
      const menu = page.getByRole('menu').filter({ has: page.getByRole('menuitemradio') })
      await expect(menu).toBeVisible()
      const bar = await page.locator('.shell-bar').boundingBox()
      // (the list slides in: measured once it has settled)
      await expect.poll(async () => Math.abs((await menu.boundingBox()).y - (bar.y + bar.height)), { message: 'the list opens right under the bar', timeout: 5_000 }).toBeLessThanOrEqual(2)
      const box = await menu.boundingBox()
      const tabs = await page.locator('.shell-tabs').boundingBox()
      expect(box.x).toBeLessThanOrEqual(0.5)
      expect(box.x + box.width).toBeGreaterThanOrEqual(width - 0.5)
      expect(box.y + box.height, 'the list stops above the bottom tabs').toBeLessThanOrEqual(tabs.y + 0.5)
      expect(await menu.evaluate(el => el.scrollHeight > el.clientHeight), 'with many companies the list scrolls').toBe(true)
      await fitsPhone(page, 'workspace list', [menu.getByRole('menuitemradio', { name: 'My work' })])

      // Tap outside (between the list and the bottom tabs): it closes
      const gap = tabs.y - (box.y + box.height)
      expect(gap, 'room to tap outside the list').toBeGreaterThan(4)
      await page.mouse.click(width / 2, box.y + box.height + gap / 2)
      await expect(menu).toBeHidden()
      // Pick a company: it opens and the list closes
      await switcher.click()
      const last = orgs[orgs.length - 1]
      const pick = menu.getByRole('menuitemradio', { name: new RegExp(last.name) })
      await pick.scrollIntoViewIfNeeded()
      await pick.click()
      await expect(page).toHaveURL(new RegExp(`/org/${last.id}`), LOAD)
      await expect(menu).toBeHidden()
    } finally {
      await page.context().close()
    }
  })
}

// ---- T87–T92: the design refresh on a phone ----

// covers: T87
test('home on a phone: arrange it, kept after a reload, only for this workspace, back to the standard; first steps', { tag: TAG }, async ({ adminWithOrg, browser, baseURL }) => {
  const { account, org } = adminWithOrg
  await readBell(account)
  const page = await phone(browser, baseURL, account, 390)
  try {
    await page.goto(org.path)
    await page.getByRole('button', { name: 'Arrange home' }).click(LOAD)
    const arrange = page.getByRole('dialog', { name: 'Arrange home' })
    await expect(arrange).toBeVisible()
    await fitsPhone(page, 'Arrange home', [arrange.getByRole('button', { name: 'Done' })])
    const up = arrange.getByRole('button', { name: 'Move Gigs up' })
    while (await up.isEnabled()) await up.click()
    await arrange.getByRole('switch', { name: 'Show Key numbers' }).click()
    await expect(arrange.getByRole('switch', { name: 'Show Key numbers' })).toHaveAttribute('aria-checked', 'false')
    await arrange.getByRole('button', { name: 'Done' }).click()
    await expect(page.locator('#key-numbers')).toHaveCount(0)
    await expect(page.locator('#home-events')).toBeVisible()

    await page.reload()
    await expect(page.locator('#home-events')).toBeVisible(LOAD)
    await expect(page.locator('#key-numbers')).toHaveCount(0)
    await page.getByRole('button', { name: 'Arrange home' }).click()
    await expect(arrange.getByRole('button', { name: 'Move Gigs up' })).toBeDisabled()
    await page.keyboard.press('Escape')

    // Another workspace (My work) has the standard order
    await page.goto('/me')
    await page.getByRole('button', { name: 'Arrange home' }).click(LOAD)
    await expect(arrange.getByRole('button', { name: 'Back to the standard' })).toBeDisabled()
    await page.keyboard.press('Escape')

    // Back to the standard restores it
    await page.goto(org.path)
    await page.getByRole('button', { name: 'Arrange home' }).click(LOAD)
    await arrange.getByRole('button', { name: 'Back to the standard' }).click()
    await arrange.getByRole('button', { name: 'Done' }).click()
    await expect(page.locator('#key-numbers')).toBeVisible(LOAD)
    const [numbers, gigs] = await Promise.all([page.locator('#key-numbers').boundingBox(), page.locator('#home-events').boundingBox()])
    expect(numbers.y, 'standard order: Key numbers above Gigs').toBeLessThan(gigs.y)

    // First steps: one line that opens the steps left
    const first = page.getByRole('button', { name: /^First steps · \d+ of \d+ done/ })
    await expect(first).toBeVisible(LOAD)
    await expect(first).toHaveAttribute('aria-expanded', 'false')
    await first.click()
    await expect(first).toHaveAttribute('aria-expanded', 'true')
    // The list holds exactly the steps not done yet; each opens its screen
    const [, done, total] = (await first.textContent()).match(/(\d+) of (\d+)/)
    const left = page.locator('#first-steps-list').getByRole('button')
    await expect(left).toHaveCount(Number(total) - Number(done))
    const before = page.url()
    await left.first().click()
    await expect.poll(() => page.url(), LOAD).not.toBe(before)
  } finally {
    await page.context().close()
  }
})

// covers: T88
test('gig page on a phone: the PM\'s actions are in the ⋯ menus; crew see Report damage', { tag: TAG }, async ({ adminWithOrg, crewOnGig, browser, baseURL }) => {
  const { account, org } = adminWithOrg
  const { gig, account: crew } = crewOnGig
  await readBell(account, crew)
  const { data: gear } = await account.client.from('gig_equipment').select('id').eq('gig_id', gig.id).limit(1)
  if (!gear?.length) {
    const item = await addItem(account, org.id, { name: `E2E Gig gear ${uniq()}` })
    ok('Planning equipment', await account.client.from('gig_equipment').insert({ gig_id: gig.id, item_id: item.id, quantity: 1 }))
  }
  for (const width of PHONES) {
    const page = await phone(browser, baseURL, account, width)
    try {
      await page.goto(gig.path)
      await expect(page.getByRole('heading', { name: gig.name }).first()).toBeVisible(LOAD)
      await expect(page.getByRole('button', { name: 'Edit gig' })).toHaveCount(0)
      let menu = await menuWith(page, 'Edit gig')
      await page.keyboard.press('Escape')
      await fitsPhone(page, `gig (${width})`)

      await page.goto(`${gig.path}?tab=crew`)
      await expect(page.getByRole('button', { name: 'Invite crew' })).toBeVisible(LOAD)
      // The crew rows are complete once the organisation's members have loaded: the crew member
      // isn't in the organisation, so the admin sees "Add to …" (checking before it shows let the
      // layout check pass on a half-loaded list)
      await expect(page.getByRole('button', { name: `Add to ${org.name}` })).toBeVisible(LOAD)
      menu = await menuWith(page, 'Find crew')
      await expect(menu.getByRole('menuitem', { name: 'Post a job' })).toBeVisible()
      await page.keyboard.press('Escape')
      // At 320 px "Add to <organisation>" runs off screen when the name is long (#243), and how long
      // this organisation's name is depends on the run's tag; the test after this one checks it
      if (width > 320) await fitsPhone(page, `gig crew (${width})`, [page.getByRole('button', { name: 'Invite crew' })])

      await page.goto(`${gig.path}?tab=equipment`)
      await expect(page.getByRole('link', { name: 'Packing list' })).toBeVisible(LOAD)
      menu = await menuWith(page, 'Scan out / in')
      await expect(menu.getByRole('menuitem', { name: 'Report damage' })).toBeVisible()
      await page.keyboard.press('Escape')
      await fitsPhone(page, `gig equipment (${width})`, [page.getByRole('button', { name: 'Add equipment' })])
    } finally {
      await page.context().close()
    }
  }
  const crewPage = await phone(browser, baseURL, crew, 390)
  try {
    await crewPage.goto(`${gig.path}?tab=equipment`)
    await expect(crewPage.getByRole('button', { name: 'Report damage' })).toBeVisible(LOAD)
    await fitsPhone(crewPage, 'gig equipment as crew')
  } finally {
    await crewPage.context().close()
  }
})

// covers: T88
test('crew tab on a 320 px phone: a long organisation name in "Add to …" stays on screen', { tag: TAG }, async ({ adminWithOrg, world, browser, baseURL }) => {
  test.fail(true, '#243: the "Add to <organisation>" button does not wrap, so the page scrolls sideways at 320 px')
  const { account } = adminWithOrg
  const crew = await world.account('crew')
  // A real company name of this length, the same in every run
  const org = await addOrg(account, { name: `E2E Produções Audiovisuais do Norte ${RUN}` })
  const gig = await addGig(account, org.id)
  await addToGig(account, gig.id, crew)
  const page = await phone(browser, baseURL, account, 320)
  try {
    await page.goto(`${gig.path}?tab=crew`)
    await expect(page.getByRole('button', { name: `Add to ${org.name}` })).toBeVisible(LOAD)
    await fitsPhone(page, 'gig crew (320, long organisation name)', [page.getByRole('button', { name: 'Invite crew' })])
  } finally {
    await page.context().close()
  }
})

// covers: T89
test('lists on a phone: one green button each, ⋯ in the header, status tabs and views filter, job post ⋯', { tag: TAG }, async ({ adminWithOrg, browser, baseURL }) => {
  const { account, org, world } = adminWithOrg
  await readBell(account)
  // Job posts need two-step sign-in: a member of the organisation with it posts one for their own gig
  const poster = await world.account('tech')
  await addToOrg(account, org.id, poster, 'member')
  const removeTwoStep = await withTwoStep(poster)
  try {
    const gig = await addGig(poster, org.id, { name: `E2E Job gig ${uniq()}` })
    const post = { title: `E2E Job ${uniq()}` }
    post.id = ok('Posting a job', await poster.client.rpc('publish_job', { p_gig: gig.id, p_job: { title: post.title } }))

    const page = await phone(browser, baseURL, account, 390)
    try {
      await page.goto(`${org.path}/quotes`)
      await expect(page.getByRole('button', { name: 'New quote' })).toBeVisible(LOAD)
      await menuWith(page, 'Company details')
      await page.keyboard.press('Escape')
      const status = page.getByRole('group', { name: 'Status' })
      await status.getByRole('button', { name: /^Sent/ }).click()
      await expect(status.getByRole('button', { name: /^Sent/ })).toHaveAttribute('aria-pressed', 'true')
      await expect(status.getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'false')
      await fitsPhone(page, 'quotes', [page.getByRole('button', { name: 'New quote' })])

      await page.goto(`${org.path}/invoices`)
      await expect(page.getByRole('button', { name: 'New invoice from a quote' })).toBeVisible(LOAD)
      await menuWith(page, 'CSV')
      await page.keyboard.press('Escape')
      const views = page.getByRole('group', { name: 'Show invoices' })
      await views.getByRole('button', { name: /^Unpaid/ }).click()
      await expect(views.getByRole('button', { name: /^Unpaid/ })).toHaveAttribute('aria-pressed', 'true')
      await fitsPhone(page, 'invoices', [page.getByRole('button', { name: 'New invoice from a quote' }).first()])

      await page.goto(`${org.path}/contacts`)
      await expect(page.getByRole('button', { name: 'New client' })).toBeVisible(LOAD)
      await menuWith(page, 'Import')
      await page.keyboard.press('Escape')
      await fitsPhone(page, 'contacts', [page.getByRole('button', { name: 'New client' })])
    } finally {
      await page.context().close()
    }

    // Job posts, as the poster (their session is two-step): ⋯ on the post marks it filled
    const jobs = await phone(browser, baseURL, poster, 390)
    try {
      await jobs.goto(`${org.path}/jobs`)
      const more = await menuWith(jobs, 'Mark filled', { name: `More actions for ${post.title}` })
      await more.getByRole('menuitem', { name: 'Mark filled' }).click()
      await expect.poll(async () => ok('Reading the post', await poster.client.from('job_posts').select('status').eq('id', post.id))[0]?.status, LOAD).toBe('filled')
      await fitsPhone(jobs, 'job posts')
    } finally {
      await jobs.context().close()
    }
  } finally {
    await removeTwoStep()
  }
})

// covers: T90
test('detail pages on a phone: the quote editor\'s ⋯, an item\'s stock rows, the scanned unit, report tabs', { tag: TAG }, async ({ adminWithOrg, browser, baseURL }) => {
  const { account, org } = adminWithOrg
  await readBell(account)
  const id = uniq()
  const quote = await addQuote(account, org, { title: `E2E Detail ${id}`, lines: [{ description: 'Lights', qty: 1, unit_price: 10 }] })
  const bulk = await addItem(account, org.id, { name: `E2E Bulk ${id}` })
  const locations = ok('Adding locations', await account.client.from('stock_locations').insert([
    { org_id: org.id, name: `E2E Store A ${id}` }, { org_id: org.id, name: `E2E Store B ${id}` },
  ]).select())
  for (const loc of locations) ok('Adding stock', await account.client.from('stock_movements').insert({ org_id: org.id, item_id: bulk.id, kind: 'purchase', quantity: 3, to_location_id: loc.id }))
  const serial = await addItem(account, org.id, { name: `E2E Serial ${id}`, tracking: 'serial' })
  const units = ok('Adding units', await account.client.from('stock_units').insert([{ org_id: org.id, item_id: serial.id }, { org_id: org.id, item_id: serial.id }]).select('id, code'))

  // Desktop: Preview and the gig button beside Send
  const { page: desk } = adminWithOrg
  await desk.goto(quote.path)
  await expect(desk.getByRole('button', { name: 'Send to client' })).toBeVisible(LOAD)
  await expect(desk.getByRole('button', { name: /^Preview/ }).first()).toBeVisible()
  await expect(desk.getByRole('button', { name: 'Create gig' }).first()).toBeVisible()

  const page = await phone(browser, baseURL, account, 390)
  try {
    await page.goto(quote.path)
    await expect(page.getByRole('button', { name: 'Send to client' })).toBeVisible(LOAD)
    await expect(page.getByRole('button', { name: /^Preview/ })).toHaveCount(0)
    const menu = await menuWith(page, 'Preview & print')
    for (const name of ['Create gig', 'Availability', 'Versions', 'Duplicate', 'Save as template', 'Delete']) {
      await expect(menu.getByRole('menuitem', { name, exact: true }), `${name} in the quote's ⋯`).toBeVisible()
    }
    await page.keyboard.press('Escape')
    await fitsPhone(page, 'quote editor', [page.getByRole('button', { name: 'Send to client' })])

    // A bulk item in two locations: Move, Remove and ⋯ → Count on each row
    await page.goto(`${org.path}/inventory/${bulk.id}`)
    for (const loc of locations) {
      await expect(page.getByRole('button', { name: `More actions for ${loc.name}` })).toBeVisible(LOAD)
      const more = await menuWith(page, 'Count', { name: `More actions for ${loc.name}` })
      await expect(more.getByRole('menuitem', { name: 'Count' })).toBeVisible()
      await page.keyboard.press('Escape')
    }
    await expect(page.getByRole('button', { name: 'Move', exact: true })).toHaveCount(2)
    await expect(page.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(2)
    await fitsPhone(page, 'bulk item')

    // A serial item opened from a scanned label: that unit has the wash and a bar
    await page.goto(`${org.path}/inventory/${serial.id}?unit=${units[1].id}`)
    const marked = page.getByRole('checkbox', { name: `Select unit ${units[1].code}` }).locator('..')
    const plain = page.getByRole('checkbox', { name: `Select unit ${units[0].code}` }).locator('..')
    await expect(marked).toBeVisible(LOAD)
    expect(await marked.evaluate(el => getComputedStyle(el).borderLeftWidth)).toBe('2px')
    expect(await plain.evaluate(el => getComputedStyle(el).borderLeftWidth)).toBe('0px')
    expect(await marked.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(await plain.evaluate(el => getComputedStyle(el).backgroundColor))

    // Reports: every tab; the chosen one is marked and the row scrolls sideways
    await page.goto(`${org.path}/reports`)
    const tabs = page.getByRole('navigation', { name: 'Reports' })
    await expect(tabs).toBeVisible(LOAD)
    for (const name of ['Overview', 'Revenue', 'Money', 'Gig margins', 'Sales', 'Equipment', 'Warehouse', 'Vehicle use', 'Operations']) {
      const tab = tabs.getByRole('button', { name, exact: true })
      await tab.scrollIntoViewIfNeeded()
      await tab.click()
      await expect(tab).toHaveAttribute('aria-current', 'page')
      expect(await tab.evaluate(el => getComputedStyle(el).borderBottomWidth)).not.toBe('0px')
    }
    expect(await tabs.evaluate(el => {
      const row = [el, ...el.querySelectorAll('*')].find(n => n.scrollWidth > n.clientWidth && /auto|scroll/.test(getComputedStyle(n).overflowX))
      return !!row
    }), 'the tab row scrolls sideways').toBe(true)
    await fitsPhone(page, 'reports')
  } finally {
    await page.context().close()
  }
})

// covers: T91
test('field and crew screens on a phone: On-site mode, Simple home, Scan out and in, Messages, Help', { tag: TAG }, async ({ adminWithOrg, crewOnGig, browser, baseURL }) => {
  const { account, org } = adminWithOrg
  const { account: crew } = crewOnGig
  await readBell(account, crew)
  const today = await addGig(account, org.id, { name: `E2E Today ${uniq()}`, start_date: day(0), end_date: day(0) })
  await addToGig(account, today.id, crew)
  for (const width of PHONES) {
    const page = await phone(browser, baseURL, crew, width)
    try {
      // On-site mode on the gig's day
      await page.goto(today.path)
      await expect(page.getByRole('heading', { name: 'On site today' })).toBeVisible(LOAD)
      await fitsPhone(page, `on-site (${width})`, [page.getByRole('button', { name: 'Full gig view' })])

      // Simple-mode home
      await page.evaluate(() => localStorage.setItem('avx.appearance', JSON.stringify({ simple: 'on' })))
      await page.goto('/me')
      await expect(page.getByText('Your next gig')).toBeVisible(LOAD)
      await fitsPhone(page, `simple home (${width})`, [page.getByRole('button', { name: 'All my gigs' })])
      await page.evaluate(() => localStorage.removeItem('avx.appearance'))

      // Messages: the list, Search and Saved
      await page.goto('/messages')
      await expect(page.getByRole('heading', { name: 'Messages' })).toBeVisible(LOAD)
      await fitsPhone(page, `messages (${width})`, [page.getByRole('button', { name: 'Search', exact: true }), page.getByRole('button', { name: 'Saved', exact: true })])
      await page.getByRole('button', { name: 'Search', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Search', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await fitsPhone(page, `messages search (${width})`)
      await page.getByRole('button', { name: 'Saved', exact: true }).click()
      await fitsPhone(page, `messages saved (${width})`)
      const { data: conversation } = await account.client.rpc('gig_conversation', { p_gig: today.id })
      await page.goto(`/messages/${conversation}`)
      await expect(page.getByRole('textbox', { name: 'Write a message…' })).toBeVisible(LOAD)
      await fitsPhone(page, `conversation (${width})`, [page.getByRole('button', { name: 'Send', exact: true })])

      // Help, opened on a term
      await page.goto('/help#call-time')
      await expect(page.locator('#term-call-time')).toBeFocused(LOAD)
      await fitsPhone(page, `help (${width})`)
    } finally {
      await page.context().close()
    }
  }
  // Scan out and in, as the PM: the step buttons at a narrow width
  const pm = await phone(browser, baseURL, account, 320)
  try {
    await pm.goto(`${today.path}/scan`)
    const steps = pm.getByRole('radiogroup', { name: 'What this scan records' })
    await expect(steps).toBeVisible(LOAD)
    const radios = steps.getByRole('radio')
    await fitsPhone(pm, 'scan out and in', [radios.first(), radios.last(), pm.getByRole('button', { name: 'Record' })])
  } finally {
    await pm.context().close()
  }
})

// covers: T92
test('design sweep at 320 px: Organisations, Cash, Maintenance, Subrentals, a shared quote, a ⋯ button, the large call sheet', { tag: TAG }, async ({ adminWithOrg, crewOnGig, browser, baseURL }) => {
  const { account, org } = adminWithOrg
  const { gig } = crewOnGig
  await readBell(account)
  const quote = await addQuote(account, org, { title: `E2E Shared ${uniq()}`, lines: [{ description: 'Screen', qty: 1, unit_price: 300 }] })
  // Its client link, as "Send to client" → Create link makes it (a version, then send-quote without email)
  const snapshot = quoteSnapshot(quote, quote.body)
  const version = ok('Saving a quote version', await account.client.from('quote_versions').insert({
    quote_id: quote.id, org_id: quote.org_id, note: 'E2E', snapshot, total_net: quoteTotals({ ...quote, body: snapshot.body }).net,
  }).select('id').single())
  const sent = ok('Making the link', await account.client.functions.invoke('send-quote', {
    body: { quote_id: quote.id, version_id: version.id, email: '', send_email: false, request_key: crypto.randomUUID() },
  }))
  const shared = new URL(sent.link).pathname
  const page = await phone(browser, baseURL, account, 320)
  try {
    await page.goto('/orgs')
    await expect(page.getByRole('heading', { name: 'Organisations' })).toBeVisible(LOAD)
    await fitsPhone(page, 'organisations', [page.getByRole('button', { name: 'New Organisation' })])

    await page.goto(`${org.path}/reports?tab=money&view=cash`)
    await expect(page.getByRole('group', { name: 'Show' }).getByRole('button', { name: 'Cash' })).toHaveAttribute('aria-pressed', 'true', LOAD)
    await fitsPhone(page, 'reports cash')

    for (const tab of ['maintenance', 'subrentals']) {
      await page.goto(`${org.path}/inventory?tab=${tab}`)
      await expect(page.getByRole('tab', { name: tab === 'maintenance' ? /^Maintenance/ : /^Subrentals/ })).toHaveAttribute('aria-selected', 'true', LOAD)
      await fitsPhone(page, `inventory ${tab}`)
    }

    // The shared quote link, as the client sees it
    await page.goto(shared)
    await expect(page.getByRole('button', { name: 'Accept' })).toBeVisible(LOAD)
    await fitsPhone(page, 'shared quote', [page.getByRole('button', { name: 'Accept' }), page.getByRole('button', { name: 'Decline' })])

    // A ⋯ button is easy to hit (44 px on a phone)
    await page.goto(`${org.path}/quotes`)
    const more = page.getByRole('button', { name: 'More actions', exact: true }).first()
    await expect(more).toBeVisible(LOAD)
    const box = await more.boundingBox()
    expect(Math.min(box.width, box.height), '⋯ is at least 44 px').toBeGreaterThanOrEqual(44)

    // The call sheet in large print
    await page.goto(`${gig.path}/callsheet`)
    const large = page.getByRole('button', { name: 'Large print' })
    await expect(large).toBeVisible(LOAD)
    if (await large.getAttribute('aria-pressed') !== 'true') await large.click()
    await expect(large).toHaveAttribute('aria-pressed', 'true')
    await fitsPhone(page, 'call sheet, large print')
  } finally {
    await page.context().close()
  }
})
