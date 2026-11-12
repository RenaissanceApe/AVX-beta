// Vehicles, transport and appointments (AT11): the owner's manual test lines T164 and T166–T185
// (docs/PENDING.md section 2) as signed-in journeys on the TEST project. T165 (licence warning)
// is already covered by journey.spec.js. Data is made through the set-up (setup.js); only what a
// line tests is clicked through. What stays manual is in docs/notes/AT11.md.
import { test, expect } from './fixtures.js'
import { deleteAccount, expectAccessible, reportLoaded } from './helpers.js'
import { addClient, addGig, addItem, addOrg, addToGig, addToOrg, pageAs } from './setup.js'
import { RUN } from './accounts.js'
import { bytesOf, parseIcs, readZip, zipText } from './files.js'

test.use({ area: 'vehicles' })

const TAG = '@vehicles'
// The shared test project is slow when several runs use it at once: checks that wait for data wait long
const LOAD = 45_000
const day = (offset = 0) => {
  const d = new Date(Date.now() + offset * 86400e3)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const nextDay = date => {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
// A time on a day in UTC. The organisations are on Europe/Lisbon (UTC or UTC+1), so the times used
// here stay on the same local day.
const utc = (date, time) => `${date}T${time}:00Z`
const uniq = () => `${RUN}-${Date.now().toString(36)}`
const ok = (what, { data, error }) => {
  if (error) throw new Error(`${what} failed: ${error.message}`)
  return data
}
// The person has read their notifications: the bell's name doesn't include its "9+" from ten
// unread on (issue #209), so each test starts with them read.
async function readBell(...accounts) {
  const now = new Date().toISOString()
  for (const a of accounts) ok('Reading notifications', await a.client.from('notifications').update({ read_at: now }).eq('user_id', a.id).is('read_at', null))
}
// The newest notification's line in the bell, opened from the page
async function expectBell(page, text) {
  await page.reload()
  const bell = page.getByRole('button', { name: /unread notification/ })
  await expect(bell).toBeVisible({ timeout: LOAD })
  await bell.click()
  await expect(page.getByRole('dialog', { name: 'Notifications' })).toContainText(text, { timeout: LOAD })
  await page.keyboard.press('Escape')
}

// ---- Set-up: vehicles, trips, gigs with people, made as the admin through the database API ----

async function addVehicle(admin, org, fields = {}) {
  return ok('Adding a vehicle', await admin.client.from('vehicles').insert({ org_id: org.id, name: `E2E Van ${uniq()}`, ...fields }).select().single())
}
async function addTrip(admin, gig, fields = {}) {
  return ok('Adding a trip', await admin.client.from('trips').insert({ gig_id: gig.id, direction: 'out', ...fields }).select().single())
}
// Its own gig per test, with the given people on it (accounts from the world)
async function gigWith(world, label, people = [], fields = {}) {
  const [admin, org] = await Promise.all([world.admin(), world.org()])
  const gig = await addGig(admin, org.id, { name: `E2E ${label} ${uniq()}`, ...fields })
  for (const p of people) await addToGig(admin, gig.id, p, { functionTitle: 'Driver' })
  return { admin, org, gig }
}
async function setLicence(account, categories) {
  ok('Saving the licence', await account.client.from('driving_licences').upsert({ user_id: account.id, categories }))
}
const transportTab = (page, gig) => page.goto(`${gig.path}?tab=transport`)
const vehiclesTab = (page, org) => page.goto(`${org.path}/inventory?tab=vehicles`)
const vehicleRow = (page, name) => page.getByRole('listitem').filter({ hasText: name })

// A gig with equipment for the packing list per vehicle: a case with two amps inside, four speakers
// and three cable boxes without weight or volume; two vans on two outward trips.
async function gigWithLoad(world, label, { vanA = {}, vanB = {}, gig: gigFields = {} } = {}) {
  const [admin, org] = await Promise.all([world.admin(), world.org()])
  const u = uniq()
  const { gig } = await gigWith(world, label, [], gigFields)
  const rack = await addItem(admin, org.id, { name: `Rack ${u}`, kit_type: 'case', weight_kg: 20, volume_m3: 0.3 })
  const amp = await addItem(admin, org.id, { name: `Amp ${u}`, weight_kg: 10, volume_m3: 0.05 })
  const speaker = await addItem(admin, org.id, { name: `Speaker ${u}`, weight_kg: 25, volume_m3: 0.2 })
  const cable = await addItem(admin, org.id, { name: `Cable box ${u}` })
  ok('Packing the amps in the rack', await admin.client.from('item_parts').insert({ org_id: org.id, parent_id: rack.id, child_id: amp.id, kind: 'content', quantity: 2 }))
  for (const [item, quantity] of [[rack, 1], [speaker, 4], [cable, 3]]) {
    ok('Planning equipment', await admin.client.from('gig_equipment').insert({ gig_id: gig.id, item_id: item.id, quantity }))
  }
  const a = await addVehicle(admin, org, { name: `Van A ${u}`, max_load_kg: 500, volume_m3: 4, ...vanA })
  const b = await addVehicle(admin, org, { name: `Van B ${u}`, max_load_kg: 300, volume_m3: 2, ...vanB })
  const start = gig.start_date
  const tripA = await addTrip(admin, gig, { vehicle_id: a.id, departs_at: utc(start, '07:00'), arrives_at: utc(start, '09:00') })
  const tripB = await addTrip(admin, gig, { vehicle_id: b.id, departs_at: utc(start, '07:30'), arrives_at: utc(start, '09:30') })
  return { admin, org, gig, u, rack, amp, speaker, cable, vanA: a, vanB: b, tripA, tripB }
}
// Loads set the way the page saves them (set_vehicle_loads): [{ trip, item, quantity }]
async function setLoads(admin, gig, loads) {
  ok('Loading the vehicles', await admin.client.rpc('set_vehicle_loads', {
    p_gig: gig.id, p_loads: loads.map(l => ({ trip_id: l.trip.id, item_id: l.item.id, quantity: l.quantity })),
  }))
}
const loadsPage = (page, gig) => page.goto(`/gig/${gig.id}/loads`)
const vehicleCard = (page, van) => page.getByRole('region', { name: van.name, exact: true })

// covers: T164
test('vehicles: add a van and a truck, change one, remove one; the removed one can\'t be picked for a trip', { tag: ['@smoke', TAG] }, async ({ adminWithOrg }) => {
  const { page, org, account } = adminWithOrg
  const u = uniq()
  const gig = await addGig(account, org.id, { name: `E2E Vehicles ${u}` })
  await readBell(account)
  await vehiclesTab(page, org)
  await expect(page.getByRole('button', { name: 'Add vehicle' }).first()).toBeVisible({ timeout: LOAD })

  const add = async ({ name, plate, licence, load, volume, perKm, perDay }) => {
    await page.getByRole('button', { name: 'Add vehicle' }).first().click()
    const form = page.getByRole('dialog', { name: 'Add vehicle' })
    await form.getByLabel('Name', { exact: true }).fill(name)
    await form.getByLabel('Plate', { exact: true }).fill(plate)
    await form.getByLabel('Licence needed', { exact: true }).selectOption(licence)
    await form.getByLabel('Max load (kg)', { exact: true }).fill(load)
    await form.getByLabel('Load space (m³)', { exact: true }).fill(volume)
    await form.getByLabel('Running cost per km (€)', { exact: true }).fill(perKm)
    await form.getByLabel('Running cost per day (€)', { exact: true }).fill(perDay)
    return form
  }
  const van = `Van ${u}`
  const truck = `Truck ${u}`
  let form = await add({ name: van, plate: 'aa-11-bb', licence: 'B', load: '1200', volume: '10', perKm: '0,35', perDay: '40' })
  await expectAccessible(page)
  await form.getByRole('button', { name: 'Save' }).click()
  await expect(form).toBeHidden()
  await expect(vehicleRow(page, van)).toContainText('AA-11-BB · 1,200 kg · 10 m³ · licence B · €0.35/km · €40.00/day', { timeout: LOAD })
  form = await add({ name: truck, plate: 'cc-22-dd', licence: 'C1', load: '7500', volume: '40', perKm: '0,9', perDay: '150' })
  await form.getByRole('button', { name: 'Save' }).click()
  await expect(form).toBeHidden()
  await expect(vehicleRow(page, truck)).toContainText('7,500 kg · 40 m³ · licence C1', { timeout: LOAD })
  await expectAccessible(page)

  // Change the van's load
  await page.getByRole('button', { name: `Change ${van}` }).click()
  form = page.getByRole('dialog', { name: 'Change vehicle' })
  await expect(form.getByLabel('Max load (kg)', { exact: true })).toHaveValue('1200')
  await form.getByLabel('Max load (kg)', { exact: true }).fill('1300')
  await form.getByRole('button', { name: 'Save' }).click()
  await expect(form).toBeHidden()
  await expect(vehicleRow(page, van)).toContainText('1,300 kg', { timeout: LOAD })

  // Remove the truck (marked removed, after a confirmation)
  await page.getByRole('button', { name: `Change ${truck}` }).click()
  form = page.getByRole('dialog', { name: 'Change vehicle' })
  await form.getByRole('button', { name: 'Remove vehicle' }).click()
  await expect(form.getByText("The vehicle leaves this list and can't be picked for new trips.", { exact: false })).toBeVisible()
  await expectAccessible(page)
  await form.getByRole('button', { name: 'Yes, remove it' }).click()
  await expect(form).toBeHidden()
  await expect(vehicleRow(page, truck)).toHaveCount(0, { timeout: LOAD })
  await expect(vehicleRow(page, van)).toBeVisible()

  // A new trip offers the van, not the removed truck; the database refuses the truck too
  await transportTab(page, gig)
  await page.getByRole('button', { name: 'Add trip' }).first().click()
  const trip = page.getByRole('dialog', { name: 'Add trip' })
  const choices = trip.getByLabel('Vehicle', { exact: true }).locator('option')
  await expect(choices.filter({ hasText: van })).toHaveCount(1, { timeout: LOAD })
  await expect(choices.filter({ hasText: truck })).toHaveCount(0)
  const [removed] = ok('Reading the truck', await account.client.from('vehicles').select('id, removed_at').eq('org_id', org.id).eq('name', truck))
  expect(removed.removed_at).not.toBeNull()
  const refused = await account.client.from('trips').insert({ gig_id: gig.id, vehicle_id: removed.id, departs_at: utc(gig.start_date, '08:00'), arrives_at: utc(gig.start_date, '10:00') })
  expect(refused.error?.message).toMatch(/Vehicle not available/)
})

// covers: T166
test('a trip with a driver whose licence doesn\'t cover the truck waits for "I\'ve checked"; with the way back it saves two trips', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, world, org } = adminWithOrg
  const member = await world.member()
  const { admin, gig } = await gigWith(world, 'Licence', [member])
  await setLicence(member, ['B'])
  const truck = await addVehicle(admin, org, { name: `E2E Truck ${uniq()}`, licence_category: 'C1' })
  await readBell(admin)

  await transportTab(page, gig)
  await expect(page.getByText('No trips yet')).toBeVisible({ timeout: LOAD })
  await page.getByRole('button', { name: 'Add trip' }).first().click()
  const form = page.getByRole('dialog', { name: 'Add trip' })
  await form.getByLabel('Vehicle', { exact: true }).selectOption(truck.id)
  await form.getByLabel('Driver', { exact: true }).selectOption({ label: member.name })
  await form.getByLabel('From', { exact: true }).fill('Warehouse')
  await form.getByLabel('To', { exact: true }).fill('E2E Arena')
  await expect(form.getByText(`${member.name}'s licence doesn't include C1, which this vehicle needs.`)).toBeVisible({ timeout: LOAD })
  await form.getByRole('checkbox', { name: 'Plan the way back too' }).check()
  await expect(form.getByRole('button', { name: 'Save both trips' })).toBeDisabled()
  await expectAccessible(page)
  await form.getByRole('checkbox', { name: "I've checked: they may drive this vehicle" }).check()
  await form.getByRole('button', { name: 'Save both trips' }).click()
  await expect(form).toBeHidden({ timeout: LOAD })
  await expect(page.getByText('2 trips', { exact: true })).toBeVisible({ timeout: LOAD })
  await expect(page.getByText('Licence warning checked by the planner.')).toHaveCount(2)
  await expectAccessible(page)

  const trips = ok('Reading the trips', await admin.client.from('trips').select('direction, driver_id, licence_override, from_place, to_place').eq('gig_id', gig.id).is('removed_at', null).order('departs_at'))
  expect(trips.map(t => [t.direction, t.from_place, t.to_place])).toEqual([['out', 'Warehouse', 'E2E Arena'], ['back', 'E2E Arena', 'Warehouse']])
  expect(trips.every(t => t.driver_id === member.id && t.licence_override)).toBe(true)
})

// covers: T167
test('the same van and driver on two overlapping trips: the clash shows in the form, on the trip and on the other gig\'s crew', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, world, org } = adminWithOrg
  const member = await world.member()
  // Gig A is later, but its trip is on gig B's first day; the driver is on both gigs
  const { admin, gig: gigA } = await gigWith(world, 'Clash A', [member], { start_date: day(20), end_date: day(21) })
  const { gig: gigB } = await gigWith(world, 'Clash B', [member], { start_date: day(10), end_date: day(11) })
  const van = await addVehicle(admin, org)
  await addTrip(admin, gigA, { vehicle_id: van.id, driver_id: member.id, departs_at: utc(day(10), '08:00'), arrives_at: utc(day(10), '12:00') })
  await readBell(admin)

  await transportTab(page, gigB)
  await page.getByRole('button', { name: 'Add trip' }).first().click()
  const form = page.getByRole('dialog', { name: 'Add trip' })
  await form.getByLabel('Vehicle', { exact: true }).selectOption(van.id)
  await form.getByLabel('Driver', { exact: true }).selectOption({ label: member.name })
  await form.getByLabel('Leaves', { exact: true }).fill(`${day(10)}T09:00`)
  await form.getByLabel('Arrives', { exact: true }).fill(`${day(10)}T11:00`)
  const clash = form.getByRole('status').filter({ hasText: 'Already booked at that time' })
  await expect(clash).toContainText(`${van.name}: on another trip`, { timeout: LOAD })
  await expect(clash).toContainText(`${member.name}: on another trip`)
  await expect(clash).toContainText(gigA.name)
  await expectAccessible(page)
  // A clash is a warning: the trip saves, and its row shows the clash
  await form.getByRole('button', { name: 'Save trip' }).click()
  await expect(form).toBeHidden({ timeout: LOAD })
  const row = page.getByRole('listitem').filter({ hasText: van.name })
  await expect(row).toContainText(`${van.name}: on another trip`, { timeout: LOAD })
  await expect(row).toContainText(gigA.name)
  await expectAccessible(page)

  // Gig B's Crew tab: the driver is booked (by the trip on gig A) during gig B
  await page.goto(`${gigB.path}?tab=crew`)
  await expect(page.getByRole('status').filter({ hasText: `${member.name} is already booked for this time.` }).first()).toBeVisible({ timeout: LOAD })
  await expectAccessible(page)
})

// covers: T168
test('the driver logs the trip\'s day: driving minutes are filled in; once approved the gig\'s hours show Driving', { tag: TAG }, async ({ adminWithOrg, browser, baseURL }) => {
  const { page, world, org } = adminWithOrg
  const member = await world.member()
  const { admin, gig } = await gigWith(world, 'Driving', [member])
  const van = await addVehicle(admin, org)
  await addTrip(admin, gig, { vehicle_id: van.id, driver_id: member.id, departs_at: utc(gig.start_date, '08:00'), arrives_at: utc(gig.start_date, '10:00') })
  await readBell(admin, member)
  const driver = await pageAs(browser, member, { baseURL })
  try {
    await driver.goto(`${gig.path}?tab=crew`)
    const mine = driver.getByRole('region', { name: 'My hours' })
    await expect(mine).toBeVisible({ timeout: LOAD })
    await mine.getByRole('button', { name: 'Log hours' }).click()
    const form = driver.getByRole('dialog', { name: 'Log hours' })
    await expect(form.getByLabel('Day', { exact: true })).toHaveValue(gig.start_date)
    await expect(form.getByRole('spinbutton', { name: 'Driving (minutes)' })).toHaveValue('120', { timeout: LOAD })
    await form.getByLabel('Start', { exact: true }).fill('07:30')
    await form.getByLabel('End', { exact: true }).fill('18:00')
    await expectAccessible(driver)
    await form.getByRole('button', { name: 'Send hours' }).click()
    await expect(form).toBeHidden({ timeout: LOAD })
    await expect(mine).toContainText('120 min driving', { timeout: LOAD })

    // The admin approves; the gig's hours total shows the driving
    await page.goto(`${gig.path}?tab=crew`)
    const hours = page.getByRole('region', { name: /^Hours\b/ })
    await expect(hours).toContainText(member.name, { timeout: LOAD })
    await hours.getByRole('button', { name: 'Approve' }).click()
    await expect(hours).toContainText('Approved', { timeout: LOAD })
    await expect(hours).toContainText(/Driving \d/)
    await expectAccessible(page)
  } finally {
    await driver.context().close()
  }
})

// covers: T169
test('trips follow the gig\'s status: provisional while it\'s a draft, and the vehicle is free once it\'s archived', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, world, org } = adminWithOrg
  const { admin, gig } = await gigWith(world, 'Status', [], { start_date: day(12), end_date: day(13), status: 'confirmed' })
  const van = await addVehicle(admin, org)
  await addTrip(admin, gig, { vehicle_id: van.id, departs_at: utc(day(12), '08:00'), arrives_at: utc(day(12), '10:00') })
  const status = async value => ok('Changing the gig\'s status', await admin.client.from('gigs').update({ status: value }).eq('id', gig.id))
  const row = vehicleRow(page, van.name)

  await vehiclesTab(page, org)
  await expect(row).toContainText(gig.name, { timeout: LOAD })
  await expect(row).not.toContainText('(provisional)')
  await status('draft')
  await page.reload()
  await expect(row).toContainText('(provisional)', { timeout: LOAD })
  await expect(row).toContainText(gig.name)
  await expectAccessible(page)
  await status(gig.status)
  await page.reload()
  await expect(row).toContainText(gig.name, { timeout: LOAD })
  await expect(row).not.toContainText('(provisional)')
  await status('archived')
  await page.reload()
  await expect(row).toContainText('No trips planned', { timeout: LOAD })
  await expect(row).not.toContainText(gig.name)
})

// covers: T170
test('an appointment for a member who is on a gig that day: the form warns, they\'re told and see it in My work and the calendar', { tag: TAG }, async ({ adminWithOrg, browser, baseURL }) => {
  const { page, world, org } = adminWithOrg
  const member = await world.member()
  const tomorrow = day(1)
  const { admin, gig } = await gigWith(world, 'Site visit day', [member], { start_date: tomorrow, end_date: tomorrow })
  await readBell(admin, member)
  const title = `Site visit ${uniq()}`

  await page.goto(`${org.path}/appointments`)
  await expect(page.getByRole('heading', { name: 'Appointments', exact: true })).toBeVisible({ timeout: LOAD })
  await page.getByRole('button', { name: 'New appointment' }).first().click()
  const form = page.getByRole('dialog', { name: 'New appointment' })
  await form.locator('#appt-kind').selectOption('site_visit')
  await form.getByLabel('Title', { exact: true }).fill(title)
  await form.getByLabel('Day', { exact: true }).fill(tomorrow)
  await form.getByLabel('From', { exact: true }).fill('10:00')
  await form.getByLabel('Until', { exact: true }).fill('11:00')
  await form.getByLabel(member.name).check()
  const warning = form.getByRole('status').filter({ hasText: 'Already booked at this time:' })
  await expect(warning).toContainText(member.name, { timeout: LOAD })
  await expect(warning).toContainText(gig.name)
  await expectAccessible(page)
  await form.getByRole('button', { name: 'Add appointment' }).click()
  await expect(form).toBeHidden({ timeout: LOAD })
  await expect(page.getByRole('button', { name: new RegExp(title) })).toBeVisible({ timeout: LOAD })

  const theirs = await pageAs(browser, member, { baseURL })
  try {
    await theirs.goto('/me/appointments')
    await expect(theirs.getByRole('button', { name: new RegExp(title) })).toBeVisible({ timeout: LOAD })
    await expectBell(theirs, `invited you to ${title}`)
    await expectAccessible(theirs)
    // The organisation's calendar (tomorrow may be next month)
    await theirs.goto(`${org.path}?view=calendar`)
    await expect(theirs.getByRole('grid')).toBeVisible({ timeout: LOAD })
    if (tomorrow.slice(0, 7) !== day(0).slice(0, 7)) await theirs.getByRole('button', { name: 'Next month' }).click()
    await expect(theirs.getByTitle(`${title} · Site visit`).first()).toBeAttached({ timeout: LOAD })
  } finally {
    await theirs.context().close()
  }
})

// covers: T171
test('moving an appointment tells the person; cancelling it tells them and clears the ⚠ on the gig\'s crew', { tag: TAG }, async ({ adminWithOrg, browser, baseURL }) => {
  const { page, world, org } = adminWithOrg
  const member = await world.member()
  const when = day(2)
  const { admin, gig } = await gigWith(world, 'Meeting day', [member], { start_date: when, end_date: when })
  const title = `Meeting ${uniq()}`
  const appt = ok('Adding the appointment', await admin.client.from('appointments').insert({
    org_id: org.id, kind: 'meeting', title, starts_at: utc(when, '10:00'), ends_at: utc(when, '11:00'),
  }).select().single())
  ok('Inviting the member', await admin.client.from('appointment_people').insert({ appointment_id: appt.id, user_id: member.id }))
  await readBell(admin, member)
  const booked = page.getByRole('status').filter({ hasText: `${member.name} is already booked for this time.` })

  // The gig's crew shows the member booked by the appointment
  await page.goto(`${gig.path}?tab=crew`)
  await expect(booked.first()).toBeVisible({ timeout: LOAD })
  await expect(booked.first()).toContainText(title)

  const theirs = await pageAs(browser, member, { baseURL })
  try {
    await theirs.goto('/me/appointments')
    await expect(theirs.getByRole('button', { name: new RegExp(title) })).toBeVisible({ timeout: LOAD })

    // Move it to 15:00
    await page.goto(`${org.path}/appointments`)
    await page.getByRole('button', { name: new RegExp(title) }).click()
    const form = page.getByRole('dialog', { name: 'Appointment' })
    await form.getByLabel('From', { exact: true }).fill('15:00')
    await form.getByLabel('Until', { exact: true }).fill('16:00')
    await form.getByRole('button', { name: 'Save' }).click()
    await expect(form).toBeHidden({ timeout: LOAD })
    await expect(page.getByRole('button', { name: new RegExp(title) })).toContainText('15:00', { timeout: LOAD })
    await expectBell(theirs, `moved ${title} to`)
    await readBell(member)

    // Cancel it
    await page.getByRole('button', { name: new RegExp(title) }).click()
    await form.getByRole('button', { name: 'Cancel appointment' }).click()
    await expectAccessible(page)
    await form.getByRole('button', { name: 'Yes, cancel it' }).click()
    await expect(form).toBeHidden({ timeout: LOAD })
    await expect(page.getByRole('button', { name: new RegExp(title) })).toHaveCount(0, { timeout: LOAD })
    await expectBell(theirs, `cancelled ${title}`)

    // The ⚠ on the gig's crew is gone
    await page.goto(`${gig.path}?tab=crew`)
    await expect(page.getByRole('region', { name: /^Crew\b/ }).or(page.getByText(member.name)).first()).toBeVisible({ timeout: LOAD })
    await expect(booked.filter({ hasText: title })).toHaveCount(0, { timeout: LOAD })
  } finally {
    await theirs.context().close()
  }
})

// covers: T172
test('an appointment linked to a gig and a client shows on the gig\'s Overview and in the client\'s card', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, world, org } = adminWithOrg
  const { admin, gig } = await gigWith(world, 'Linked')
  const client = await addClient(admin, org.id, { name: `E2E Client ${uniq()}` })
  const title = `Production meeting ${uniq()}`

  await page.goto(`${org.path}/appointments`)
  await page.getByRole('button', { name: 'New appointment' }).first().click()
  const form = page.getByRole('dialog', { name: 'New appointment' })
  await form.locator('#appt-kind').selectOption('meeting')
  await form.getByLabel('Title', { exact: true }).fill(title)
  await form.getByLabel('Day', { exact: true }).fill(day(3))
  await form.getByLabel('From', { exact: true }).fill('14:00')
  await form.getByLabel('Until', { exact: true }).fill('15:00')
  await expect(form.getByLabel('Gig (optional)').locator(`option[value="${gig.id}"]`)).toBeAttached({ timeout: LOAD })
  await form.getByLabel('Gig (optional)').selectOption(gig.id)
  await expect(form.getByLabel('Client (optional)').locator(`option[value="${client.id}"]`)).toBeAttached({ timeout: LOAD })
  await form.getByLabel('Client (optional)').selectOption(client.id)
  await form.getByRole('button', { name: 'Add appointment' }).click()
  await expect(form).toBeHidden({ timeout: LOAD })

  // The gig's Overview
  await page.goto(gig.path)
  const onGig = page.getByRole('region', { name: 'Appointments' })
  await expect(onGig.getByRole('button', { name: new RegExp(title) })).toBeVisible({ timeout: LOAD })
  await expectAccessible(page)

  // The client's card in Contacts
  await page.goto(`${org.path}/contacts`)
  await page.getByRole('button', { name: new RegExp(client.name) }).first().click()
  const card = page.getByRole('dialog')
  await expect(card.getByRole('button', { name: new RegExp(title) })).toBeVisible({ timeout: LOAD })
  await expectAccessible(page)
})

// covers: T173
test('the calendar feed has the appointments you\'re invited to and the trips you drive', { tag: TAG }, async ({ member, world }) => {
  const { page, org, account } = member
  const { admin, gig } = await gigWith(world, 'Feed', [account])
  const van = await addVehicle(admin, org)
  await addTrip(admin, gig, { vehicle_id: van.id, driver_id: account.id, departs_at: utc(gig.start_date, '08:00'), arrives_at: utc(gig.start_date, '10:00') })
  const title = `Feed visit ${uniq()}`
  const appt = ok('Adding the appointment', await admin.client.from('appointments').insert({
    org_id: org.id, kind: 'site_visit', title, starts_at: utc(day(4), '10:00'), ends_at: utc(day(4), '11:00'),
  }).select().single())
  ok('Inviting the member', await admin.client.from('appointment_people').insert({ appointment_id: appt.id, user_id: account.id }))

  await page.goto('/settings/calendar')
  await page.getByRole('button', { name: 'Get my calendar link' }).click()
  const link = page.getByRole('textbox', { name: "Your gigs in your phone's calendar" })
  await expect(link).toHaveValue(/\/functions\/v1\/calendar-feed\?t=/, { timeout: LOAD })
  await expectAccessible(page)
  const response = await page.request.get(await link.inputValue(), { timeout: LOAD })
  expect(response.status(), 'The calendar-feed Edge Function on the test project answered with an error').toBe(200)
  const events = parseIcs(await response.text())
  const visit = events.find(e => e.SUMMARY?.includes(title))
  expect(visit, `No event for ${title} in the feed`).toBeTruthy()
  expect(visit.SUMMARY).toContain(org.name)
  // The feed is in the person's own language (their profile; Portuguese unless they chose English)
  const drive = events.find(e => /^(Driving|A conduzir) · /.test(e.SUMMARY || '') && e.SUMMARY.includes(gig.name))
  expect(drive, `No "Driving · ${gig.name}" event in the feed`).toBeTruthy()
  expect(drive.SUMMARY).toContain(van.name)
  expect(drive.DTSTART).toBe(`${gig.start_date.replace(/-/g, '')}T080000Z`)
})

// covers: T174
test('an all-day appointment stays on the same days when the organisation\'s time zone changes', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, account } = adminWithOrg
  // Its own organisation, so the other tests keep Lisbon
  const org = await addOrg(account, { name: `E2E Vehicles TZ ${uniq()}` })
  const first = day(30)
  const last = nextDay(first)
  const title = `Warehouse days ${uniq()}`
  const appt = ok('Adding the appointment', await account.client.from('appointments').insert({
    org_id: org.id, kind: 'warehouse', title, all_day: true, start_date: first, end_date: last,
  }).select().single())

  await page.goto(`${org.path}/appointments`)
  const row = page.getByRole('button', { name: new RegExp(title) })
  await expect(row).toBeVisible({ timeout: LOAD })
  const before = (await row.innerText()).replace(/\s+/g, ' ')

  await page.goto(`${org.path}?panel=settings`)
  const settings = page.getByRole('dialog', { name: `${org.name} — settings` })
  await settings.locator('#org-time-zone').selectOption('Pacific/Auckland')
  await settings.getByRole('button', { name: 'Save changes' }).click()
  await expect.poll(async () => ok('Reading the organisation', await account.client.from('organisations').select('time_zone').eq('id', org.id).single()).time_zone,
    { timeout: LOAD }).toBe('Pacific/Auckland')

  await page.goto(`${org.path}/appointments`)
  await expect(row).toBeVisible({ timeout: LOAD })
  expect((await row.innerText()).replace(/\s+/g, ' ')).toBe(before)
  await expectAccessible(page)
  const saved = ok('Reading the appointment', await account.client.from('appointments').select('start_date, end_date, all_day').eq('id', appt.id).single())
  expect(saved).toEqual({ start_date: first, end_date: last, all_day: true })
})

// covers: T175, T176
test('packing list per vehicle: suggest a split keeps cases whole, counts items without weight, and applies', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, world } = adminWithOrg
  const { gig, rack, speaker, cable, vanA, vanB } = await gigWithLoad(world, 'Loads')

  // Transport links to the packing list per vehicle
  await page.goto(`${gig.path}?tab=transport`)
  await page.getByRole('link', { name: 'Packing list per vehicle' }).click()
  await expect(page).toHaveURL(new RegExp(`/gig/${gig.id}/loads$`))
  await expect(page.getByRole('heading', { name: 'Packing list per vehicle' })).toBeVisible({ timeout: LOAD })
  await expect(vehicleCard(page, vanA)).toBeVisible({ timeout: LOAD })
  await expect(vehicleCard(page, vanB)).toBeVisible()
  const left = page.getByRole('region', { name: 'Not in a vehicle yet' })
  for (const item of [rack, speaker, cable]) await expect(left).toContainText(item.name)
  await expect(page.getByRole('note')).toContainText("3 items have no weight or no volume. They're counted as unknown, never as zero.")
  await expectAccessible(page)

  // Suggest a split
  await page.getByRole('button', { name: 'Suggest a split' }).click()
  const suggestion = page.getByRole('dialog', { name: 'Suggested split' })
  await expect(suggestion).toContainText('3 items have no weight or no volume, so the split can\'t account for them fully.')
  // The rack stays whole: once, in one vehicle
  const rackIn = await Promise.all([vanA, vanB].map(v => suggestion.getByRole('region', { name: v.name }).innerText()))
  expect(rackIn.filter(text => text.includes(`1 × ${rack.name}`))).toHaveLength(1)
  await expectAccessible(page)
  await suggestion.getByRole('button', { name: 'Apply this split' }).click()
  await expect(suggestion).toBeHidden({ timeout: LOAD })
  await expect(page.getByText('Split applied. Move things between vehicles if you need to.')).toBeVisible({ timeout: LOAD })
  await expect(left).toContainText('Everything on the list is in a vehicle.')

  // The totals: the rack counts with its contents (20 + 2 × 10 kg), the speakers 4 × 25 kg: 140 kg in all;
  // the cable boxes show as "+ n without weight", 3 in all
  const cards = [vehicleCard(page, vanA), vehicleCard(page, vanB)]
  const texts = await Promise.all(cards.map(c => c.innerText()))
  const kgOf = text => Number((text.match(/Weight\s*([\d,.]+) \/ [\d,.]+ kg/) || [])[1]?.replace(/,/g, '') || 0)
  expect(texts.filter(text => text.includes(rack.name))).toHaveLength(1)
  const without = texts.map(text => Number((text.match(/\+ (\d+) without weight/) || [])[1] || 0))
  expect(without.reduce((a, b) => a + b, 0)).toBe(3)
  const lines = texts.flatMap(text => [...text.matchAll(/(\d+) × /g)])
  expect(lines.length).toBeGreaterThan(0)
  expect(kgOf(texts[0]) + kgOf(texts[1])).toBe(140)
  await expectAccessible(page)
})

// covers: T177
test('move lines between vehicles and off them; a vehicle past its maximum load shows "Over capacity"', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, world } = adminWithOrg
  const { admin, gig, rack, speaker, cable, vanA, vanB, tripA } = await gigWithLoad(world, 'Moves', { vanB: { max_load_kg: 60 } })
  await setLoads(admin, gig, [{ trip: tripA, item: rack, quantity: 1 }, { trip: tripA, item: speaker, quantity: 4 }, { trip: tripA, item: cable, quantity: 3 }])

  await loadsPage(page, gig)
  const a = vehicleCard(page, vanA)
  const b = vehicleCard(page, vanB)
  await expect(a).toContainText(speaker.name, { timeout: LOAD })
  await expect(b).toContainText('Nothing in this vehicle yet.')

  // 2 of the 4 speakers to van B (50 kg of its 60)
  await a.getByLabel(`How many ${speaker.name} to move`).fill('2')
  await a.getByLabel(`Move ${speaker.name} to`).selectOption({ label: vanB.name })
  await a.getByRole('listitem').filter({ hasText: speaker.name }).getByRole('button', { name: 'Move' }).click()
  await expect(b).toContainText(speaker.name, { timeout: LOAD })
  await expect(b).toContainText(`2 × ${speaker.name}`)
  await expect(a).toContainText(`2 × ${speaker.name}`)
  await expect(b).not.toContainText('Over capacity')

  // The cable boxes off the vehicles
  await a.getByLabel(`Move ${cable.name} to`).selectOption({ label: 'Not in a vehicle' })
  await a.getByRole('listitem').filter({ hasText: cable.name }).getByRole('button', { name: 'Move' }).click()
  const left = page.getByRole('region', { name: 'Not in a vehicle yet' })
  await expect(left).toContainText(cable.name, { timeout: LOAD })
  await expect(a).not.toContainText(cable.name)

  // The rack (40 kg with its amps) into van B: 90 kg of 60
  await a.getByLabel(`Move ${rack.name} to`).selectOption({ label: vanB.name })
  await a.getByRole('listitem').filter({ hasText: rack.name }).getByRole('button', { name: 'Move' }).click()
  await expect(b).toContainText('Over capacity', { timeout: LOAD })
  await expect(b).toContainText('Over the maximum load by 30 kg.')
  await expect(a).not.toContainText('Over capacity')
  await expectAccessible(page)

  // Saved: what the database holds is what the page shows
  const loads = ok('Reading the loads', await admin.client.from('vehicle_loads').select('trip_id, item_id, quantity').eq('gig_id', gig.id).gt('quantity', 0))
  const held = Object.fromEntries(loads.map(l => [`${l.trip_id === tripA.id ? 'A' : 'B'}:${l.item_id}`, l.quantity]))
  expect(held).toEqual({ [`A:${speaker.id}`]: 2, [`B:${speaker.id}`]: 2, [`B:${rack.id}`]: 1 })
})

// covers: T178, T179
test('crew see the packing list per vehicle read-only; Scan out shows one vehicle\'s items', { tag: TAG }, async ({ adminWithOrg, browser, baseURL }) => {
  const { page, world } = adminWithOrg
  const crew = await world.account('crew')
  const { admin, gig, rack, speaker, cable, vanA, vanB, tripA, tripB } = await gigWithLoad(world, 'Crew loads')
  await addToGig(admin, gig.id, crew)
  await setLoads(admin, gig, [{ trip: tripA, item: rack, quantity: 1 }, { trip: tripA, item: speaker, quantity: 3 },
    { trip: tripB, item: speaker, quantity: 1 }, { trip: tripB, item: cable, quantity: 3 }])
  await readBell(crew)

  // Crew: the page opens, without "Move to…" or "Suggest a split"
  const theirs = await pageAs(browser, crew, { baseURL })
  try {
    await loadsPage(theirs, gig)
    await expect(vehicleCard(theirs, vanA)).toContainText(rack.name, { timeout: LOAD })
    await expect(vehicleCard(theirs, vanB)).toContainText(cable.name)
    await expect(theirs.getByRole('button', { name: 'Suggest a split' })).toHaveCount(0)
    await expect(theirs.getByRole('button', { name: 'Move', exact: true })).toHaveCount(0)
    await expect(theirs.getByRole('combobox')).toHaveCount(0)
    await expectAccessible(theirs)
  } finally {
    await theirs.context().close()
  }

  // Admin: Scan out, pick van B: only its items, with "n in this vehicle"
  await loadsPage(page, gig)
  await page.getByRole('button', { name: 'Scan out' }).first().click()
  await expect(page).toHaveURL(new RegExp(`/gig/${gig.id}/scan`))
  const pick = page.getByLabel('Vehicle', { exact: true })
  await expect(pick).toBeVisible({ timeout: LOAD })
  await pick.selectOption({ label: vanB.name })
  await expect(page.getByText("Showing only what's planned for this vehicle. The counts are for the whole gig.")).toBeVisible()
  await expect(page.getByText(cable.name).first()).toBeVisible({ timeout: LOAD })
  await expect(page.getByText('3 in this vehicle')).toBeVisible()
  await expect(page.getByText('1 in this vehicle')).toBeVisible()
  await expect(page.getByText(rack.name)).toHaveCount(0)
  await expectAccessible(page)
  // All vehicles again: the rack is back in the list
  await pick.selectOption({ label: 'All vehicles' })
  await expect(page.getByText(rack.name).first()).toBeVisible()
})

// covers: T180
test('item volume: one entered by hand, one worked out from its dimensions on the packing list', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, world, org } = adminWithOrg
  const { admin, gig } = await gigWith(world, 'Volume')
  const u = uniq()
  const box = await addItem(admin, org.id, { name: `Flight case ${u}`, weight_kg: 12 })
  const sub = await addItem(admin, org.id, { name: `Sub ${u}`, weight_kg: 40, dimensions: '60 x 40 x 50 cm' })
  const van = await addVehicle(admin, org, { max_load_kg: 800, volume_m3: 6 })
  for (const item of [box, sub]) ok('Planning equipment', await admin.client.from('gig_equipment').insert({ gig_id: gig.id, item_id: item.id, quantity: 1 }))
  await addTrip(admin, gig, { vehicle_id: van.id, departs_at: utc(gig.start_date, '07:00'), arrives_at: utc(gig.start_date, '09:00') })

  // Edit the flight case: Volume (m³)
  await page.goto(`${org.path}/inventory/${box.id}`)
  await expect(page.getByRole('heading', { name: box.name })).toBeVisible({ timeout: LOAD })
  await page.getByRole('button', { name: 'Edit' }).first().click()
  const form = page.getByRole('dialog')
  await form.getByRole('textbox', { name: 'Volume (m³)' }).fill('0,25')
  await expectAccessible(page)
  await form.getByRole('button', { name: 'Save' }).click()
  await expect(form).toBeHidden({ timeout: LOAD })
  await expect(page.getByText('0.25 m³')).toBeVisible({ timeout: LOAD })
  expect(Number(ok('Reading the item', await admin.client.from('price_items').select('volume_m3').eq('id', box.id).single()).volume_m3)).toBe(0.25)

  // The packing list: 0.25 m³ for the case, 0.12 m³ from the sub's dimensions
  await loadsPage(page, gig)
  const left = page.getByRole('region', { name: 'Not in a vehicle yet' })
  await expect(left.getByRole('listitem').filter({ hasText: sub.name })).toContainText('0.12 m³', { timeout: LOAD })
  await expect(left.getByRole('listitem').filter({ hasText: box.name })).toContainText('0.25 m³')
})

// The van and the trips of the transport-cost lines: €0.35/km and €40/day; out 120 km in the morning,
// back 120 km the same evening
async function gigWithCosts(world, label, { perKm = 0.35, perDay = 40, ...fields } = {}) {
  const [admin, org] = await Promise.all([world.admin(), world.org()])
  const { gig } = await gigWith(world, label, [], { status: 'confirmed', ...fields })
  const van = await addVehicle(admin, org, { cost_per_km: perKm, cost_per_day: perDay })
  const d = gig.start_date
  const out = await addTrip(admin, gig, { vehicle_id: van.id, km: 120, departs_at: utc(d, '08:00'), arrives_at: utc(d, '10:00') })
  const back = await addTrip(admin, gig, { vehicle_id: van.id, direction: 'back', km: 120, departs_at: utc(d, '18:00'), arrives_at: utc(d, '20:00') })
  return { admin, org, gig, van, out, back }
}

// covers: T181
test('transport cost: km and days used at the van\'s rates; hidden from viewers and crew', { tag: TAG }, async ({ adminWithOrg, viewer, browser, baseURL }) => {
  const { page, world, org } = adminWithOrg
  const crew = await world.account('crew')
  // The van's rates are set through Inventory → Vehicles
  const { admin, gig, van, back } = await gigWithCosts(world, 'Cost', { perKm: null, perDay: null })
  await addToGig(admin, gig.id, crew)
  await vehiclesTab(page, org)
  await page.getByRole('button', { name: `Change ${van.name}` }).click()
  const form = page.getByRole('dialog', { name: 'Change vehicle' })
  await form.getByLabel('Running cost per km (€)', { exact: true }).fill('0,35')
  await form.getByLabel('Running cost per day (€)', { exact: true }).fill('40')
  await form.getByRole('button', { name: 'Save' }).click()
  await expect(form).toBeHidden({ timeout: LOAD })
  await expect(vehicleRow(page, van.name)).toContainText('€0.35/km · €40.00/day', { timeout: LOAD })

  await transportTab(page, gig)
  const cost = page.getByRole('region', { name: 'Transport cost' })
  await expect(cost).toContainText('2 trips · 240 km · 1 day used · €0.35/km, €40.00/day', { timeout: LOAD })
  await expect(cost).toContainText('€124.00')
  await expectAccessible(page)

  // A viewer and the crew don't see it
  await viewer.page.goto(`${gig.path}?tab=transport`)
  await expect(viewer.page.getByText('2 trips', { exact: true })).toBeVisible({ timeout: LOAD })
  await expect(viewer.page.getByRole('region', { name: 'Transport cost' })).toHaveCount(0)
  await expect(viewer.page.getByText('€124.00')).toHaveCount(0)
  const theirs = await pageAs(browser, crew, { baseURL })
  try {
    await transportTab(theirs, gig)
    await expect(theirs.getByText('2 trips', { exact: true })).toBeVisible({ timeout: LOAD })
    await expect(theirs.getByRole('region', { name: 'Transport cost' })).toHaveCount(0)
    await expect(theirs.getByText('€124.00')).toHaveCount(0)
  } finally {
    await theirs.context().close()
  }

  // The way back arrives after midnight: 2 days used
  await page.getByRole('listitem').filter({ hasText: 'Back' }).getByRole('button', { name: 'Change trip' }).click()
  const trip = page.getByRole('dialog', { name: 'Change trip' })
  await trip.getByLabel('Leaves', { exact: true }).fill(`${gig.start_date}T22:00`)
  await trip.getByLabel('Arrives', { exact: true }).fill(`${nextDay(gig.start_date)}T01:30`)
  await trip.getByRole('button', { name: 'Save' }).click()
  await expect(trip).toBeHidden({ timeout: LOAD })
  await expect(cost).toContainText('2 days used', { timeout: LOAD })
  await expect(cost).toContainText('€164.00')

  // One trip without km
  ok('Clearing the km', await admin.client.from('trips').update({ km: null }).eq('id', back.id))
  await page.reload()
  await expect(cost).toContainText('1 trip has no km yet: only its days count.', { timeout: LOAD })
  await expect(cost).toContainText('€122.00')
})

// covers: T182
test('gig finance has a Transport line in its costs and margin; the gig margins CSV has a Transport column', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, world, org } = adminWithOrg
  // Two days ago: reports count a gig once it has started
  const { gig } = await gigWithCosts(world, 'Finance', { start_date: day(-2), end_date: day(-1) })

  await page.goto(gig.path)
  const finance = page.getByRole('region', { name: 'Gig finance' })
  await expect(finance).toContainText('Transport', { timeout: LOAD })
  await expect(finance).toContainText("240 km on 2 trips, at each vehicle's running cost")
  const amounts = await finance.locator('dd').allInnerTexts()
  const labels = await finance.locator('dt').allInnerTexts()
  const value = name => amounts[labels.findIndex(l => l.startsWith(name))]
  expect(value('Transport')).toBe('€124.00')
  expect(value('Total cost')).toBe('€124.00')
  expect(value('Margin')).toMatch(/^[-−]€124\.00/)
  await expectAccessible(page)

  // Reports → Gig margins, over the gig's days: the CSV has the Transport column
  await page.goto(`${org.path}/reports?tab=margins&period=custom&from=${gig.start_date}&until=${gig.end_date}`)
  await page.getByRole('checkbox', { name: 'Show details' }).check()
  await expect(page.getByRole('row').filter({ hasText: gig.name })).toContainText('€124.00', { timeout: LOAD })
  await expectAccessible(page)
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: LOAD }), page.getByRole('button', { name: 'Download CSV' }).click()])
  const text = new TextDecoder().decode(await bytesOf(download))
  const [head, ...rows] = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean)
  const cols = head.split(/[;,]/).map(c => c.replace(/"/g, '').trim())
  expect(cols).toContain('Transport')
  const row = rows.find(r => r.includes(gig.name))
  expect(row, 'The gig is in the CSV').toBeTruthy()
  expect(row.split(/[;,](?=(?:[^"]*"[^"]*")*[^"]*$)/)[cols.indexOf('Transport')].replace(/"/g, '')).toMatch(/^124([.,]00?)?$/)
})

// covers: T183
test('a vehicle expense linked to a trip gets the gig, counts in its other costs and in Vehicle use', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, world, org } = adminWithOrg
  const { admin, gig, van, out } = await gigWithCosts(world, 'Diesel', { start_date: day(-2), end_date: day(-1) })
  const what = `Diesel ${uniq()}`

  await page.goto(`${org.path}/expenses`)
  await expect(page.getByRole('heading', { name: 'Expenses' }).first()).toBeVisible({ timeout: LOAD })
  await page.getByRole('button', { name: 'Add expense' }).first().click()
  const form = page.getByRole('dialog', { name: 'Add expense' })
  await form.getByLabel('What for').fill(what)
  await form.getByLabel('Amount excl. VAT').fill('80')
  await form.getByLabel('Vehicle', { exact: true }).selectOption(van.id)
  const tripPick = form.getByLabel('Trip (optional)')
  await expect(tripPick.locator(`option[value="${out.id}"]`)).toBeAttached({ timeout: LOAD })
  await tripPick.selectOption(out.id)
  await expectAccessible(page)
  await form.getByRole('button', { name: 'Save' }).click()
  await expect(form).toBeHidden({ timeout: LOAD })
  await expect(page.getByText(what)).toBeVisible({ timeout: LOAD })

  const [expense] = ok('Reading the expense', await admin.client.from('expenses').select('gig_id, vehicle_id, trip_id, status').eq('org_id', org.id).eq('description', what))
  expect(expense).toMatchObject({ gig_id: gig.id, vehicle_id: van.id, trip_id: out.id })

  // The gig's other costs
  await page.goto(gig.path)
  const finance = page.getByRole('region', { name: 'Gig finance' })
  await expect(finance).toContainText('Other costs', { timeout: LOAD })
  const labels = await finance.locator('dt').allInnerTexts()
  const amounts = await finance.locator('dd').allInnerTexts()
  expect(amounts[labels.findIndex(l => l.startsWith('Other costs'))]).toBe('€80.00')

  // Reports → Vehicle use: the van's expenses
  await page.goto(`${org.path}/reports?tab=vehicles&period=custom&from=${gig.start_date}&until=${day(0)}`)
  await expect(page.getByText('Vehicle cost')).toBeVisible({ timeout: LOAD })
  await page.getByRole('checkbox', { name: 'Show details' }).check()
  const row = page.getByRole('row').filter({ hasText: van.name })
  await expect(row).toContainText('€80.00', { timeout: LOAD })
  await expectAccessible(page)
})

// covers: T184
for (const lang of ['en', 'pt']) {
  test(`vehicle use report at phone width (${lang}): tiles, chart, details, CSV and the load's share`, { tag: TAG }, async ({ world, browser, baseURL }) => {
    const [admin, org] = await Promise.all([world.admin(), world.org()])
    // Today and tomorrow, so the period has started (a period that hasn't started fails: bug #222, below)
    const { gig, rack, speaker, vanA, tripA } = await gigWithLoad(world, `Use ${lang}`, {
      vanA: { cost_per_km: 0.5, cost_per_day: 30 }, gig: { start_date: day(0), end_date: day(1), status: 'confirmed' },
    })
    ok('Adding km', await admin.client.from('trips').update({ km: 50 }).eq('id', tripA.id))
    // 40 kg rack + 4 × 25 kg speakers = 140 kg of 500: 28%
    await setLoads(admin, gig, [{ trip: tripA, item: rack, quantity: 1 }, { trip: tripA, item: speaker, quantity: 4 }])
    await readBell(admin)
    const page = await pageAs(browser, admin, { baseURL, lang, viewport: { width: 390, height: 844 } })
    const words = lang === 'pt'
      ? { cost: 'Custo dos veículos', details: 'Mostrar detalhes', csv: 'Descarregar CSV', share: '28% da capacidade' }
      : { cost: 'Vehicle cost', details: 'Show details', csv: 'Download CSV', share: '28% of capacity' }
    try {
      await page.goto(`${org.path}/reports?tab=vehicles&period=custom&from=${gig.start_date}&until=${gig.end_date}`)
      await expect(page.getByText(words.cost, { exact: true })).toBeVisible({ timeout: LOAD })
      await expect(page.locator('svg, canvas').filter({ has: page.locator('*') }).first()).toBeVisible()
      await page.getByRole('checkbox', { name: words.details }).check()
      const row = page.getByRole('row').filter({ hasText: vanA.name })
      await expect(row).toContainText(words.share, { timeout: LOAD })
      const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(scroll, 'The page scrolls sideways at 390 px').toBeLessThanOrEqual(0)
      await expectAccessible(page)
      const [download] = await Promise.all([page.waitForEvent('download', { timeout: LOAD }), page.getByRole('button', { name: words.csv }).click()])
      const csv = new TextDecoder().decode(await bytesOf(download))
      expect(csv).toContain(vanA.name)
      expect(csv.split(/\r?\n/)[0]).toMatch(lang === 'pt' ? /Veículo/ : /Vehicle/)
    } finally {
      await page.context().close()
    }
  })
}

// covers: T184 (bug #222: the comparison period of a period that hasn't started is empty, and
// vehicle_use refuses it with "Bad period", so the whole view says it couldn't be loaded)
test('vehicle use for a period that hasn\'t started yet loads', { tag: TAG }, async ({ adminWithOrg }) => {
  test.fail(true, 'Bug #222: Reports → Vehicle use can\'t load a period that hasn\'t started yet')
  const { page, org } = adminWithOrg
  await page.goto(`${org.path}/reports?tab=vehicles&period=custom&from=${day(7)}&until=${day(8)}`)
  await reportLoaded(page, page.getByText(/^(Vehicle cost|No trips or vehicle expenses in this period|No vehicles yet)$/).first())
})

// covers: T185
test('the export has vehicles, trips and vehicle expenses; closing a member\'s account leaves their vehicle and trip with the company', { tag: TAG }, async ({ adminWithOrg, browser, baseURL }) => {
  const { page, world, org } = adminWithOrg
  const leaver = await world.account('extra2')
  const admin = await world.admin()
  await addToOrg(admin, org.id, leaver, 'member')
  const { gig } = await gigWith(world, 'Leaver', [leaver])
  const u = uniq()
  // The member adds a vehicle and drives a trip, then a vehicle expense
  const van = ok('The member adds a van', await leaver.client.from('vehicles').insert({ org_id: org.id, name: `Leaver van ${u}`, plate: 'll-99-zz' }).select().single())
  const trip = ok('The member plans a trip', await leaver.client.from('trips').insert({
    gig_id: gig.id, vehicle_id: van.id, driver_id: leaver.id, km: 33, departs_at: utc(gig.start_date, '08:00'), arrives_at: utc(gig.start_date, '09:00'),
  }).select().single())
  ok('Adding a vehicle expense', await admin.client.from('expenses').insert({
    org_id: org.id, description: `Tolls ${u}`, amount_net: 12, spent_on: day(0), vehicle_id: van.id, trip_id: trip.id,
  }))

  // Organisation → Export
  await page.goto(`${org.path}?panel=settings`)
  const settings = page.getByRole('dialog', { name: `${org.name} — settings` })
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }),
    settings.getByRole('button', { name: 'Download everything (zip)' }).click()])
  const zip = await readZip(download)
  const file = part => {
    const name = Object.keys(zip).find(f => f.split('/').pop().replace(/^\d+-/, '').replace(/\.csv$/, '').replace(/-/g, '_') === part)
    expect(name, `No ${part} file in the export (it has: ${Object.keys(zip).join(', ')})`).toBeTruthy()
    return zipText(zip, name)
  }
  expect(file('vehicles')).toContain(van.name)
  expect(file('trips')).toContain(gig.name)
  expect(file('vehicle_expenses')).toContain(`Tolls ${u}`)

  // The member closes their account (Settings → Your data)
  const theirs = await pageAs(browser, leaver, { baseURL })
  try {
    await deleteAccount(theirs)
  } finally {
    await theirs.context().close()
  }
  // The vehicle and the trip stay with the company; the trip has no driver now
  const kept = ok('Reading the van', await admin.client.from('vehicles').select('id, name, removed_at').eq('id', van.id))
  expect(kept).toEqual([{ id: van.id, name: van.name, removed_at: null }])
  const keptTrip = ok('Reading the trip', await admin.client.from('trips').select('id, vehicle_id, driver_id, removed_at').eq('id', trip.id))
  expect(keptTrip).toEqual([{ id: trip.id, vehicle_id: van.id, driver_id: null, removed_at: null }])
  await transportTab(page, gig)
  await expect(page.getByRole('listitem').filter({ hasText: van.name })).toBeVisible({ timeout: LOAD })
  await vehiclesTab(page, org)
  await expect(vehicleRow(page, van.name)).toBeVisible({ timeout: LOAD })
})
