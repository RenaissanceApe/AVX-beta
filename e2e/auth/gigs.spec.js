// Gigs, crew, the double-booking check and tasks (AT1): the owner's manual lines for these areas
// (docs/PENDING.md section 2), as signed-in journeys on the TEST project. docs/TESTING.md,
// "Automated test suite". Data a test only needs to exist is made through setup.js; the UI is
// clicked only for what the T-line checks.
import { createHash, randomUUID } from 'node:crypto'
import { test, expect as baseExpect } from './fixtures.js'
import { expectAccessible } from './helpers.js'
import { emailSummaryCandidates } from './testSupport.js'
import { readZip, zipText } from './files.js'
import { addClient, addGig, addItem, addOrg, addToGig, addToOrg, pageAs } from './setup.js'

test.use({ area: 'gigs' })
// Several of these are long journeys, and the test project is shared with the other areas' runs, so
// each test may take up to 150 s (the smoke test takes about 15 s)
test.describe.configure({ timeout: 150_000 })

// How long to wait for the app to load or save something: the test project is shared with the
// other areas' runs and has been seen taking over 20 s to answer when busy
const LOAD = 45_000
// …and for everything else, longer than Playwright's 5 s (a check passes as soon as it holds)
const expect = baseExpect.configure({ timeout: 20_000 })

const stamp = () => Date.now().toString(36)
const localDate = (days = 0) => {
  const d = new Date(Date.now() + days * 86400e3)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// No serious accessibility problems, checked once the page's fade-in animations have finished (axe
// measuring a button half-way through fading in reports a colour contrast it doesn't really have)
async function accessible(page) {
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter(a => a.effect?.getComputedTiming().iterations !== Infinity) // spinners never finish
    .map(a => a.finished.catch(() => {}))))
  await expectAccessible(page)
}

// Marks the account's notifications read, so the bell shows a single-digit count (or none) before an
// accessibility check: with more than 9 unread it fails axe (#209, documented in hours.spec.js)
async function readNotifications(account) {
  const { error } = await account.client.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', account.id).is('read_at', null)
  expect(error).toBeNull()
}

// The app's save of a task (PATCH /rest/v1/tasks) has answered
const taskSaved = page => page.waitForResponse(r => r.url().includes('/rest/v1/tasks') && r.request().method() === 'PATCH' && r.ok())

// covers: T50
test('the PM gives the crew a task with a checklist; the crew tick it and the PM sees it done live', { tag: ['@smoke', '@gigs'] }, async ({ adminWithOrg, crewOnGig }) => {
  const pm = adminWithOrg.page
  const crew = crewOnGig.page
  const gig = crewOnGig.gig
  const title = `Rig the side fills ${stamp()}`

  // The PM: gig → Tasks → New task, for the crew member, due tomorrow, three checklist lines
  await pm.goto(`${gig.path}?tab=tasks`)
  await pm.getByRole('button', { name: 'New task' }).first().click()
  const form = pm.getByRole('dialog', { name: 'New task' })
  await form.getByLabel('What').fill(title)
  await form.getByLabel('For').selectOption(crewOnGig.account.id)
  await form.getByLabel('Due').fill(localDate(1))
  await form.getByLabel('Checklist').fill('Fly the speakers\nRun the cables\nLine check')
  await accessible(pm)
  await form.getByRole('button', { name: 'Save task' }).click()
  await expect(form).toHaveCount(0)
  const pmRow = pm.getByRole('listitem').filter({ has: pm.getByRole('button', { name: title }) })
  await expect(pmRow).toContainText('0/3')

  // The crew member gets a notification that opens the gig's Tasks tab
  await crew.goto('/tasks')
  const bell = crew.getByRole('button', { name: /unread notification/ })
  await expect(bell).toBeVisible({ timeout: LOAD })
  await bell.click()
  await crew.getByRole('dialog', { name: 'Notifications' }).getByRole('button', { name: new RegExp(`gave you a task on ${gig.name}: ${title}`) }).click()
  await expect(crew).toHaveURL(new RegExp(`${gig.path}\\?tab=tasks`))
  await expect(crew.getByRole('button', { name: title })).toBeVisible({ timeout: LOAD })

  // …and it's under My work → My tasks
  await readNotifications(crewOnGig.account)
  await crew.goto('/tasks')
  await expect(crew.getByRole('heading', { name: 'My tasks' })).toBeVisible({ timeout: LOAD })
  await accessible(crew)
  const myRow = crew.getByRole('listitem').filter({ has: crew.getByRole('button', { name: title }) })
  await expect(myRow).toBeVisible()

  // On the gig, the crew tick two checklist items and then the task; there is no Edit for them
  await crew.goto(`${gig.path}?tab=tasks`)
  const crewRow = crew.getByRole('listitem').filter({ has: crew.getByRole('button', { name: title }) })
  await crewRow.getByRole('button', { name: title }).click()
  // Each tick is saved before the next, at a person's pace (two ticks in flight at once can lose
  // one: see the test "two quick checklist ticks are both kept" below)
  for (const [item, progress] of [['Fly the speakers', '1/3'], ['Run the cables', '2/3']]) {
    const saved = taskSaved(crew)
    await crewRow.getByRole('checkbox', { name: item }).check()
    await saved
    await expect(crewRow).toContainText(progress)
  }
  await expect(crewRow.getByRole('button', { name: 'Edit' })).toHaveCount(0)
  await expect(crewRow.getByRole('button', { name: `Remove the task ${title}` })).toHaveCount(0)
  // Ticking the task hides it from the default "Open" list
  await crewRow.getByRole('checkbox', { name: `Done: ${title}` }).click()
  await expect(crew.getByRole('button', { name: title })).toHaveCount(0)

  // The PM's page updates without reloading, with who did it
  await expect(pm.getByRole('button', { name: title })).toHaveCount(0, { timeout: LOAD })
  await pm.getByRole('button', { name: 'Open', pressed: true }).click()
  await expect(pmRow).toContainText(`done by ${crewOnGig.account.name}`, { timeout: LOAD })
  await expect(pmRow).toContainText('2/3')

  // The PM removes it; it asks first
  await pmRow.getByRole('button', { name: title }).click()
  pm.once('dialog', d => { expect(d.message()).toContain(title); d.accept() })
  await pmRow.getByRole('button', { name: `Remove the task ${title}` }).click()
  await expect(pm.getByRole('button', { name: title })).toHaveCount(0)
})

// covers: T50 (a task from a rehearsal note, once; the Portuguese wording)
test('a rehearsal note makes one task, and the Tasks tab reads in Portuguese', { tag: '@gigs' }, async ({ adminWithOrg, browser, baseURL }) => {
  const { page, account: admin, org } = adminWithOrg
  const s = stamp()
  const gig = await addGig(admin, org.id, { name: `E2E Rehearsal ${s}` })
  const session = await admin.client.from('rehearsal_sessions').insert({ gig_id: gig.id, name: `Tech run ${s}`, clock: 'stopwatch', running: false }).select('id').single()
  expect(session.error).toBeNull()
  const body = `Spot 3 flickers ${s}`
  const note = await admin.client.from('rehearsal_notes').insert({ session_id: session.data.id, gig_id: gig.id, client_id: randomUUID(), tc_ms: 61_000, body }).select('id').single()
  expect(note.error).toBeNull()

  await page.goto(`${gig.path}?tab=tools&tool=rehearsal`)
  await page.getByRole('button', { name: new RegExp(`Tech run ${s}`) }).click({ timeout: LOAD })
  const makeTask = page.getByRole('button', { name: 'Make a task from this note' })
  await makeTask.click({ timeout: LOAD })
  await expect(page.getByText("Task made: it's in the gig's Tasks")).toBeVisible({ timeout: LOAD })
  await makeTask.click()
  await expect(page.getByText('This note already has a task')).toBeVisible({ timeout: LOAD })
  const { count } = await admin.client.from('tasks').select('id', { count: 'exact', head: true }).eq('gig_id', gig.id).is('removed_at', null)
  expect(count).toBe(1)

  // The gig's Tasks tab, in Portuguese
  const pt = await pageAs(browser, admin, { baseURL, lang: 'pt' })
  try {
    await pt.goto(`${gig.path}?tab=tasks`)
    await expect(pt.getByRole('tab', { name: /^Tarefas/, selected: true })).toBeVisible({ timeout: LOAD })
    const row = pt.getByRole('listitem').filter({ has: pt.getByRole('button', { name: new RegExp(body) }) })
    await expect(row).toContainText('de uma nota de ensaio')
    await pt.getByRole('button', { name: 'Nova tarefa' }).first().click()
    const form = pt.getByRole('dialog', { name: 'Nova tarefa' })
    await expect(form.getByLabel('O quê')).toBeVisible()
    await expect(form.getByRole('button', { name: 'Guardar tarefa' })).toBeVisible()
    await accessible(pt)
  } finally {
    await pt.context().close()
  }
})

// covers: T50 (found while automating it: two ticks saved at once must both be kept)
test('two quick checklist ticks are both kept', { tag: '@gigs' }, async ({ adminWithOrg, crewOnGig }) => {
  // BUG (#214): each tick sends the whole checklist, so when the first save reaches the database
  // after the second (a slow phone network), it writes the older list back and the second tick is
  // lost, though the screen showed it. The first save is held back here to make that order certain.
  test.fail()
  const { account: pm } = adminWithOrg
  const crew = crewOnGig.page
  const gig = crewOnGig.gig
  const title = `Check the batteries ${stamp()}`
  const { data: task, error } = await pm.client.from('tasks').insert({
    gig_id: gig.id, title, assignee_id: crewOnGig.account.id,
    checklist: [{ id: 'a1', text: 'Radio mics', done: false }, { id: 'b2', text: 'In-ears', done: false }],
  }).select('id').single()
  expect(error).toBeNull()

  let first = true
  await crew.route('**/rest/v1/tasks?*', async route => {
    if (route.request().method() === 'PATCH' && first) { first = false; await new Promise(r => setTimeout(r, 1500)) }
    await route.continue()
  })
  await crew.goto(`${gig.path}?tab=tasks`)
  const row = crew.getByRole('listitem').filter({ has: crew.getByRole('button', { name: title }) })
  await row.getByRole('button', { name: title }).click()
  let answered = 0
  crew.on('response', r => { if (r.url().includes('/rest/v1/tasks') && r.request().method() === 'PATCH') answered++ })
  await row.getByRole('checkbox', { name: 'Radio mics' }).check()
  await row.getByRole('checkbox', { name: 'In-ears' }).check()
  await expect(row).toContainText('2/2')
  await expect.poll(() => answered, { timeout: LOAD }).toBe(2)
  const { data } = await pm.client.from('tasks').select('checklist').eq('id', task.id).single()
  expect(data.checklist.map(i => i.done)).toEqual([true, true])
})

// covers: T3
test('double booking: the PM is warned, asks availability, and the person answers', { tag: '@gigs' }, async ({ adminWithOrg, browser, baseURL }) => {
  const { page, account: admin, org, world } = adminWithOrg
  const person = await world.account('extra')
  const s = stamp()
  const booked = await addGig(admin, org.id, { name: `E2E Booked ${s}`, start_date: localDate(20), end_date: localDate(21) })
  await addToGig(admin, booked.id, person, { functionTitle: 'LX' })
  const gig = await addGig(admin, org.id, { name: `E2E Overlap ${s}`, start_date: localDate(21), end_date: localDate(22) })

  // Invite crew: typing their email warns they're already booked on those dates
  await page.goto(`${gig.path}?tab=crew`)
  await page.getByRole('button', { name: 'Invite crew' }).first().click()
  const invite = page.getByRole('dialog', { name: 'Invite crew member' })
  await invite.getByPlaceholder('technician@company.com').fill(person.email)
  await invite.getByPlaceholder('technician@company.com').blur()
  const warning = invite.getByRole('status')
  await expect(warning).toContainText(`${person.email} is already booked for this time`, { timeout: LOAD })
  await expect(warning).toContainText(booked.name)
  await accessible(page)

  // Ask availability first
  await warning.getByRole('button', { name: 'Ask availability first' }).click()
  const ask = page.getByRole('dialog', { name: `Ask ${person.email}` })
  await ask.getByLabel('Message (optional)').fill('Load-in at 08:00. Can you make it?')
  await ask.getByRole('button', { name: 'Send question' }).click()
  await expect(page.getByText(`Asked ${person.email}.`)).toBeVisible({ timeout: LOAD })

  // The person answers from their home
  await readNotifications(person)
  const theirs = await pageAs(browser, person, { baseURL })
  try {
    await theirs.goto('/me')
    await expect(theirs.getByRole('region', { name: /questions? for you/ })).toBeVisible({ timeout: LOAD })
    const question = theirs.locator('#requests > div').filter({ hasText: gig.name })
    await expect(question).toContainText('asks if you’re available')
    await expect(question).toContainText('Load-in at 08:00. Can you make it?')
    await accessible(theirs)
    await question.getByRole('button', { name: 'Available', exact: true }).click()
    await expect(question).toHaveCount(0, { timeout: LOAD })
  } finally {
    await theirs.context().close()
  }

  // The PM adds them anyway: the crew row shows the clash and their answer
  await page.reload()
  await page.getByRole('button', { name: 'Invite crew' }).first().click()
  await invite.getByPlaceholder('technician@company.com').fill(person.email)
  await invite.getByRole('button', { name: 'Add to gig' }).click()
  const row = page.locator('li.crew-row').filter({ hasText: person.name })
  await expect(row.getByText('Clash', { exact: true })).toBeVisible({ timeout: LOAD })
  await expect(row).toContainText('Said they’re available')
  await expect(row).toContainText(booked.name)
})

// covers: T8
test('your network: someone who shared a gig with you is found by name in Invite crew', { tag: '@gigs' }, async ({ adminWithOrg }) => {
  const { page, account: admin, org, world } = adminWithOrg
  const person = await world.account('extra2')
  const s = stamp()
  const shared = await addGig(admin, org.id, { name: `E2E Shared ${s}`, start_date: localDate(50), end_date: localDate(50) })
  await addToGig(admin, shared.id, person, { functionTitle: 'Rigger' })
  const gig = await addGig(admin, org.id, { name: `E2E Network ${s}`, start_date: localDate(60), end_date: localDate(60) })

  await page.goto(`${gig.path}?tab=crew`)
  await page.getByRole('button', { name: 'Invite crew' }).first().click()
  const invite = page.getByRole('dialog', { name: 'Invite crew member' })
  await invite.getByRole('textbox', { name: "Search people you've worked with" }).fill('Extra2')
  const found = invite.getByRole('button', { name: new RegExp(person.name) })
  await expect(found).toBeVisible({ timeout: LOAD })
  await expect(found).toContainText('Rigger')
  await accessible(page)
  await found.click()
  await expect(invite.getByRole('button', { name: 'Choose someone else' })).toBeVisible()
  await invite.getByRole('button', { name: 'Add to gig' }).click()
  await expect(page.locator('li.crew-row').filter({ hasText: person.name })).toBeVisible({ timeout: LOAD })
})

// covers: T120
test('booking times are read in the organisation\'s time zone, whatever the device\'s', { tag: '@gigs' }, async ({ adminWithOrg, browser, baseURL }) => {
  const { account: admin } = adminWithOrg
  const s = stamp()
  const org = await addOrg(admin, { name: `E2E London ${s}` })
  const day = localDate(30)
  const gig = await addGig(admin, org.id, { name: `E2E London Gig ${s}`, start_date: day, end_date: day })

  // A device on New York time
  const page = await pageAs(browser, admin, { baseURL, timezoneId: 'America/New_York' })
  try {
    await page.goto(`${org.path}?panel=settings`)
    await page.waitForLoadState('networkidle') // the organisation loads in fully before the form is used
    const settings = page.getByRole('dialog', { name: `${org.name} — settings` })
    await settings.getByLabel('Time zone', { exact: true }).selectOption('Europe/London')
    await accessible(page)
    // The form took the change (once, in a slow run, nothing was saved and no message came)
    await expect(settings.getByRole('button', { name: 'Save changes' })).toBeEnabled()
    await settings.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Settings saved.')).toBeVisible({ timeout: LOAD })

    await page.goto(`${gig.path}?tab=crew`)
    const row = page.locator('li.crew-row').filter({ hasText: admin.name })
    await row.getByRole('button', { name: 'Set times' }).click()
    const times = page.getByRole('dialog', { name: `Booking times · ${admin.name}` })
    await expect(times).toContainText('Times are in Europe/London time')
    await times.getByLabel('From').fill(`${day}T09:00`)
    await times.getByLabel('Until').fill(`${day}T18:00`)
    await times.getByRole('button', { name: 'Save times' }).click()
    await expect(row).toContainText('09:00', { timeout: LOAD })
    await expect(row).toContainText('18:00')
  } finally {
    await page.context().close()
  }
  // Stored as 09:00 and 18:00 in London (GMT in winter), not New York
  const { data } = await admin.client.from('gig_members').select('booked_from, booked_until').eq('gig_id', gig.id).eq('user_id', admin.id).single()
  expect(new Date(data.booked_from).toISOString()).toBe(new Date(`${day}T09:00:00Z`).toISOString())
  expect(new Date(data.booked_until).toISOString()).toBe(new Date(`${day}T18:00:00Z`).toISOString())
})

// covers: T121
test('clashes across time zones only where the days overlap in real time', { tag: '@gigs' }, async ({ adminWithOrg }) => {
  const { page, account: admin, org, world } = adminWithOrg
  const person = await world.account('pm')
  const s = stamp()
  // The area's organisation is on Lisbon time (the default); the other on Tokyo time (9 hours ahead)
  const tokyo = await addOrg(admin, { name: `E2E Tokyo ${s}` })
  const { error } = await admin.client.from('organisations').update({ time_zone: 'Asia/Tokyo' }).eq('id', tokyo.id)
  expect(error).toBeNull()
  const day = 100 + Math.floor(Math.random() * 200) // far ahead, so a rerun with the same tag rarely meets its own gigs
  const lisbon = await addGig(admin, org.id, { name: `E2E Lisbon Day ${s}`, start_date: localDate(day), end_date: localDate(day) })
  // Tokyo's next day starts at 15:00 Lisbon time on the Lisbon gig's day: they overlap
  const after = await addGig(admin, tokyo.id, { name: `E2E Tokyo Next ${s}`, start_date: localDate(day + 1), end_date: localDate(day + 1) })
  // Tokyo's day before ends at 15:00 Lisbon time the day before: no overlap
  const before = await addGig(admin, tokyo.id, { name: `E2E Tokyo Before ${s}`, start_date: localDate(day - 1), end_date: localDate(day - 1) })
  for (const g of [lisbon, after, before]) await addToGig(admin, g.id, person)

  const rowOn = async gig => {
    await page.goto(`${gig.path}?tab=crew`)
    const row = page.locator('li.crew-row').filter({ hasText: person.name })
    await expect(row).toBeVisible({ timeout: LOAD })
    return row
  }
  const onLisbon = await rowOn(lisbon)
  await expect(onLisbon.getByText('Clash', { exact: true })).toBeVisible({ timeout: LOAD })
  await expect(onLisbon).toContainText(after.name)
  await expect(onLisbon).not.toContainText(before.name)
  await accessible(page)

  const onAfter = await rowOn(after)
  await expect(onAfter.getByText('Clash', { exact: true })).toBeVisible({ timeout: LOAD })
  await expect(onAfter).toContainText(lisbon.name)

  // Checked by name: the person may have other gigs from an earlier run with the same tag
  const onBefore = await rowOn(before)
  await expect(onBefore).not.toContainText(lisbon.name)
  await expect(onBefore).not.toContainText(after.name)
})

// Edit gig → Danger zone → Delete this gig: the two-step warning, as far as the last button
// `onImpact` checks the first step's list of what goes with the gig.
async function startDeleting(page, gig, onImpact = async () => {}) {
  await page.goto(gig.path)
  await page.getByRole('button', { name: 'Edit gig' }).click()
  const edit = page.getByRole('dialog', { name: 'Edit gig' })
  await edit.getByRole('button', { name: 'Danger zone' }).click()
  await edit.getByRole('button', { name: 'Delete this gig' }).click()
  const confirm = page.getByRole('dialog', { name: `Delete gig "${gig.name}"?` })
  await expect(confirm.getByRole('button', { name: 'Continue' })).toBeDisabled()
  await onImpact(confirm)
  await confirm.getByRole('checkbox', { name: /I understand/ }).check()
  await confirm.getByRole('button', { name: 'Continue' }).click()
  await confirm.getByLabel('To confirm, type the exact name below').pressSequentially(gig.name)
  return confirm
}

// covers: T11
test('a gig with equipment and messages is deleted for good after the two-step warning', { tag: '@gigs' }, async ({ adminWithOrg, world }) => {
  const { page, account: admin, org } = adminWithOrg
  const crew = await world.crew()
  const s = stamp()
  const gig = await addGig(admin, org.id, { name: `E2E Delete Me ${s}` })
  await addToGig(admin, gig.id, crew)
  const item = await addItem(admin, org.id, { name: `E2E Speaker ${s}` })
  const set = async (what, result) => expect(result.error, what).toBeNull()
  await set('equipment', await admin.client.from('gig_equipment').insert({ gig_id: gig.id, item_id: item.id, quantity: 2 }))
  await set('feed post', await admin.client.from('feed_posts').insert({ gig_id: gig.id, user_id: admin.id, content: 'Doors at 19:00' }))
  const { data: conversation } = await admin.client.rpc('gig_conversation', { p_gig: gig.id })
  await set('chat message', await admin.client.from('messages').insert({ conversation_id: conversation, body: 'See you at load-in' }))

  const confirm = await startDeleting(page, gig, async step1 => {
    await expect(step1).toContainText('1 update in the feed', { timeout: LOAD })
    await expect(step1).toContainText('Access for 2 people on the crew')
    await accessible(page)
  })
  await confirm.getByRole('button', { name: 'Delete permanently' }).click({ timeout: LOAD })
  await expect(page.getByText(`Deleted the gig "${gig.name}".`)).toBeVisible({ timeout: LOAD })
  await expect(page).not.toHaveURL(new RegExp(gig.id))
  const { data: left } = await admin.client.from('gigs').select('id').eq('id', gig.id)
  expect(left).toEqual([])
  const { data: gear } = await admin.client.from('gig_equipment').select('gig_id').eq('gig_id', gig.id)
  expect(gear).toEqual([])
})

// covers: T104
test('a gig with a signed delivery note can\'t be deleted for good', { tag: '@gigs' }, async ({ adminWithOrg }) => {
  const { page, account: admin, org } = adminWithOrg
  const gig = await addGig(admin, org.id, { name: `E2E Signed ${stamp()}` })
  const document = JSON.stringify({ gig: gig.id, lines: [{ item: 'Speaker', qty: 2 }] })
  const sha = text => createHash('sha256').update(text).digest('hex')
  const { data: signature, error } = await admin.client.from('signatures').insert({
    org_id: org.id, kind: 'delivery_note', gig_id: gig.id, title: 'Delivery note', signer_name: 'E2E Client',
    document, document_sha256: sha(document), image_path: 'x', image_sha256: sha('png'),
  }).select('id').single()
  expect(error).toBeNull()

  const confirm = await startDeleting(page, gig)
  await confirm.getByRole('button', { name: 'Delete permanently' }).click({ timeout: LOAD })
  await expect(confirm.getByRole('alert').filter({ hasText: 'signed documents' }))
    .toContainText("This gig has signed documents (delivery notes), which are kept as proof, so it can't be deleted for good. Set its status to Cancelled instead.")
  await accessible(page)

  // Nothing was removed: the gig and its signature are still there, and the database refuses too
  const { data: still } = await admin.client.from('gigs').select('id').eq('id', gig.id)
  expect(still).toHaveLength(1)
  const { data: kept } = await admin.client.from('signatures').select('id').eq('id', signature.id)
  expect(kept).toHaveLength(1)
  const direct = await admin.client.from('gigs').delete().eq('id', gig.id).select('id')
  expect(direct.error?.message || '').toContain("can't be erased")
})

// covers: T65 (Edit gig in two windows; the schedule item, task, contact and item forms use the same guard)
test('two people saving the same gig: the second is told to reload, saving twice alone is fine', { tag: '@gigs' }, async ({ adminWithOrg, browser, baseURL }) => {
  const { page: first, account: admin, org } = adminWithOrg
  const gig = await addGig(admin, org.id, { name: `E2E Two Editors ${stamp()}` })
  const second = await pageAs(browser, admin, { baseURL })
  try {
    const open = async page => {
      await page.goto(gig.path)
      await page.getByRole('button', { name: 'Edit gig' }).click()
      return page.getByRole('dialog', { name: 'Edit gig' })
    }
    const [one, two] = [await open(first), await open(second)]
    await one.getByLabel('Venue').fill('Coliseu')
    await one.getByRole('button', { name: 'Save changes' }).click()
    await expect(one).toHaveCount(0, { timeout: LOAD })

    await two.getByLabel('Venue').fill('Campo Pequeno')
    await two.getByRole('button', { name: 'Save changes' }).click()
    await expect(second.getByText('Someone else changed this — reload to see their changes.')).toBeVisible({ timeout: LOAD })
    await expect(two).toBeVisible() // the form stays open, so nothing typed is lost
    await accessible(second)
    await second.getByRole('button', { name: 'Reload' }).click()
    await expect(second.getByText('Coliseu').first()).toBeVisible({ timeout: LOAD })

    // Saving twice in a row alone never shows the message
    for (const venue of ['Altice Arena', 'MEO Arena']) {
      const form = await open(first)
      await form.getByLabel('Venue').fill(venue)
      await form.getByRole('button', { name: 'Save changes' }).click()
      await expect(form).toHaveCount(0, { timeout: LOAD })
    }
    await expect(first.getByText('Someone else changed this')).toHaveCount(0)
    const { data } = await admin.client.from('gigs').select('venue').eq('id', gig.id).single()
    expect(data.venue).toBe('MEO Arena')
  } finally {
    await second.context().close()
  }
})

// A gig today with the crew member on it (call 08:30, Sound), a schedule item today and a task for them
async function gigToday(world, name) {
  const [admin, org, crew] = await Promise.all([world.admin(), world.org(), world.crew()])
  const gig = await addGig(admin, org.id, { name, start_date: localDate(0), end_date: localDate(0), venue: 'E2E Arena' })
  await addToGig(admin, gig.id, crew, { functionTitle: 'Sound', callTime: '08:30' })
  const schedule = await admin.client.from('gig_schedule').insert({ gig_id: gig.id, day: localDate(0), start_time: '23:58', title: 'Line check', created_by: admin.id })
  expect(schedule.error).toBeNull()
  const task = await admin.client.from('tasks').insert({ gig_id: gig.id, title: `Patch the stage box ${stamp()}`, assignee_id: crew.id }).select('title').single()
  expect(task.error).toBeNull()
  return { gig, taskTitle: task.data.title }
}

// covers: T49, T51 (On-site mode shows your tasks)
test('on a gig day the gig opens in On-site mode, and it can be switched off and on', { tag: '@gigs' }, async ({ crewOnGig, world }) => {
  const { page } = crewOnGig
  const s = stamp()
  const { gig, taskTitle } = await gigToday(world, `E2E On Site ${s}`)
  await readNotifications(crewOnGig.account)

  // Opens on "On site today", with a note saying why, the call time, today's schedule and my task
  await page.goto(gig.path)
  const onSite = page.locator('section[aria-labelledby="onsite-title"]')
  await expect(onSite.getByRole('heading', { name: 'On site today' })).toBeVisible({ timeout: LOAD })
  await expect(onSite.getByRole('note')).toContainText('On-site mode came on because today is a gig day.')
  await expect(onSite).toContainText('Your call time · Sound')
  await expect(onSite).toContainText('08:30')
  await expect(onSite).toContainText('Line check')
  await expect(onSite.getByRole('heading', { name: 'Your task' })).toBeVisible()
  await expect(onSite).toContainText(taskTitle)
  await accessible(page)

  // Each big button: the links go to the day's tools, the others open the gig's tab
  await expect(onSite.getByRole('link', { name: 'Call sheet' })).toHaveAttribute('href', `${gig.path}/callsheet`)
  await expect(onSite.getByRole('link', { name: 'Rehearsal notes' })).toHaveAttribute('href', `${gig.path}?tab=tools&tool=rehearsal`)
  // ("Crew and phones" is checked on its own below: it does nothing in simple mode)
  for (const [tile, tab] of [['Tasks', 'Tasks'], ['Files', 'Assets'], ['Chat', 'Chat']]) {
    await page.goto(gig.path)
    await onSite.getByRole('button', { name: tile, exact: true }).click()
    await expect(page.getByRole('tab', { name: new RegExp(`^${tab}`), selected: true })).toBeVisible()
  }
  await page.goto(gig.path)
  await onSite.getByRole('link', { name: 'Call sheet' }).click()
  await expect(page).toHaveURL(new RegExp(`${gig.path}/callsheet$`))

  // Full gig view: stays off for the rest of the day
  await page.goto(gig.path)
  await onSite.getByRole('button', { name: 'Full gig view' }).click()
  await expect(page.getByRole('button', { name: 'On-site mode' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'On-site mode' })).toBeVisible({ timeout: LOAD })
  await expect(page.getByRole('heading', { name: 'On site today' })).toHaveCount(0)

  // On another gig (not today), switched on by hand: no note, since it isn't automatic
  await page.goto(crewOnGig.gig.path)
  await page.getByRole('button', { name: 'On-site mode' }).click()
  await expect(page.getByRole('heading', { name: 'On site today' })).toBeVisible()
  await expect(page.getByRole('note').filter({ hasText: 'On-site mode came on' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Full gig view' }).click()

  // Settings → Language and appearance: switched off, a gig day opens on the normal overview
  await page.goto('/settings/preferences')
  const auto = page.getByRole('checkbox', { name: /Switch to On-site mode on gig days/ })
  await auto.uncheck()
  await accessible(page)
  const another = await gigToday(world, `E2E Not On Site ${s}`)
  await page.goto(another.gig.path)
  await expect(page.getByRole('button', { name: 'On-site mode' })).toBeVisible({ timeout: LOAD })
  await expect(page.getByRole('heading', { name: 'On site today' })).toHaveCount(0)
  await page.goto('/settings/preferences')
  await auto.check()
})

// covers: T49 (Portuguese wording)
test('On-site mode in Portuguese', { tag: '@gigs' }, async ({ browser, baseURL, world }) => {
  const crew = await world.crew()
  const { gig, taskTitle } = await gigToday(world, `E2E No Local ${stamp()}`)
  await readNotifications(crew)
  const page = await pageAs(browser, crew, { baseURL, lang: 'pt' })
  try {
    await page.goto(gig.path)
    const onSite = page.locator('section[aria-labelledby="onsite-title"]')
    await expect(onSite.getByRole('heading', { name: 'No local hoje' })).toBeVisible({ timeout: LOAD })
    await expect(onSite.getByRole('note')).toContainText('O modo no local ligou-se porque hoje é dia de evento.')
    await expect(onSite).toContainText('A sua hora de chamada')
    await expect(onSite.getByRole('heading', { name: 'A sua tarefa' })).toBeVisible()
    await expect(onSite).toContainText(taskTitle)
    await accessible(page)
    await onSite.getByRole('button', { name: 'Vista completa do evento' }).click()
    await expect(page.getByRole('button', { name: 'Modo no local' })).toBeVisible()
  } finally {
    await page.context().close()
  }
})

// covers: T49 (found while automating it)
test('the On-site "Crew and phones" button opens the crew list in simple mode', { tag: '@gigs' }, async ({ crewOnGig, world }) => {
  // BUG (#215): a crew-only person is in simple mode, whose gig tabs leave out Crew, so the
  // button switches to the Crew tab and the page switches straight back to the overview: nothing happens.
  test.fail()
  const { page } = crewOnGig
  const { gig } = await gigToday(world, `E2E Crew Tile ${stamp()}`)
  await page.goto(gig.path)
  const onSite = page.locator('section[aria-labelledby="onsite-title"]')
  await onSite.getByRole('button', { name: 'Crew and phones', exact: true }).click()
  await expect(page.getByRole('tab', { name: /^Crew/, selected: true })).toBeVisible()
})

// covers: T1 (the invite and the bell; the email itself is checked by hand)
test('adding someone to a gig from the Crew tab puts it in their bell', { tag: '@gigs' }, async ({ adminWithOrg, member }) => {
  const { page, account: admin, org } = adminWithOrg
  const gig = await addGig(admin, org.id, { name: `E2E Invite ${stamp()}` })
  await readNotifications(member.account)

  await page.goto(`${gig.path}?tab=crew`)
  await page.getByRole('button', { name: 'Invite crew' }).first().click()
  const invite = page.getByRole('dialog', { name: 'Invite crew member' })
  await invite.getByPlaceholder('technician@company.com').fill(member.account.email)
  await invite.getByLabel('Function / role on gig').fill('Monitor engineer')
  await accessible(page)
  await invite.getByRole('button', { name: 'Add to gig' }).click()
  await expect(page.locator('li.crew-row').filter({ hasText: member.account.name })).toContainText('Monitor engineer', { timeout: LOAD })

  const theirs = member.page
  await theirs.goto('/me')
  const bell = theirs.getByRole('button', { name: '1 unread notification' })
  await expect(bell).toBeVisible({ timeout: LOAD })
  await bell.click()
  await theirs.getByRole('dialog', { name: 'Notifications' }).getByRole('button', { name: new RegExp(`added you to ${gig.name}`) }).click()
  await expect(theirs).toHaveURL(new RegExp(gig.path))
  await expect(theirs.getByRole('heading', { name: gig.name })).toBeVisible({ timeout: LOAD })
})

// covers: T1 (the next morning's email summary would include it). Skips until test_support is installed.
test('a gig invite is in the member\'s next morning email summary', { tag: '@gigs' }, async ({ adminWithOrg, world }) => {
  const { account: admin, org } = adminWithOrg
  const person = await world.member()
  await readNotifications(person)
  const gig = await addGig(admin, org.id, { name: `E2E Summary ${stamp()}` })
  await addToGig(admin, gig.id, person)
  const rows = await emailSummaryCandidates(admin, org.id)
  const theirs = rows.filter(r => r.user_id === person.id)
  expect(theirs.reduce((n, r) => n + r.notifications, 0)).toBeGreaterThanOrEqual(1)
  expect(theirs.every(r => !r.opted_out && !r.muted)).toBe(true)
})

// covers: T51
test('checklist templates, organisation tasks for a member, the filters and a task from a repair', { tag: '@gigs' }, async ({ adminWithOrg, member }) => {
  const { page, account: admin, org, world } = adminWithOrg
  const s = stamp()
  const gig = await world.gig()
  const tplName = `Van check ${s}`

  // Organisation → Tasks → Checklist templates: a "Van check" with four lines
  await page.goto(`${org.path}/tasks?tab=templates`)
  await expect(page.getByRole('tab', { name: 'Checklist templates', selected: true })).toBeVisible({ timeout: LOAD })
  await page.getByRole('button', { name: 'New template' }).first().click()
  const tplForm = page.getByRole('dialog', { name: 'New template' })
  await tplForm.getByLabel('Name').fill(tplName)
  await tplForm.getByLabel('Checklist').fill('Tyres\nLights\nFuel\nStraps')
  await tplForm.getByRole('button', { name: 'Save template' }).click()
  await expect(page.getByText(tplName)).toBeVisible({ timeout: LOAD })
  await expect(page.getByText('4 items · Tyres, Lights, Fuel…')).toBeVisible()
  await accessible(page)

  // A gig's Tasks tab: New task → Start from a template fills the title and the checklist
  await page.goto(`${gig.path}?tab=tasks`)
  await page.getByRole('button', { name: 'New task' }).first().click()
  const taskForm = page.getByRole('dialog', { name: 'New task' })
  await taskForm.getByLabel('Start from a template').selectOption({ label: tplName })
  await expect(taskForm.getByLabel('What')).toHaveValue(tplName)
  await expect(taskForm.getByLabel('Checklist')).toHaveValue('Tyres\nLights\nFuel\nStraps')
  await taskForm.getByRole('button', { name: 'Save task' }).click()
  await expect(page.getByRole('listitem').filter({ has: page.getByRole('button', { name: tplName }) }).first()).toContainText('0/4')

  // Organisation → Tasks: a task for a member of the organisation
  await readNotifications(member.account)
  const orgTask = `Count the cables ${s}`
  await page.goto(`${org.path}/tasks`)
  await page.getByRole('button', { name: 'New task' }).first().click()
  const orgForm = page.getByRole('dialog', { name: 'New task' })
  await orgForm.getByLabel('What').fill(orgTask)
  await orgForm.getByLabel('For').selectOption(member.account.id)
  await orgForm.getByRole('button', { name: 'Save task' }).click()
  await expect(page.getByRole('button', { name: orgTask })).toBeVisible({ timeout: LOAD })

  // The filters: Organisation shows its own tasks, On gigs the gigs' ones
  const filters = page.getByRole('group', { name: 'Show tasks' })
  await filters.getByRole('button', { name: 'Organisation' }).click()
  await expect(page.getByRole('button', { name: orgTask })).toBeVisible()
  await expect(page.getByRole('button', { name: tplName })).toHaveCount(0)
  await filters.getByRole('button', { name: 'On gigs' }).click()
  await expect(page.getByRole('button', { name: tplName }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: orgTask })).toHaveCount(0)
  await accessible(page)

  // The member gets a notification that opens My tasks, with the task in it
  const theirs = member.page
  await theirs.goto('/me')
  await theirs.getByRole('button', { name: '1 unread notification' }).click({ timeout: LOAD })
  await theirs.getByRole('dialog', { name: 'Notifications' }).getByRole('button', { name: new RegExp(`gave you a task: ${orgTask}`) }).click()
  await expect(theirs).toHaveURL(/\/tasks$/)
  await expect(theirs.getByRole('button', { name: orgTask })).toBeVisible({ timeout: LOAD })

  // Inventory → Maintenance: a repair makes a task once; the second time it says it already has one
  const item = await addItem(admin, org.id, { name: `E2E Moving Head ${s}` })
  const repair = await admin.client.from('repairs').insert({ org_id: org.id, item_id: item.id, quantity: 1, problem: `Fan noise ${s}` }).select('id').single()
  expect(repair.error).toBeNull()
  await page.goto(`${org.path}/inventory?tab=maintenance`)
  await page.getByRole('button', { name: new RegExp(`Fan noise ${s}`) }).click({ timeout: LOAD })
  await page.getByRole('button', { name: 'Make a task' }).click()
  await expect(page.getByText('Task made. Give it to someone on the Tasks page.')).toBeVisible({ timeout: LOAD })
  await page.getByRole('button', { name: 'Make a task' }).click()
  await expect(page.getByText('This repair already has a task.')).toBeVisible({ timeout: LOAD })
})

// The organisation export from its settings, as { 'file.csv': text }
async function downloadExport(page, org) {
  await page.goto(`${org.path}?panel=settings`)
  const settings = page.getByRole('dialog', { name: `${org.name} — settings` })
  const download = page.waitForEvent('download', { timeout: 60_000 })
  await settings.getByRole('button', { name: 'Download everything (zip)' }).click()
  const files = await readZip(await download)
  return Object.fromEntries(Object.keys(files).map(f => [f.split('/').pop(), zipText(files, f)]))
}

// An export file's rows as { heading: value } (semicolon-separated, headings in plain words; the
// test data has no semicolons or quotes in it)
function csvRows(text) {
  const [head, ...rows] = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim())
  const names = head.split(';').map(h => h.trim())
  const unquote = v => v.trim().replace(/^"(.*)"$/, '$1').replace(/""/g, '"')
  return rows.map(r => Object.fromEntries(r.split(';').map((v, i) => [names[i], unquote(v)])))
}

// The gig cards on the organisation's gigs list
const gigCard = (page, gig) => page.locator('.gig-card').filter({ hasText: gig.name })

// covers: T52 (all but "Upcoming and Past go by the dates only": see the next test)
test('gig statuses and types: set up, used on a gig, filtered, re-meant, removed and exported', { tag: '@gigs' }, async ({ adminWithOrg }) => {
  const { page, account: admin } = adminWithOrg
  const s = stamp()
  // Its own organisation: statuses and types are organisation-wide
  const org = await addOrg(admin, { name: `E2E Labels ${s}` })
  const one = await addGig(admin, org.id, { name: `E2E Label One ${s}`, start_date: localDate(0), end_date: localDate(0) })
  const two = await addGig(admin, org.id, { name: `E2E Label Two ${s}`, start_date: localDate(0), end_date: localDate(0) })

  await page.goto(`${org.path}?panel=settings`)
  const section = page.locator('section[aria-labelledby="org-labels"]')
  await section.getByRole('button', { name: 'Start with a common set' }).click()
  const statuses = section.getByRole('textbox', { name: 'Name', exact: true })
  await expect(statuses).toHaveCount(6, { timeout: LOAD })
  await expect(statuses.nth(0)).toHaveValue('Option')
  // Rename one, change a colour, move one up
  await statuses.nth(0).fill('Pencilled')
  await statuses.nth(0).blur()
  await expect(section.getByRole('button', { name: 'Move Pencilled down' })).toBeVisible({ timeout: LOAD })
  const firstColour = section.getByRole('combobox', { name: 'Colour', exact: true }).first()
  await firstColour.selectOption('pink')
  await expect(firstColour).toHaveValue('pink')
  await section.getByRole('button', { name: 'Move Confirmed up' }).click()
  await expect(statuses.nth(0)).toHaveValue('Confirmed', { timeout: LOAD })
  await expect(statuses.nth(1)).toHaveValue('Pencilled')
  // Two gig types
  for (const type of ['Festival', 'Corporate']) {
    await section.getByRole('textbox', { name: 'New gig type' }).fill(type)
    await section.getByRole('textbox', { name: 'New gig type' }).press('Enter')
    await expect(section.getByRole('button', { name: `Remove ${type}` })).toBeVisible({ timeout: LOAD })
  }
  await accessible(page)

  // Edit gig: the organisation's statuses and types are there
  const editGig = async (gig, status, type) => {
    await page.goto(gig.path)
    await page.getByRole('button', { name: 'Edit gig' }).click()
    const form = page.getByRole('dialog', { name: 'Edit gig' })
    // In the organisation's order (a gig with no status of its own also lists its built-in one, "Draft")
    const options = form.getByLabel('Status', { exact: true }).locator('option')
    await expect.poll(async () => (await options.allTextContents()).filter(o => o !== 'Draft'))
      .toEqual(['Confirmed', 'Pencilled', 'On the road', 'Done', 'Invoiced', 'Cancelled'])
    await form.getByLabel('Status', { exact: true }).selectOption({ label: status })
    await form.getByLabel('Gig type').selectOption({ label: type })
    await form.getByRole('button', { name: 'Save changes' }).click()
    await expect(form).toHaveCount(0, { timeout: LOAD })
  }
  await editGig(one, 'Pencilled', 'Festival')
  await editGig(two, 'Confirmed', 'Corporate')

  // The gigs list: filter by status and by type, in the list and in the calendar
  await page.goto(org.path)
  await expect(gigCard(page, one)).toBeVisible({ timeout: LOAD })
  await page.getByRole('combobox', { name: 'Filter by status' }).selectOption({ label: 'Pencilled' })
  await expect(gigCard(page, one)).toBeVisible()
  await expect(gigCard(page, two)).toHaveCount(0)
  await page.getByRole('combobox', { name: 'Filter by status' }).selectOption({ label: 'All statuses' })
  await page.getByRole('combobox', { name: 'Filter by gig type' }).selectOption({ label: 'Corporate' })
  await expect(gigCard(page, two)).toBeVisible()
  await expect(gigCard(page, one)).toHaveCount(0)
  await page.getByRole('button', { name: 'Calendar view' }).click()
  await expect(page.getByText(two.name).first()).toBeVisible({ timeout: LOAD })
  await expect(page.getByText(one.name)).toHaveCount(0)
  await page.getByRole('combobox', { name: 'Filter by gig type' }).selectOption({ label: 'Festival' })
  await expect(page.getByText(one.name).first()).toBeVisible()
  await expect(page.getByText(two.name)).toHaveCount(0)
  await page.getByRole('button', { name: 'List view' }).click()
  await page.getByRole('combobox', { name: 'Filter by gig type' }).selectOption({ label: 'All gig types' })

  // Change what a status means: Confirmed now means archived, and its gig moves to Archived
  await page.goto(`${org.path}?panel=settings`)
  const confirmedMeans = section.getByRole('listitem').filter({ has: page.locator('input[value="Confirmed"]') }).getByRole('combobox', { name: 'Means' })
  await confirmedMeans.selectOption('archived')
  await expect(confirmedMeans).toHaveValue('archived', { timeout: LOAD })
  // Remove a type: its gigs show none
  page.once('dialog', d => d.accept())
  await section.getByRole('button', { name: 'Remove Festival' }).click()
  await expect(section.getByRole('button', { name: 'Remove Festival' })).toHaveCount(0, { timeout: LOAD })

  await page.goto(org.path)
  await page.getByRole('tab', { name: /^Archived/ }).click()
  await expect(gigCard(page, two)).toBeVisible({ timeout: LOAD })
  await page.getByRole('tab', { name: /^Upcoming/ }).click()
  await expect(gigCard(page, one)).toBeVisible()
  await expect(gigCard(page, two)).toHaveCount(0)
  await page.goto(one.path)
  await page.getByRole('button', { name: 'Edit gig' }).click()
  await expect(page.getByRole('dialog', { name: 'Edit gig' }).getByLabel('Gig type').locator('option:checked')).toHaveText('No type')

  // The organisation export: the gigs file has the status name and the type
  const files = await downloadExport(page, org)
  const gigs = csvRows(Object.entries(files).find(([name]) => name.endsWith('-gigs.csv'))[1])
  expect(gigs.find(g => g.name === two.name)).toMatchObject({ 'status label': 'Confirmed', 'gig type': 'Corporate' })
  expect(gigs.find(g => g.name === one.name)).toMatchObject({ 'status label': 'Pencilled', 'gig type': '' })
})

// covers: T52 ("Upcoming and Past go by the dates only, whatever the status")
test('a gig marked "Invoiced" stays under Upcoming until its last day has passed', { tag: '@gigs' }, async ({ adminWithOrg }) => {
  // The owner's decision on #217: a gig moves to Past only when its last day has passed, whatever
  // its status; "Invoiced" is about money only (src/lib/gigs.js gigBucket).
  const { page, account: admin } = adminWithOrg
  const s = stamp()
  const org = await addOrg(admin, { name: `E2E Invoiced ${s}` })
  const { error } = await admin.client.from('gig_statuses').insert({ org_id: org.id, name: 'Invoiced', colour: 'sky', base_status: 'completed', position: 1 })
  expect(error).toBeNull()
  const gig = await addGig(admin, org.id, { name: `E2E Invoiced Gig ${s}`, start_date: localDate(3), end_date: localDate(3) })
  const over = await addGig(admin, org.id, { name: `E2E Finished Gig ${s}`, start_date: localDate(-3), end_date: localDate(-2) })
  await page.goto(gig.path)
  await page.getByRole('button', { name: 'Edit gig' }).click()
  const form = page.getByRole('dialog', { name: 'Edit gig' })
  await form.getByLabel('Status', { exact: true }).selectOption({ label: 'Invoiced' })
  await form.getByRole('button', { name: 'Save changes' }).click()
  await expect(form).toHaveCount(0, { timeout: LOAD })
  await page.goto(org.path)
  // Invoiced, but its day is still ahead: Upcoming
  await page.getByRole('tab', { name: /^Upcoming/ }).click()
  await expect(gigCard(page, gig)).toBeVisible({ timeout: LOAD })
  await expect(gigCard(page, over)).toHaveCount(0)
  // Not invoiced, but its last day has passed: Past
  await page.getByRole('tab', { name: /^Past/ }).click()
  await expect(gigCard(page, over)).toBeVisible({ timeout: LOAD })
  await expect(gigCard(page, gig)).toHaveCount(0)
})

// Organisation settings → Custom fields: adds a field of a kind ('text', 'number', 'date', 'yes_no',
// 'choice', 'link') to the chosen kind of record
async function addField(section, label, kind, choices) {
  await section.getByRole('textbox', { name: 'New field name' }).fill(label)
  await section.getByRole('combobox', { name: 'Kind of field' }).selectOption(kind)
  if (choices) await section.getByRole('textbox', { name: 'Choices', exact: true }).fill(choices)
  await section.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(section.getByRole('button', { name: `Remove ${label}` })).toBeVisible({ timeout: LOAD })
  // The form empties itself just after the field shows: wait, or the next name typed is wiped
  await expect(section.getByRole('textbox', { name: 'New field name' })).toHaveValue('')
}

// A custom field's id by its label (for set-up through the API)
async function fieldId(account, orgId, entity, label) {
  const { data } = await account.client.from('custom_fields').select('id').eq('org_id', orgId).eq('entity', entity).eq('label', label).is('removed_at', null).single()
  return data.id
}

// covers: T53 (client, supplier and item values are set through the API here; their forms are the
// same CustomFieldInputs as the gig form, filled in by the UI below)
test('custom fields: one of each kind on a gig, shown, searched, renamed, reordered, removed and exported', { tag: '@gigs' }, async ({ adminWithOrg, browser, baseURL, world }) => {
  test.setTimeout(180_000) // the longest journey; nightly only
  const { page, account: admin } = adminWithOrg
  const s = stamp()
  const org = await addOrg(admin, { name: `E2E Fields ${s}` })
  const gig = await addGig(admin, org.id, { name: `E2E Fields Gig ${s}` })

  await page.goto(`${org.path}?panel=settings`)
  const section = page.locator('section[aria-labelledby="org-fields"]')
  await expect(section.getByRole('button', { name: 'Gigs', pressed: true })).toBeVisible({ timeout: LOAD })
  await addField(section, 'PO number', 'text')
  await addField(section, 'Stage depth', 'number')
  await addField(section, 'Load-in day', 'date')
  await addField(section, 'Insurance checked', 'yes_no')
  await addField(section, 'Stage', 'choice', 'Indoor\nOutdoor')
  await addField(section, 'Venue map', 'link')
  await accessible(page)

  // Edit gig: fill them in (a number with a comma)
  await page.goto(gig.path)
  await page.getByRole('button', { name: 'Edit gig' }).click()
  const form = page.getByRole('dialog', { name: 'Edit gig' })
  await form.getByLabel('PO number').fill(`PO-${s}`)
  await form.getByLabel('Stage depth').fill('12,5')
  await form.getByLabel('Load-in day').fill('2027-03-04')
  await form.getByRole('group', { name: 'Insurance checked' }).getByLabel('Yes').check()
  await form.getByLabel('Stage', { exact: true }).selectOption('Outdoor')
  await form.getByLabel('Venue map').fill('https://example.com/map')
  await form.getByRole('button', { name: 'Save changes' }).click()
  await expect(form).toHaveCount(0, { timeout: LOAD })

  // The overview shows them under "More details", with the link opening
  const details = page.locator('section').filter({ has: page.getByRole('heading', { name: 'More details' }) }).last()
  await expect(details).toContainText(`PO numberPO-${s}`, { timeout: LOAD })
  await expect(details).toContainText('Stage depth12,5')
  await expect(details).toContainText('Load-in day4 Mar 2027')
  await expect(details).toContainText('Insurance checkedYes')
  await expect(details).toContainText('StageOutdoor')
  await expect(details.getByRole('link', { name: 'example.com/map' })).toHaveAttribute('href', 'https://example.com/map')
  await accessible(page)

  // The gigs list finds it by the text
  await page.goto(org.path)
  await page.getByRole('textbox', { name: 'Search gigs, venues…' }).fill(`PO-${s}`)
  await expect(gigCard(page, gig)).toBeVisible({ timeout: LOAD })

  // A client, a supplier and a catalogue item field, each filled in
  await page.goto(`${org.path}?panel=settings`)
  const on = section.getByRole('group', { name: 'Fields on' })
  for (const [entity, label] of [['Clients', 'Account manager'], ['Suppliers', 'Supplier code'], ['Catalogue items', 'Barcode note']]) {
    await on.getByRole('button', { name: entity }).click()
    await addField(section, label, 'text')
  }
  const client = await addClient(admin, org.id, { name: `E2E Client ${s}`, custom_values: { [await fieldId(admin, org.id, 'client', 'Account manager')]: 'Rita' } })
  const supplier = await admin.client.from('suppliers').insert({ org_id: org.id, name: `E2E Supplier ${s}`, custom_values: { [await fieldId(admin, org.id, 'supplier', 'Supplier code')]: 'SUP-7' } })
  expect(supplier.error).toBeNull()
  await addItem(admin, org.id, { name: `E2E Item ${s}`, custom_values: { [await fieldId(admin, org.id, 'item', 'Barcode note')]: 'Faded' } })

  // Rename a field and reorder; remove one: gone from the screens
  await on.getByRole('button', { name: 'Gigs' }).click()
  const poName = section.getByRole('textbox', { name: 'Field name' }).first()
  await expect(poName).toHaveValue('PO number')
  await poName.fill('Purchase order')
  await poName.blur()
  await expect(section.getByRole('button', { name: 'Remove Purchase order' })).toBeVisible({ timeout: LOAD })
  await section.getByRole('button', { name: 'Move Venue map up' }).click()
  await expect(section.getByRole('textbox', { name: 'Field name' }).nth(4)).toHaveValue('Venue map', { timeout: LOAD })
  page.once('dialog', d => d.accept())
  await section.getByRole('button', { name: 'Remove Stage', exact: true }).click()
  await expect(section.getByRole('button', { name: 'Remove Stage', exact: true })).toHaveCount(0, { timeout: LOAD })
  await page.goto(gig.path)
  await expect(details).toContainText(`Purchase orderPO-${s}`, { timeout: LOAD })
  await expect(details).not.toContainText('Outdoor')

  // The export: one column per field, headed with its label
  const files = await downloadExport(page, org)
  const file = part => csvRows(Object.entries(files).find(([name]) => name.endsWith(`-${part}.csv`))[1])
  expect(file('gigs').find(g => g.name === gig.name)).toMatchObject({
    'Purchase order': `PO-${s}`, 'Stage depth': '12,5', 'Load-in day': '2027-03-04', 'Insurance checked': 'yes', 'Venue map': 'https://example.com/map',
  })
  expect(file('clients').find(c => c.name === client.name)).toMatchObject({ 'Account manager': 'Rita' })
  expect(file('suppliers').find(c => c.name === `E2E Supplier ${s}`)).toMatchObject({ 'Supplier code': 'SUP-7' })
  expect(file('items').find(c => c.name === `E2E Item ${s}`)).toMatchObject({ 'Barcode note': 'Faded' })

  // Crew on the gig see its fields, not the client ones
  const crew = await world.crew()
  await addToGig(admin, gig.id, crew)
  const theirs = await pageAs(browser, crew, { baseURL })
  try {
    await theirs.goto(gig.path)
    const crewDetails = theirs.locator('section').filter({ has: theirs.getByRole('heading', { name: 'More details' }) }).last()
    await expect(crewDetails).toContainText(`Purchase orderPO-${s}`, { timeout: LOAD })
  } finally {
    await theirs.context().close()
  }
  const { data: clientFields } = await crew.client.from('custom_fields').select('id').eq('org_id', org.id).eq('entity', 'client')
  expect(clientFields).toEqual([])
})

// covers: T53 ("remove one and check its value is … still in the organisation export")
test('a removed custom field\'s values still come out in the organisation export', { tag: '@gigs' }, async ({ adminWithOrg }) => {
  // BUG (#216): the settings say "values already filled in are kept and still come out in
  // the export", but the export's custom columns (private.custom_columns) only take fields that
  // aren't removed, so a removed field's column and values are left out.
  test.fail()
  const { page, account: admin } = adminWithOrg
  const s = stamp()
  const org = await addOrg(admin, { name: `E2E Removed Field ${s}` })
  const field = await admin.client.from('custom_fields').insert({ org_id: org.id, entity: 'gig', label: 'Rider version', kind: 'text', position: 1 }).select('id').single()
  expect(field.error).toBeNull()
  const gig = await addGig(admin, org.id, { name: `E2E Removed Field Gig ${s}`, custom_values: { [field.data.id]: 'v3' } })
  const removed = await admin.client.from('custom_fields').update({ removed_at: new Date().toISOString() }).eq('id', field.data.id)
  expect(removed.error).toBeNull()
  const files = await downloadExport(page, org)
  const gigs = csvRows(Object.entries(files).find(([name]) => name.endsWith('-gigs.csv'))[1])
  expect(gigs.find(g => g.name === gig.name)).toMatchObject({ 'Rider version': 'v3' })
})

// covers: T23 (crew-only home, Simple mode, empty screens; the first-steps card's steps are done through
// the set-up after checking where each one leads)
test('a crew-only account gets the simple home; Simple mode switches; first steps and empty screens guide', { tag: '@gigs' }, async ({ adminWithOrg, browser, baseURL, world }) => {
  const { page, account: admin, org } = adminWithOrg
  const s = stamp()
  // A new crew-only account, put on a gig
  const crew = await world.account('crew2')
  const gig = await addGig(admin, org.id, { name: `E2E Next Gig ${s}`, start_date: localDate(5), end_date: localDate(5) })
  await addToGig(admin, gig.id, crew, { functionTitle: 'LX tech', callTime: '09:15' })
  // Equipment on it, so "Report damage" has something to report (it opens the form only then)
  const fixture = await addItem(admin, org.id, { name: `E2E Spot ${s}` })
  expect((await admin.client.from('gig_equipment').insert({ gig_id: gig.id, item_id: fixture.id, quantity: 4 })).error).toBeNull()
  await readNotifications(crew)

  const theirs = await pageAs(browser, crew, { baseURL })
  try {
    // The simple home: the next gig with the call time
    await theirs.goto('/me')
    const next = theirs.locator('section[aria-labelledby="next-gig"]')
    await expect(next.getByRole('heading', { name: gig.name })).toBeVisible({ timeout: LOAD })
    await expect(next).toContainText('Call: 09:15')
    await accessible(theirs)
    // Call sheet, Chat and Report damage
    await next.getByRole('button', { name: 'Call sheet' }).click()
    await expect(theirs).toHaveURL(new RegExp(`${gig.path}/callsheet$`))
    await expect(theirs.getByRole('heading', { name: gig.name })).toBeVisible({ timeout: LOAD })
    await theirs.goto('/me')
    await next.getByRole('button', { name: 'Chat' }).click()
    await expect(theirs.getByRole('tab', { name: /^Chat/, selected: true })).toBeVisible({ timeout: LOAD })
    await theirs.goto('/me')
    await next.getByRole('button', { name: 'More actions' }).click()
    await expect(next.getByRole('menu', { name: 'More actions' })).toBeVisible()
    await theirs.getByRole('menuitem', { name: 'Report damage' }).click()
    await expect(theirs).toHaveURL(new RegExp(`${gig.path}\\?tab=equipment`))
    await expect(theirs.getByRole('dialog', { name: 'Report damage' })).toBeVisible({ timeout: LOAD })
    await accessible(theirs)

    // Account → Appearance: Simple mode Off, then On
    const simpleMode = async choice => {
      await theirs.goto('/settings/preferences')
      const group = theirs.getByRole('radiogroup', { name: 'Simple mode' })
      await group.getByRole('radio', { name: choice }).click()
      await expect(group.getByRole('radio', { name: choice })).toHaveAttribute('aria-checked', 'true')
      await theirs.goto('/me')
    }
    await simpleMode('Off')
    await expect(theirs.getByText(gig.name).first()).toBeVisible({ timeout: LOAD })
    await expect(next).toHaveCount(0)
    await simpleMode('On')
    await expect(next.getByRole('heading', { name: gig.name })).toBeVisible({ timeout: LOAD })
  } finally {
    await theirs.context().close()
  }

  // As admin of a new organisation: the first-steps card, each step's link, then each step done
  const fresh = await addOrg(admin, { name: `E2E First Steps ${s}` })
  const steps = page.locator('section[aria-labelledby="first-steps-title"]')
  const openCard = async progress => {
    await page.goto(fresh.path)
    await expect(steps.getByRole('button', { name: new RegExp(`First steps · ${progress}`) })).toBeVisible({ timeout: LOAD })
    if (await steps.getByRole('button', { name: /First steps/ }).getAttribute('aria-expanded') !== 'true') await steps.getByRole('button', { name: /First steps/ }).click()
  }
  await openCard('0 of 4 done · next: Add your company details')
  await accessible(page)
  for (const [step, url] of [
    ['Add your company details', `${fresh.path}/quotes?company=1`], ['Add your equipment', `${fresh.path}/inventory`],
    ['Invite your team', `${fresh.path}?panel=members`], ['Create your first gig', `${fresh.path}?new=gig`],
  ]) {
    await openCard('0 of 4 done')
    await steps.getByRole('button', { name: step, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`${url.replace(/[?]/g, '\\?')}$`))
  }

  // The empty catalogue says what to do
  await page.goto(`${fresh.path}/inventory`)
  await expect(page.getByText(/^No equipment yet\. Add items one by one/)).toBeVisible({ timeout: LOAD })
  await expect(page.getByRole('button', { name: 'Import' }).first()).toBeVisible()

  const done = async (what, result) => expect(result.error, what).toBeNull()
  await done('company', await admin.client.from('organisations').update({ legal_name: `E2E First Steps ${s} Lda` }).eq('id', fresh.id))
  await openCard('1 of 4 done · next: Add your equipment')
  await addItem(admin, fresh.id, { name: `E2E Mixer ${s}` })
  await openCard('2 of 4 done · next: Invite your team')
  await addToOrg(admin, fresh.id, await world.account('extra'), 'member')
  await openCard('3 of 4 done · next: Create your first gig')
  const empty = await addGig(admin, fresh.id, { name: `E2E Empty Gig ${s}` })
  await page.goto(fresh.path)
  await expect(page.locator('.gig-card').filter({ hasText: empty.name })).toBeVisible({ timeout: LOAD })
  await expect(steps).toHaveCount(0)

  // An empty gig's tabs each say what to do
  for (const [tab, text] of [
    ['Schedule', 'No schedule yet.'], ['Tasks', 'No tasks yet'], ['Assets', 'No assets uploaded yet'],
    ['Equipment', /^No equipment planned yet\./], ['Transport', 'No trips yet'], ['Tools', 'No tools on this gig yet'],
    ['Updates', 'No updates yet. Be the first to post.'],
  ]) {
    if (!page.url().includes(empty.id)) await page.goto(empty.path)
    await page.getByRole('tab', { name: new RegExp(`^${tab}`) }).click({ timeout: LOAD })
    await expect(page.getByText(text).first()).toBeVisible({ timeout: LOAD })
  }
  await accessible(page)
})
