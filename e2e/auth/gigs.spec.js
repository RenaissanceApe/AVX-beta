// Gigs, crew, the double-booking check and tasks (AT1): the owner's manual lines for these areas
// (docs/PENDING.md section 2), as signed-in journeys on the TEST project. docs/TESTING.md,
// "Automated test suite". Data a test only needs to exist is made through setup.js; the UI is
// clicked only for what the T-line checks.
import { createHash } from 'node:crypto'
import { test, expect } from './fixtures.js'
import { expectAccessible } from './helpers.js'
import { emailSummaryCandidates } from './testSupport.js'
import { readZip, zipText } from './files.js'
import { addGig, addItem, addOrg, addToGig, pageAs } from './setup.js'

test.use({ area: 'gigs' })

const stamp = () => Date.now().toString(36)
const localDate = (days = 0) => {
  const d = new Date(Date.now() + days * 86400e3)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Marks the account's notifications read, so the bell shows a single-digit count (or none) before an
// accessibility check: with more than 9 unread it fails axe (see "the bell with more than 9 unread …")
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
  await expectAccessible(pm)
  await form.getByRole('button', { name: 'Save task' }).click()
  await expect(form).toHaveCount(0)
  const pmRow = pm.getByRole('listitem').filter({ has: pm.getByRole('button', { name: title }) })
  await expect(pmRow).toContainText('0/3')

  // The crew member gets a notification that opens the gig's Tasks tab
  await crew.goto('/tasks')
  const bell = crew.getByRole('button', { name: /unread notification/ })
  await expect(bell).toBeVisible({ timeout: 20_000 })
  await bell.click()
  await crew.getByRole('dialog', { name: 'Notifications' }).getByRole('button', { name: new RegExp(`gave you a task on ${gig.name}: ${title}`) }).click()
  await expect(crew).toHaveURL(new RegExp(`${gig.path}\\?tab=tasks`))
  await expect(crew.getByRole('button', { name: title })).toBeVisible({ timeout: 15_000 })

  // …and it's under My work → My tasks
  await readNotifications(crewOnGig.account)
  await crew.goto('/tasks')
  await expect(crew.getByRole('heading', { name: 'My tasks' })).toBeVisible({ timeout: 15_000 })
  await expectAccessible(crew)
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
  await expect(pm.getByRole('button', { name: title })).toHaveCount(0, { timeout: 20_000 })
  await pm.getByRole('button', { name: 'Open', pressed: true }).click()
  await expect(pmRow).toContainText(`done by ${crewOnGig.account.name}`, { timeout: 20_000 })
  await expect(pmRow).toContainText('2/3')

  // The PM removes it; it asks first
  await pmRow.getByRole('button', { name: title }).click()
  pm.once('dialog', d => { expect(d.message()).toContain(title); d.accept() })
  await pmRow.getByRole('button', { name: `Remove the task ${title}` }).click()
  await expect(pm.getByRole('button', { name: title })).toHaveCount(0)
})

// covers: T50 (found while automating it: two ticks saved at once must both be kept)
test('two quick checklist ticks are both kept', { tag: '@gigs' }, async ({ adminWithOrg, crewOnGig }) => {
  // BUG (#ISSUE): each tick sends the whole checklist, so when the first save reaches the database
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
  await expect.poll(() => answered, { timeout: 15_000 }).toBe(2)
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
  await expect(warning).toContainText(`${person.email} is already booked for this time`, { timeout: 15_000 })
  await expect(warning).toContainText(booked.name)
  await expectAccessible(page)

  // Ask availability first
  await warning.getByRole('button', { name: 'Ask availability first' }).click()
  const ask = page.getByRole('dialog', { name: `Ask ${person.email}` })
  await ask.getByLabel('Message (optional)').fill('Load-in at 08:00. Can you make it?')
  await ask.getByRole('button', { name: 'Send question' }).click()
  await expect(page.getByText(`Asked ${person.email}.`)).toBeVisible({ timeout: 15_000 })

  // The person answers from their home
  await readNotifications(person)
  const theirs = await pageAs(browser, person, { baseURL })
  try {
    await theirs.goto('/me')
    await expect(theirs.getByRole('region', { name: /questions? for you/ })).toBeVisible({ timeout: 20_000 })
    const question = theirs.locator('#requests > div').filter({ hasText: gig.name })
    await expect(question).toContainText('asks if you’re available')
    await expect(question).toContainText('Load-in at 08:00. Can you make it?')
    await expectAccessible(theirs)
    await question.getByRole('button', { name: 'Available', exact: true }).click()
    await expect(question).toHaveCount(0, { timeout: 15_000 })
  } finally {
    await theirs.context().close()
  }

  // The PM adds them anyway: the crew row shows the clash and their answer
  await page.reload()
  await page.getByRole('button', { name: 'Invite crew' }).first().click()
  await invite.getByPlaceholder('technician@company.com').fill(person.email)
  await invite.getByRole('button', { name: 'Add to gig' }).click()
  const row = page.locator('li.crew-row').filter({ hasText: person.name })
  await expect(row.getByText('Clash', { exact: true })).toBeVisible({ timeout: 15_000 })
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
  await expect(found).toBeVisible({ timeout: 15_000 })
  await expect(found).toContainText('Rigger')
  await expectAccessible(page)
  await found.click()
  await expect(invite.getByRole('button', { name: 'Choose someone else' })).toBeVisible()
  await invite.getByRole('button', { name: 'Add to gig' }).click()
  await expect(page.locator('li.crew-row').filter({ hasText: person.name })).toBeVisible({ timeout: 15_000 })
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
    const settings = page.getByRole('dialog', { name: `${org.name} — settings` })
    await settings.getByLabel('Time zone', { exact: true }).selectOption('Europe/London')
    await expectAccessible(page)
    await settings.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Settings saved.')).toBeVisible({ timeout: 15_000 })

    await page.goto(`${gig.path}?tab=crew`)
    const row = page.locator('li.crew-row').filter({ hasText: admin.name })
    await row.getByRole('button', { name: 'Set times' }).click()
    const times = page.getByRole('dialog', { name: `Booking times · ${admin.name}` })
    await expect(times).toContainText('Times are in Europe/London time')
    await times.getByLabel('From').fill(`${day}T09:00`)
    await times.getByLabel('Until').fill(`${day}T18:00`)
    await times.getByRole('button', { name: 'Save times' }).click()
    await expect(row).toContainText('09:00', { timeout: 15_000 })
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
    await expect(row).toBeVisible({ timeout: 15_000 })
    return row
  }
  const onLisbon = await rowOn(lisbon)
  await expect(onLisbon.getByText('Clash', { exact: true })).toBeVisible({ timeout: 15_000 })
  await expect(onLisbon).toContainText(after.name)
  await expect(onLisbon).not.toContainText(before.name)
  await expectAccessible(page)

  const onAfter = await rowOn(after)
  await expect(onAfter.getByText('Clash', { exact: true })).toBeVisible({ timeout: 15_000 })
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
    await expect(step1).toContainText('1 update in the feed', { timeout: 15_000 })
    await expect(step1).toContainText('Access for 2 people on the crew')
    await expectAccessible(page)
  })
  await confirm.getByRole('button', { name: 'Delete permanently' }).click({ timeout: 15_000 })
  await expect(page.getByText(`Deleted the gig "${gig.name}".`)).toBeVisible({ timeout: 15_000 })
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
  await confirm.getByRole('button', { name: 'Delete permanently' }).click({ timeout: 15_000 })
  await expect(confirm.getByRole('alert').filter({ hasText: 'signed documents' }))
    .toContainText("This gig has signed documents (delivery notes), which are kept as proof, so it can't be deleted for good. Set its status to Cancelled instead.")
  await expectAccessible(page)

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
    await expect(one).toHaveCount(0, { timeout: 15_000 })

    await two.getByLabel('Venue').fill('Campo Pequeno')
    await two.getByRole('button', { name: 'Save changes' }).click()
    await expect(second.getByText('Someone else changed this — reload to see their changes.')).toBeVisible({ timeout: 15_000 })
    await expect(two).toBeVisible() // the form stays open, so nothing typed is lost
    await expectAccessible(second)
    await second.getByRole('button', { name: 'Reload' }).click()
    await expect(second.getByText('Coliseu').first()).toBeVisible({ timeout: 15_000 })

    // Saving twice in a row alone never shows the message
    for (const venue of ['Altice Arena', 'MEO Arena']) {
      const form = await open(first)
      await form.getByLabel('Venue').fill(venue)
      await form.getByRole('button', { name: 'Save changes' }).click()
      await expect(form).toHaveCount(0, { timeout: 15_000 })
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
  await expect(onSite.getByRole('heading', { name: 'On site today' })).toBeVisible({ timeout: 15_000 })
  await expect(onSite.getByRole('note')).toContainText('On-site mode came on because today is a gig day.')
  await expect(onSite).toContainText('Your call time · Sound')
  await expect(onSite).toContainText('08:30')
  await expect(onSite).toContainText('Line check')
  await expect(onSite.getByRole('heading', { name: 'Your task' })).toBeVisible()
  await expect(onSite).toContainText(taskTitle)
  await expectAccessible(page)

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
  await expect(page.getByRole('button', { name: 'On-site mode' })).toBeVisible({ timeout: 15_000 })
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
  await expectAccessible(page)
  const another = await gigToday(world, `E2E Not On Site ${s}`)
  await page.goto(another.gig.path)
  await expect(page.getByRole('button', { name: 'On-site mode' })).toBeVisible({ timeout: 15_000 })
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
    await expect(onSite.getByRole('heading', { name: 'No local hoje' })).toBeVisible({ timeout: 15_000 })
    await expect(onSite.getByRole('note')).toContainText('O modo no local ligou-se porque hoje é dia de evento.')
    await expect(onSite).toContainText('A sua hora de chamada')
    await expect(onSite.getByRole('heading', { name: 'A sua tarefa' })).toBeVisible()
    await expect(onSite).toContainText(taskTitle)
    await expectAccessible(page)
    await onSite.getByRole('button', { name: 'Vista completa do evento' }).click()
    await expect(page.getByRole('button', { name: 'Modo no local' })).toBeVisible()
  } finally {
    await page.context().close()
  }
})

// covers: T49 (found while automating it)
test('the On-site "Crew and phones" button opens the crew list in simple mode', { tag: '@gigs' }, async ({ crewOnGig, world }) => {
  // BUG (#ISSUE_CREW): a crew-only person is in simple mode, whose gig tabs leave out Crew, so the
  // button switches to the Crew tab and the page switches straight back to the overview: nothing happens.
  test.fail()
  const { page } = crewOnGig
  const { gig } = await gigToday(world, `E2E Crew Tile ${stamp()}`)
  await page.goto(gig.path)
  const onSite = page.locator('section[aria-labelledby="onsite-title"]')
  await onSite.getByRole('button', { name: 'Crew and phones', exact: true }).click()
  await expect(page.getByRole('tab', { name: /^Crew/, selected: true })).toBeVisible()
})

// covers: none (found while automating T49: the gigs' notifications)
test('the bell with more than 9 unread notifications passes the accessibility check', { tag: '@gigs' }, async ({ browser, baseURL, adminWithOrg }) => {
  // BUG (#ISSUE_BELL): over 9 unread, the bell shows "9+" but is named "11 unread notifications", so
  // its visible text isn't in its accessible name (axe: label-content-name-mismatch, serious).
  test.fail()
  const { account: admin, org, world } = adminWithOrg
  const person = await world.account('bell')
  const { count } = await person.client.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null)
  for (let i = count || 0; i < 10; i++) {
    const gig = await addGig(admin, org.id, { name: `E2E Bell ${i} ${stamp()}` })
    await addToGig(admin, gig.id, person)
  }
  const page = await pageAs(browser, person, { baseURL })
  try {
    await page.goto('/me')
    await expect(page.getByRole('button', { name: /unread notifications/ })).toContainText('9+', { timeout: 20_000 })
    await expectAccessible(page)
  } finally {
    await page.context().close()
  }
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
  await expectAccessible(page)
  await invite.getByRole('button', { name: 'Add to gig' }).click()
  await expect(page.locator('li.crew-row').filter({ hasText: member.account.name })).toContainText('Monitor engineer', { timeout: 15_000 })

  const theirs = member.page
  await theirs.goto('/me')
  const bell = theirs.getByRole('button', { name: '1 unread notification' })
  await expect(bell).toBeVisible({ timeout: 20_000 })
  await bell.click()
  await theirs.getByRole('dialog', { name: 'Notifications' }).getByRole('button', { name: new RegExp(`added you to ${gig.name}`) }).click()
  await expect(theirs).toHaveURL(new RegExp(gig.path))
  await expect(theirs.getByRole('heading', { name: gig.name })).toBeVisible({ timeout: 15_000 })
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
  await expect(page.getByRole('tab', { name: 'Checklist templates', selected: true })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'New template' }).first().click()
  const tplForm = page.getByRole('dialog', { name: 'New template' })
  await tplForm.getByLabel('Name').fill(tplName)
  await tplForm.getByLabel('Checklist').fill('Tyres\nLights\nFuel\nStraps')
  await tplForm.getByRole('button', { name: 'Save template' }).click()
  await expect(page.getByText(tplName)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('4 items · Tyres, Lights, Fuel…')).toBeVisible()
  await expectAccessible(page)

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
  await expect(page.getByRole('button', { name: orgTask })).toBeVisible({ timeout: 15_000 })

  // The filters: Organisation shows its own tasks, On gigs the gigs' ones
  const filters = page.getByRole('group', { name: 'Show tasks' })
  await filters.getByRole('button', { name: 'Organisation' }).click()
  await expect(page.getByRole('button', { name: orgTask })).toBeVisible()
  await expect(page.getByRole('button', { name: tplName })).toHaveCount(0)
  await filters.getByRole('button', { name: 'On gigs' }).click()
  await expect(page.getByRole('button', { name: tplName }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: orgTask })).toHaveCount(0)
  await expectAccessible(page)

  // The member gets a notification that opens My tasks, with the task in it
  const theirs = member.page
  await theirs.goto('/me')
  await theirs.getByRole('button', { name: '1 unread notification' }).click({ timeout: 20_000 })
  await theirs.getByRole('dialog', { name: 'Notifications' }).getByRole('button', { name: new RegExp(`gave you a task: ${orgTask}`) }).click()
  await expect(theirs).toHaveURL(/\/tasks$/)
  await expect(theirs.getByRole('button', { name: orgTask })).toBeVisible({ timeout: 15_000 })

  // Inventory → Maintenance: a repair makes a task once; the second time it says it already has one
  const item = await addItem(admin, org.id, { name: `E2E Moving Head ${s}` })
  const repair = await admin.client.from('repairs').insert({ org_id: org.id, item_id: item.id, quantity: 1, problem: `Fan noise ${s}` }).select('id').single()
  expect(repair.error).toBeNull()
  await page.goto(`${org.path}/inventory?tab=maintenance`)
  await page.getByRole('button', { name: new RegExp(`Fan noise ${s}`) }).click({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Make a task' }).click()
  await expect(page.getByText('Task made. Give it to someone on the Tasks page.')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Make a task' }).click()
  await expect(page.getByText('This repair already has a task.')).toBeVisible({ timeout: 15_000 })
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

// covers: T52 (all but "Invoiced moves it to the past gigs": see the next test)
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
  await expect(statuses).toHaveCount(6, { timeout: 15_000 })
  await expect(statuses.nth(0)).toHaveValue('Option')
  // Rename one, change a colour, move one up
  await statuses.nth(0).fill('Pencilled')
  await statuses.nth(0).blur()
  await expect(section.getByRole('button', { name: 'Move Pencilled down' })).toBeVisible({ timeout: 15_000 })
  const firstColour = section.getByRole('combobox', { name: 'Colour', exact: true }).first()
  await firstColour.selectOption('pink')
  await expect(firstColour).toHaveValue('pink')
  await section.getByRole('button', { name: 'Move Confirmed up' }).click()
  await expect(statuses.nth(0)).toHaveValue('Confirmed', { timeout: 15_000 })
  await expect(statuses.nth(1)).toHaveValue('Pencilled')
  // Two gig types
  for (const type of ['Festival', 'Corporate']) {
    await section.getByRole('textbox', { name: 'New gig type' }).fill(type)
    await section.getByRole('textbox', { name: 'New gig type' }).press('Enter')
    await expect(section.getByRole('button', { name: `Remove ${type}` })).toBeVisible({ timeout: 15_000 })
  }
  await expectAccessible(page)

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
    await expect(form).toHaveCount(0, { timeout: 15_000 })
  }
  await editGig(one, 'Pencilled', 'Festival')
  await editGig(two, 'Confirmed', 'Corporate')

  // The gigs list: filter by status and by type, in the list and in the calendar
  await page.goto(org.path)
  await expect(gigCard(page, one)).toBeVisible({ timeout: 15_000 })
  await page.getByRole('combobox', { name: 'Filter by status' }).selectOption({ label: 'Pencilled' })
  await expect(gigCard(page, one)).toBeVisible()
  await expect(gigCard(page, two)).toHaveCount(0)
  await page.getByRole('combobox', { name: 'Filter by status' }).selectOption({ label: 'All statuses' })
  await page.getByRole('combobox', { name: 'Filter by gig type' }).selectOption({ label: 'Corporate' })
  await expect(gigCard(page, two)).toBeVisible()
  await expect(gigCard(page, one)).toHaveCount(0)
  await page.getByRole('button', { name: 'Calendar view' }).click()
  await expect(page.getByText(two.name).first()).toBeVisible({ timeout: 15_000 })
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
  await expect(confirmedMeans).toHaveValue('archived', { timeout: 15_000 })
  // Remove a type: its gigs show none
  page.once('dialog', d => d.accept())
  await section.getByRole('button', { name: 'Remove Festival' }).click()
  await expect(section.getByRole('button', { name: 'Remove Festival' })).toHaveCount(0, { timeout: 15_000 })

  await page.goto(org.path)
  await page.getByRole('tab', { name: /^Archived/ }).click()
  await expect(gigCard(page, two)).toBeVisible({ timeout: 15_000 })
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

// covers: T52 ("Choose Invoiced: does the gig move to the past gigs?")
test('a gig marked "Invoiced" (it means done) moves to the past gigs', { tag: '@gigs' }, async ({ adminWithOrg }) => {
  // BUG? (#ISSUE_DONE, needs the owner's decision): the gigs list sorts gigs into Upcoming and Past by
  // their dates only (src/lib/gigs.js gigBucket); a done status doesn't move a gig whose dates are
  // still ahead, so it stays under Upcoming. Remove test.fail() if the list changes, or this test if
  // the dates are meant to decide.
  test.fail()
  const { page, account: admin } = adminWithOrg
  const s = stamp()
  const org = await addOrg(admin, { name: `E2E Invoiced ${s}` })
  const { error } = await admin.client.from('gig_statuses').insert({ org_id: org.id, name: 'Invoiced', colour: 'sky', base_status: 'completed', position: 1 })
  expect(error).toBeNull()
  const gig = await addGig(admin, org.id, { name: `E2E Invoiced Gig ${s}`, start_date: localDate(3), end_date: localDate(3) })
  await page.goto(gig.path)
  await page.getByRole('button', { name: 'Edit gig' }).click()
  const form = page.getByRole('dialog', { name: 'Edit gig' })
  await form.getByLabel('Status', { exact: true }).selectOption({ label: 'Invoiced' })
  await form.getByRole('button', { name: 'Save changes' }).click()
  await expect(form).toHaveCount(0, { timeout: 15_000 })
  await page.goto(org.path)
  await page.getByRole('tab', { name: /^Past/ }).click()
  await expect(gigCard(page, gig)).toBeVisible({ timeout: 15_000 })
})
