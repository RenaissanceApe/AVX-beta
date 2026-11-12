// Gigs, crew, the double-booking check and tasks (AT1): the owner's manual lines for these areas
// (docs/PENDING.md section 2), as signed-in journeys on the TEST project. docs/TESTING.md,
// "Automated test suite". Data a test only needs to exist is made through setup.js; the UI is
// clicked only for what the T-line checks.
import { createHash } from 'node:crypto'
import { test, expect } from './fixtures.js'
import { expectAccessible } from './helpers.js'
import { addGig, addItem, addOrg, addToGig, pageAs } from './setup.js'

test.use({ area: 'gigs' })

const stamp = () => Date.now().toString(36)
const localDate = (days = 0) => {
  const d = new Date(Date.now() + days * 86400e3)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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
