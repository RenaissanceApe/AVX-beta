// Messages and notifications (AT2): mostly two accounts talking to each other. The owner's manual
// lines T2, T12–T15, T17 and T18 (docs/PENDING.md section 2); what still needs a person is listed
// in docs/notes/AT2.md. docs/TESTING.md, "Automated test suite".
import { readFile } from 'node:fs/promises'
import { test, expect as baseExpect } from './fixtures.js'
import { expectAccessible } from './helpers.js'
import { RUN } from './accounts.js'
import { addGig, addItem, addQuote, addToGig, pageAs } from './setup.js'

test.use({ area: 'messages' })

// Two or three people and the server's round trips per step: on the shared test project, busy with
// other runs' reports, an answer can take more than the default 5 s, so each wait allows 15 s
const expect = baseExpect.configure({ timeout: 15_000 })
test.describe.configure({ timeout: 150_000 })

// Each test starts with everyone's notifications read: the bell's name doesn't match what it shows
// from 10 unread on, which the accessibility check flags (#209), and a test only opens its own
test.beforeEach(async ({ world }) => {
  const now = new Date().toISOString()
  for (const role of ['admin', 'member', 'crew', 'extra']) {
    const a = await world.account(role)
    const { error } = await a.client.from('notifications').update({ read_at: now }).eq('user_id', a.id).is('read_at', null)
    if (error) throw new Error(`Reading the ${role}'s notifications failed: ${error.message}`)
  }
})

// Each test writes its own words, so a test run twice (or after another) finds only its own messages
const words = what => `${what} ${RUN} ${Date.now().toString(36)}`

const composer = page => page.getByRole('textbox', { name: 'Write a message…' })
const chatRow = (page, text) => page.locator('.chat-row', { hasText: text })

async function send(page, text) {
  await composer(page).fill(text)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  // (a save can take a while when the shared test project is busy)
  await expect(chatRow(page, text)).toBeVisible({ timeout: 30_000 })
}

// Photos in a chat have their links once their signed address has loaded (until then a labelled
// placeholder shows; issue #212). Waiting keeps the axe check on the finished screen.
async function chatAccessible(page) {
  await expect(page.locator('.chat-row a[target="_blank"]:not([href])')).toHaveCount(0, { timeout: 15_000 })
  await expectAccessible(page)
}

// The ⋯ menu of a message (its buttons are faint until hover, but always there)
// Returns the open menu. If the conversation re-renders as the click lands, the menu may not open:
// then it is clicked again (only while it's closed, so it never toggles shut)
async function menuOf(page, text) {
  const row = chatRow(page, text)
  const more = row.getByRole('button', { name: /^More for / })
  const menu = row.getByRole('menu')
  await expect(async () => {
    if (await more.getAttribute('aria-expanded') !== 'true') {
      await row.hover()
      await more.click()
    }
    await expect(menu).toHaveCount(1, { timeout: 2_000 })
  }).toPass({ timeout: 20_000 })
  return menu
}

// covers: T2
test('two people message each other directly, reply and mute', { tag: ['@smoke', '@messages'] }, async ({ adminWithOrg, member }) => {
  const { page } = adminWithOrg
  const hello = words('Hello from the admin')
  await page.goto(`/messages?to=${member.account.id}`)
  await expect(page).toHaveURL(/\/messages\/[0-9a-f-]{36}$/, { timeout: 15_000 })
  const conversation = page.getByRole('region', { name: member.account.name })
  await expect(conversation).toBeVisible({ timeout: 15_000 })
  await send(page, hello)
  await chatAccessible(page)

  // The member finds it in Messages and answers with a reply to it
  const other = member.page
  await other.goto('/messages')
  await other.getByRole('navigation', { name: 'Messages' }).getByRole('link', { name: new RegExp(adminWithOrg.account.name) }).click()
  await expect(chatRow(other, hello)).toBeVisible({ timeout: 15_000 })
  await chatRow(other, hello).hover()
  await chatRow(other, hello).getByRole('button', { name: `Reply to ${adminWithOrg.account.name}` }).click()
  await expect(other.getByText(`Replying to ${adminWithOrg.account.name}`)).toBeVisible()
  const answer = words('Hello back from the member')
  await send(other, answer)
  // The reply quotes the message it answers
  await expect(chatRow(other, answer)).toContainText(hello)

  // It arrives on the admin's side (live, without reloading)
  await expect(chatRow(page, answer)).toBeVisible({ timeout: 20_000 })

  // Mute, and the list shows it's muted; unmute again
  await page.getByRole('button', { name: 'Mute this conversation' }).click()
  await expect(page.getByText("Muted. You won't be notified about new messages here.")).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Messages' }).getByRole('link', { name: new RegExp(member.account.name) }).getByLabel('Muted')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Unmute this conversation' }).click()
  await expect(page.getByText("Unmuted. You'll be notified again.")).toBeVisible()
})

// covers: T2
test('the gig chat: crew and manager talk, and a venue change is posted in it', { tag: '@messages' }, async ({ adminWithOrg, crewOnGig }) => {
  const { page, account } = adminWithOrg
  const gig = crewOnGig.gig
  const fromPm = words('Load-in at nine')
  await page.goto(`${gig.path}?tab=chat`)
  await send(page, fromPm)
  await chatAccessible(page)

  const crew = crewOnGig.page
  await crew.goto(`${gig.path}?tab=chat`)
  await expect(chatRow(crew, fromPm)).toBeVisible({ timeout: 15_000 })
  const fromCrew = words('See you there')
  await send(crew, fromCrew)
  await expect(chatRow(page, fromCrew)).toBeVisible({ timeout: 20_000 })

  // The venue changes (as the gig's edit form saves it); the chat says so
  const venue = words('E2E Hall')
  const { error } = await account.client.from('gigs').update({ venue }).eq('id', gig.id)
  expect(error).toBeNull()
  await crew.reload()
  await expect(crew.getByText(`${account.name} changed the venue to ${venue}`)).toBeVisible({ timeout: 15_000 })
})

// A tiny PNG (1×1) and PDF, made here so no binary file is committed
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n')

// Open the bell and the notification whose text matches
async function openNotification(page, text) {
  const bell = page.getByRole('button', { name: /^Notifications$|unread notification/ })
  await expect(page.getByRole('button', { name: /unread notification/ })).toBeVisible({ timeout: 20_000 })
  await bell.click()
  const item = page.getByRole('dialog', { name: 'Notifications' }).getByRole('button', { name: text }).first()
  await expect(item).toBeVisible({ timeout: 15_000 })
  await item.click()
}

// Pick a person or group from the @ list while writing
async function mention(page, typed, option) {
  await composer(page).pressSequentially(typed)
  await page.getByRole('listbox', { name: 'Mention someone' }).getByRole('option', { name: option }).first().click()
  // The app puts the cursor after the name on the next frame: type only after that
  await expect(composer(page)).toHaveValue(/ $/)
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}

// covers: T12
test('the gig chat: files, a schedule card, mentions, a reaction, an edit, a removal and a link', { tag: '@messages' }, async ({ adminWithOrg, crewOnGig }) => {
  const { page, account } = adminWithOrg
  const gig = crewOnGig.gig
  const crew = crewOnGig.page
  const itemTitle = words('Line check')
  const { error } = await account.client.from('gig_schedule').insert({ gig_id: gig.id, day: gig.start_date, start_time: '14:00', title: itemTitle, created_by: account.id })
  expect(error).toBeNull()
  await crew.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto(`${gig.path}?tab=chat`)
  await expect(composer(page)).toBeVisible({ timeout: 15_000 })

  // A photo and a PDF in one message
  const withFiles = words('Stage photo and rider')
  await page.locator('input[type=file]').setInputFiles([
    { name: 'stage.png', mimeType: 'image/png', buffer: PNG },
    { name: 'rider.pdf', mimeType: 'application/pdf', buffer: PDF },
  ])
  await send(page, withFiles)
  await expect(chatRow(page, withFiles).getByRole('img', { name: 'stage.png' })).toBeVisible({ timeout: 20_000 })
  await expect(chatRow(page, withFiles).getByRole('button', { name: /rider\.pdf/ })).toBeVisible()

  // A schedule item as a card
  await page.getByRole('button', { name: 'Share a gig, file, quote…' }).click()
  const picker = page.getByRole('dialog', { name: 'Share a gig, file, quote…' })
  await picker.getByRole('tab', { name: 'Schedule item' }).click()
  await picker.getByRole('button', { name: new RegExp(itemTitle) }).click()
  const withCard = words('Here is the slot')
  await send(page, withCard)
  await expect(chatRow(page, withCard).getByRole('link', { name: new RegExp(itemTitle) })).toBeVisible({ timeout: 15_000 })
  await chatAccessible(page)

  // @mention the crew member by name, and (as the gig's manager) the @crew group
  const crewFirst = crewOnGig.account.name.split(' ').slice(0, 2).join(' ')
  await mention(page, `@${crewFirst.slice(0, 6)}`, new RegExp(crewFirst))
  const mentioned = words('please check the stage box')
  await composer(page).pressSequentially(` ${mentioned}`)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(chatRow(page, mentioned)).toBeVisible({ timeout: 15_000 })
  await mention(page, '@cre', /^@crew group/)
  const toCrew = words('doors at eight')
  await composer(page).pressSequentially(` ${toCrew}`)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(chatRow(page, toCrew)).toBeVisible({ timeout: 15_000 })

  // The crew member is told about the mention and lands on the gig's chat
  await crew.goto('/me')
  // (mentions are grouped per conversation: one notification, counting up, quoting the latest)
  await openNotification(crew, new RegExp(`mentioned you in ${gig.name}`))
  await expect(chatRow(crew, mentioned)).toBeVisible({ timeout: 20_000 })
  // The crew member sees the files and the card too, and reacts
  await expect(chatRow(crew, withFiles).getByRole('img', { name: 'stage.png' })).toBeVisible({ timeout: 15_000 })
  await expect(chatRow(crew, withCard).getByRole('link', { name: new RegExp(itemTitle) })).toBeVisible()
  await (await menuOf(crew, toCrew)).getByRole('menuitem', { name: 'React with 👍' }).click()
  await expect(chatRow(page, toCrew).getByRole('button', { name: '👍 1' })).toBeVisible({ timeout: 20_000 })

  // Edit a message; the earlier version stays readable
  const draft = words('Soundcheck at three')
  await send(crew, draft)
  await (await menuOf(crew, draft)).getByRole('menuitem', { name: 'Edit' }).click()
  const fixed = words('Soundcheck at four')
  await composer(crew).fill(fixed)
  await crew.getByRole('button', { name: 'Save changes' }).click()
  await expect(chatRow(crew, fixed)).toBeVisible({ timeout: 15_000 })
  // (an edit usually shows live; one run missed it, so the other side loads the chat again: notes/AT2.md)
  await page.reload()
  await expect(chatRow(page, fixed)).toBeVisible({ timeout: 20_000 })
  await chatRow(page, fixed).getByRole('button', { name: 'edited' }).click()
  const history = page.getByRole('dialog', { name: 'Earlier versions' })
  await expect(history).toContainText(draft)
  await expect(history).toContainText(fixed)
  await chatAccessible(page)
  await history.getByRole('button', { name: 'Close' }).click()

  // Remove one: after the undo time it's gone for everyone
  const oops = words('Wrong channel, sorry')
  await send(crew, oops)
  await expect(chatRow(page, oops)).toBeVisible({ timeout: 20_000 })
  const oopsId = (await chatRow(page, oops).getAttribute('id')).replace('msg-', '')
  await (await menuOf(crew, oops)).getByRole('menuitem', { name: 'Remove' }).click()
  await expect(crew.locator(`#msg-${oopsId}`)).toContainText('Message removed')
  await expect(page.locator(`#msg-${oopsId}`)).toContainText('Message removed', { timeout: 30_000 })

  // Copy a message's link and open it: the conversation opens at that message
  await (await menuOf(crew, withCard)).getByRole('menuitem', { name: 'Copy link' }).click()
  await expect(crew.getByText('Link copied.')).toBeVisible()
  const link = await crew.evaluate(() => navigator.clipboard.readText())
  expect(link).toMatch(/\/messages\/[0-9a-f-]{36}\?m=[0-9a-f-]{36}$/)
  await crew.goto(link)
  await expect(chatRow(crew, withCard)).toBeVisible({ timeout: 15_000 })
  await expect(crew.locator(`#msg-${link.split('m=')[1]}`)).toContainText(withCard)
})

// covers: T13
test('an organisation channel: admins only write, an announcement is confirmed, a message pinned', { tag: '@messages' }, async ({ adminWithOrg, member }) => {
  const { page, org } = adminWithOrg
  const channel = words('Warehouse')
  await page.goto('/messages')
  await page.getByRole('button', { name: 'New channel' }).click()
  const form = page.getByRole('dialog', { name: 'New channel' })
  await form.getByPlaceholder('e.g. General, Warehouse, Safety').fill(channel)
  await form.getByRole('radio', { name: /Everyone in the organisation/ }).check()
  await chatAccessible(page)
  await form.getByRole('button', { name: 'Create channel' }).click()
  const region = page.getByRole('region', { name: channel })
  await expect(region).toBeVisible({ timeout: 15_000 })
  await expect(region).toContainText(`${org.name} · Everyone in the organisation`)
  const hello = words('Welcome to the warehouse channel')
  await send(page, hello)

  // A member can write in it…
  const other = member.page
  await other.goto('/messages')
  await other.getByRole('navigation', { name: 'Messages' }).getByRole('link', { name: new RegExp(channel) }).click()
  await expect(chatRow(other, hello)).toBeVisible({ timeout: 15_000 })
  await send(other, words('Thanks'))

  // …until the admin makes it "Only admins can write"
  await page.getByRole('button', { name: 'Channel settings' }).click()
  const settings = page.getByRole('dialog', { name: 'Channel settings' })
  await settings.getByRole('checkbox', { name: /Only admins can write/ }).check()
  await settings.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Channel saved.')).toBeVisible()
  await expect(region).toContainText('admins write')
  await other.reload()
  await expect(other.getByText("You can read this channel but not post in it (viewers can't).")).toBeVisible({ timeout: 15_000 })
  await expect(composer(other)).toHaveCount(0)

  // An announcement: the member is told and confirms it; the admin sees the count
  await page.getByRole('button', { name: 'Send as an announcement (everyone is asked to confirm)' }).click()
  const notice = words('Inventory count on Friday')
  await send(page, notice)
  await expect(chatRow(page, notice)).toContainText('Announcement')
  await openNotification(other, new RegExp(`${notice}.*please confirm you've read it`))
  await expect(chatRow(other, notice)).toBeVisible({ timeout: 15_000 })
  await chatRow(other, notice).getByRole('button', { name: "I've read this" }).click()
  await expect(chatRow(other, notice)).toContainText('Confirmed')
  await page.reload()
  await expect(chatRow(page, notice).getByRole('button', { name: /^1 of \d+ confirmed$/ })).toBeVisible({ timeout: 15_000 })

  // Pin a message: the bar above the conversation shows it. In a conversation this short the
  // menu used to open under the header (#211, fixed); the item is still chosen with the keyboard.
  // (Pin shows for whoever runs the channel; the app looks that up once when the conversation
  // opens, and on a busy test project that lookup can time out: then the page is loaded again)
  let pin = (await menuOf(page, hello)).getByRole('menuitem', { name: 'Pin' })
  if (!(await pin.waitFor({ state: 'attached', timeout: 15_000 }).then(() => true, () => false))) {
    await page.reload()
    pin = (await menuOf(page, hello)).getByRole('menuitem', { name: 'Pin' })
  }
  await pin.focus()
  await pin.press('Enter')
  await expect(page.getByRole('button', { name: /1 pinned/ })).toBeVisible({ timeout: 15_000 })
  await expect(other.getByRole('button', { name: /1 pinned/ })).toBeVisible({ timeout: 20_000 })
  await chatAccessible(page)
})

// covers: T13
test('department channels on a gig: crew see only their own function', { tag: '@messages' }, async ({ adminWithOrg, crewOnGig }) => {
  const { page, account, world } = adminWithOrg
  const gig = crewOnGig.gig
  // A second function on the gig (Light), besides the crew member's Sound
  const light = await world.account('extra')
  await addToGig(account, gig.id, light, { functionTitle: 'Light' })

  await page.goto(`${gig.path}?tab=chat`)
  const chips = page.getByRole('tablist', { name: 'Channels' })
  await expect(chips.getByRole('tab', { name: /Sound/ })).toBeVisible({ timeout: 15_000 })
  await expect(chips.getByRole('tab', { name: /Light/ })).toBeVisible()
  await expect(chips.getByRole('tab', { name: /Managers/ })).toBeVisible()
  await chips.getByRole('tab', { name: /Sound/ }).click()
  await expect(chips.getByRole('tab', { name: /Sound/ })).toHaveAttribute('aria-selected', 'true')
  const forSound = words('Sound team: bring the spare DI boxes')
  await send(page, forSound)
  await chatAccessible(page)

  const crew = crewOnGig.page
  await crew.goto(`${gig.path}?tab=chat`)
  const crewChips = crew.getByRole('tablist', { name: 'Channels' })
  await expect(crewChips.getByRole('tab', { name: /Sound/ })).toBeVisible({ timeout: 15_000 })
  await expect(crewChips.getByRole('tab', { name: /Light/ })).toHaveCount(0)
  await expect(crewChips.getByRole('tab', { name: /Managers/ })).toHaveCount(0)
  await crewChips.getByRole('tab', { name: /Sound/ }).click()
  await expect(chatRow(crew, forSound)).toBeVisible({ timeout: 15_000 })
})

// covers: T13
test('search finds a message, and a saved message is under Saved', { tag: '@messages' }, async ({ adminWithOrg, crewOnGig }) => {
  const { page } = adminWithOrg
  const gig = crewOnGig.gig
  const marker = `zebra${Date.now().toString(36)}`
  const text = `Check the ${marker} crossing on the loading road`
  await page.goto(`${gig.path}?tab=chat`)
  await send(page, text)

  const crew = crewOnGig.page
  await crew.goto('/messages')
  await crew.getByRole('button', { name: 'Search' }).click()
  await crew.getByRole('textbox', { name: 'Search' }).fill(marker)
  const result = crew.getByRole('link', { name: new RegExp(marker) })
  await expect(result).toBeVisible({ timeout: 15_000 })
  await chatAccessible(crew)
  await result.click()
  await expect(crew).toHaveURL(/\/messages\/[0-9a-f-]{36}\?m=/)
  await expect(chatRow(crew, text)).toBeVisible({ timeout: 15_000 })

  await (await menuOf(crew, text)).getByRole('menuitem', { name: 'Save for later' }).click()
  await expect(crew.getByText('Saved for later.')).toBeVisible()
  await crew.getByRole('button', { name: 'Saved' }).click()
  await expect(crew.getByRole('link', { name: new RegExp(marker) })).toBeVisible({ timeout: 15_000 })
})

// covers: T13 (the ⋯ menu of a message near the top of a short conversation opens downwards, so its
// first items aren't hidden under the conversation's header; issue #211, fixed)
test('the menu of the first message in a short conversation can be clicked', { tag: '@messages' }, async ({ adminWithOrg }) => {
  const { page, account, org } = adminWithOrg
  const title = words('Short channel')
  const { data: channelId, error } = await account.client.rpc('save_org_channel', { p_id: null, p_org: org.id, p_title: title, p_audience: 'everyone', p_admins_post: false, p_archived: null })
  expect(error).toBeNull()
  const only = words('The only message here')
  const sent = await account.client.from('messages').insert({ conversation_id: channelId, body: only, attachments: [], mentions: [] })
  expect(sent.error).toBeNull()
  // Opened from the list, as a person does: opened by its link, the channel can show as read-only
  // while the organisations are still loading (#245, its own test below)
  await page.goto('/messages')
  await page.getByRole('navigation', { name: 'Messages' }).getByRole('link', { name: new RegExp(title) }).click()
  await expect(composer(page)).toBeVisible({ timeout: 15_000 })
  await expect(chatRow(page, only)).toBeVisible({ timeout: 15_000 })
  const menu = await menuOf(page, only)
  // A click a person can make: nothing else is on top of the item
  await menu.getByRole('menuitem', { name: 'React with 👍' }).click({ trial: true, timeout: 5_000 })
  await menu.getByRole('menuitem', { name: 'Copy link' }).click({ trial: true, timeout: 5_000 })
})

// covers: T13
test('an admin who opens a channel by its link while their organisations are still loading can post in it', { tag: '@messages' }, async ({ adminWithOrg }) => {
  test.fail(true, '#245: the channel decides "can post" before the organisation roles have loaded, and never looks again')
  const { page, account, org } = adminWithOrg
  const { data: channelId, error } = await account.client.rpc('save_org_channel', { p_id: null, p_org: org.id, p_title: words('Linked channel'), p_audience: 'everyone', p_admins_post: false, p_archived: null })
  expect(error).toBeNull()
  // The person's organisations (the workspace) arrive 3 s late, after the channel's details:
  // the order a slow connection or a busy server gives, made the same every time
  await page.route(url => url.pathname.endsWith('/rest/v1/org_members') && url.searchParams.get('select')?.includes('organisations'), async route => {
    await new Promise(resolve => setTimeout(resolve, 3_000))
    await route.continue()
  })
  await page.goto(`/messages/${channelId}`)
  await expect(composer(page)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText("You can read this channel but not post in it (viewers can't).")).toHaveCount(0)
})

// A second gig in the organisation (a test that changes who is on a gig keeps the shared one as it is)
async function anotherGig(adminWithOrg, fields = {}) {
  const gig = await adminWithOrg.world.gig()
  return addGig(adminWithOrg.account, adminWithOrg.org.id, { name: words('E2E Gig'), start_date: gig.start_date, end_date: gig.end_date, ...fields })
}

// The direct conversation with someone, from Messages
async function openDirect(page, name) {
  await page.goto('/messages')
  await page.getByRole('navigation', { name: 'Messages' }).getByRole('link', { name: new RegExp(name) }).first().click()
  await expect(page.getByRole('region', { name })).toBeVisible({ timeout: 15_000 })
}

// covers: T14
test('asking crew with a clash if they are available, answered from their Messages', { tag: '@messages' }, async ({ adminWithOrg, crewOnGig }) => {
  const { page, account } = adminWithOrg
  // The crew member is on the shared gig; a second gig on the same days clashes with it
  const gig2 = await anotherGig(adminWithOrg)
  await addToGig(account, gig2.id, crewOnGig.account)
  await page.goto(`${gig2.path}?tab=crew`)
  const clash = page.getByRole('status').filter({ hasText: `${crewOnGig.account.name} is already booked for this time.` })
  await expect(clash).toBeVisible({ timeout: 15_000 })
  await clash.getByRole('button', { name: 'Ask availability' }).click()
  const ask = page.getByRole('dialog', { name: `Ask ${crewOnGig.account.name}` })
  const question = words('Can you do both days?')
  await ask.getByLabel('Message (optional)').fill(question)
  await chatAccessible(page)
  await ask.getByRole('button', { name: 'Send question' }).click()
  await expect(page.getByText(`Asked ${crewOnGig.account.name}. You’ll get a notification when they answer.`)).toBeVisible()

  // The question is a card in their direct conversation; they answer there
  const crew = crewOnGig.page
  await openDirect(crew, adminWithOrg.account.name)
  const card = crew.getByRole('log').locator('div', { hasText: `“${question}”` }).filter({ has: crew.getByRole('button', { name: 'Available', exact: true }) }).last()
  await expect(card).toBeVisible({ timeout: 15_000 })
  await expect(card).toContainText(`${adminWithOrg.account.name} asks if you’re available`)
  await chatAccessible(crew)
  await card.getByRole('button', { name: 'Available', exact: true }).click()
  // Answered: the buttons go and the answer is posted under the question
  await expect(crew.getByRole('log').locator('div', { hasText: `“${question}”` }).getByRole('button', { name: 'Available', exact: true })).toHaveCount(0, { timeout: 15_000 })

  // The manager sees the answer on the Crew tab, and in the conversation
  await page.reload()
  await expect(page.getByText(/Said they’re available/)).toBeVisible({ timeout: 15_000 })
  await openDirect(page, crewOnGig.account.name)
  await expect(page.getByRole('log').getByText(`${crewOnGig.account.name} is available`).last()).toBeVisible({ timeout: 15_000 })
})

// covers: T14
test('a crew call for a position, accepted from Messages: they join the gig', { tag: '@messages' }, async ({ adminWithOrg, member }) => {
  const { page } = adminWithOrg
  const gig2 = await anotherGig(adminWithOrg)
  await page.goto(`${gig2.path}?tab=crew`)
  await page.getByRole('button', { name: 'Crew call' }).click()
  const call = page.getByRole('dialog', { name: 'Crew call' })
  await call.getByLabel('Function *').fill('Rigger')
  await call.getByRole('textbox', { name: 'Search' }).fill(member.account.name)
  await call.getByRole('button', { name: new RegExp(member.account.name) }).first().click()
  await expect(call.getByText('1 person picked')).toBeVisible()
  await chatAccessible(page)
  await call.getByRole('button', { name: 'Send to 1 person' }).click()
  await expect(page.getByText('Crew call sent to 1 person.')).toBeVisible({ timeout: 15_000 })

  const other = member.page
  await openDirect(other, adminWithOrg.account.name)
  // This gig's card (the conversation may hold earlier offers)
  const offer = other.getByRole('log').locator('div').filter({ has: other.getByRole('link', { name: gig2.name, exact: true }) }).last()
  await expect(offer).toContainText(`${adminWithOrg.account.name} offers you a place: Rigger`, { timeout: 15_000 })
  await offer.getByRole('button', { name: 'Accept' }).click()
  await expect(offer).toContainText('You accepted · you’re on the gig', { timeout: 15_000 })
  await other.goto(gig2.path)
  await expect(other.getByRole('heading', { name: gig2.name })).toBeVisible({ timeout: 15_000 })
  // The manager's Crew tab has them as Rigger
  await page.reload()
  await expect(page.getByText('1 of 1 places filled').first()).toBeVisible({ timeout: 15_000 })
})

// covers: T14
test('the call sheet is sent to the crew, who confirm it in the chat', { tag: '@messages' }, async ({ adminWithOrg, crewOnGig }) => {
  const { page } = adminWithOrg
  const gig = crewOnGig.gig
  await page.goto(`${gig.path}/callsheet`)
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Send to the crew' }).click()
  await expect(page.getByText('Call sheet sent. You can see who confirmed in the gig’s chat.')).toBeVisible({ timeout: 15_000 })

  const crew = crewOnGig.page
  await crew.goto(`${gig.path}?tab=chat`)
  const posted = chatRow(crew, `The call sheet for ${gig.name} is ready`).last()
  await expect(posted).toBeVisible({ timeout: 15_000 })
  await expect(posted.getByRole('link', { name: /Call sheet/ })).toBeVisible()
  await posted.getByRole('button', { name: "I've read this" }).click()
  await expect(posted).toContainText('Confirmed')
})

// covers: T14
test('two schedule items make one note in the gig chat', { tag: '@messages' }, async ({ adminWithOrg }) => {
  const { page, account } = adminWithOrg
  const gig2 = await anotherGig(adminWithOrg, { status: 'confirmed' })
  // The chat exists once someone opens it
  await page.goto(`${gig2.path}?tab=chat`)
  await expect(page.getByText('Everyone on this gig can talk here.', { exact: false })).toBeVisible({ timeout: 15_000 })
  const first = words('Get-in')
  const second = words('Doors')
  for (const [title, at] of [[first, '09:00'], [second, '19:00']]) {
    const { error } = await account.client.from('gig_schedule').insert({ gig_id: gig2.id, day: gig2.start_date, start_time: at, title, created_by: account.id })
    expect(error).toBeNull()
  }
  await page.reload()
  // (the author reads "You made…")
  const notes = page.getByRole('log').getByText('You made 2 schedule changes:', { exact: false })
  await expect(notes).toHaveCount(1, { timeout: 15_000 })
  await expect(notes).toContainText(first)
  await expect(notes).toContainText(second)
})

// covers: T14
test('a team conversation on an equipment item, a repair and a subrental', { tag: '@messages' }, async ({ adminWithOrg, member }) => {
  const { page, account, org } = adminWithOrg
  const item = await addItem(account, org.id, { name: words('E2E Moving head') })
  const problem = words('Fan noise')
  const repair = await account.client.from('repairs').insert({ org_id: org.id, item_id: item.id, problem }).select().single()
  expect(repair.error).toBeNull()
  const supplier = await account.client.from('suppliers').insert({ org_id: org.id, name: words('E2E Supplier') }).select().single()
  expect(supplier.error).toBeNull()
  const reference = words('PO')
  const start = new Date(Date.now() + 10 * 86400e3)
  const sub = await account.client.from('subrentals').insert({ org_id: org.id, supplier_id: supplier.data.id, reference, starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 86400e3).toISOString() }).select().single()
  expect(sub.error).toBeNull()

  // A thread opens under its toggle; returns the composer's page section
  async function talk(where, text) {
    await where.getByRole('button', { name: /^Team conversation/ }).click()
    await expect(composer(page)).toBeVisible({ timeout: 15_000 })
    await send(page, text)
  }

  await page.goto(`${org.path}/inventory/${item.id}`)
  const aboutItem = words('One clamp is loose')
  await talk(page, aboutItem)
  await chatAccessible(page)

  await page.goto(`${org.path}/inventory?tab=maintenance`)
  await page.getByRole('button', { name: new RegExp(problem) }).click()
  const repairWindow = page.getByRole('dialog')
  const aboutRepair = words('Repairer says Tuesday')
  await talk(repairWindow, aboutRepair)

  await page.goto(`${org.path}/inventory?tab=subrentals`)
  await page.getByRole('button', { name: new RegExp(reference) }).click()
  const subWindow = page.getByRole('dialog', { name: 'Subrental' })
  const aboutSub = words('Pick-up at the back door')
  await talk(subWindow, aboutSub)
  await chatAccessible(page)

  // A member finds the three in Messages, each linking back to its thing
  const other = member.page
  await other.goto('/messages')
  const list = other.getByRole('navigation', { name: 'Messages' })
  await list.getByRole('link', { name: new RegExp(aboutItem) }).click()
  await expect(chatRow(other, aboutItem)).toBeVisible({ timeout: 15_000 })
  await expect(other.getByRole('link', { name: 'Open the item' })).toBeVisible()
  await expect(list.getByRole('link', { name: new RegExp(aboutRepair) })).toBeVisible()
  await expect(list.getByRole('link', { name: new RegExp(aboutSub) })).toBeVisible()
})

// Someone without an account writes on a page opened from a link (a private window)
async function guestWrites(browser, baseURL, link, { name, text }) {
  const context = await browser.newContext({ baseURL })
  const guest = await context.newPage()
  await guest.goto(link)
  const thread = guest.getByRole('region', { name: /^Questions\? Write to / })
  await expect(thread).toBeVisible({ timeout: 15_000 })
  await thread.getByLabel('Your name').fill(name)
  await thread.getByLabel('Message').fill(text)
  await thread.getByRole('button', { name: 'Send' }).click()
  await expect(thread.getByRole('log').getByText(text)).toBeVisible({ timeout: 15_000 })
  await expect(thread.getByText(/^No messages yet/)).toHaveCount(0)
  return { guest, thread, context }
}

// Send to client → Create link, on the quote's page: the link the client gets
async function quoteLink(page, quote) {
  await page.goto(quote.path)
  await page.getByRole('button', { name: 'Send to client' }).click()
  const sending = page.getByRole('dialog', { name: 'Send to client' })
  await sending.getByRole('button', { name: 'Create link' }).click()
  const link = await sending.getByRole('textbox', { name: 'Link to the quote' }).inputValue()
  expect(link).toMatch(/\/q\/[\w-]+$/)
  await sending.getByRole('button', { name: 'Close' }).click()
  return link
}

// covers: T15
test('a quote\'s client writes from the quote\'s page and is answered from its Summary tab', { tag: '@messages' }, async ({ adminWithOrg, browser, baseURL }) => {
  const { page, account, org } = adminWithOrg
  const quote = await addQuote(account, org, { title: words('E2E Guest Quote'), lines: [{ description: 'PA system', qty: 1, unit_price: 100 }] })
  const link = await quoteLink(page, quote)

  const question = words('Can we pick up on Thursday instead?')
  const { guest, thread, context } = await guestWrites(browser, baseURL, link, { name: 'E2E Client Person', text: question })
  // (the guest pages' accessibility: the test below)

  await page.getByRole('tab', { name: 'Summary' }).click()
  await page.getByRole('button', { name: /^Conversation with the client/ }).click()
  await expect(chatRow(page, question)).toBeVisible({ timeout: 15_000 })
  await expect(chatRow(page, question)).toContainText('E2E Client Person')
  await expect(chatRow(page, question)).toContainText('client')
  const answer = words('Thursday works, see you then')
  await send(page, answer)
  await chatAccessible(page)

  // The client sees the answer when they open the page again
  await guest.reload()
  await expect(thread.getByText(answer)).toBeVisible({ timeout: 15_000 })
  await context.close()
})

// covers: T15
test('a subrental\'s supplier writes through their link; a new link turns the old one off', { tag: '@messages' }, async ({ adminWithOrg, browser, baseURL }) => {
  const { page, account, org } = adminWithOrg
  const supplier = await account.client.from('suppliers').insert({ org_id: org.id, name: words('E2E Hire Co') }).select().single()
  expect(supplier.error).toBeNull()
  const reference = words('SUB')
  const start = new Date(Date.now() + 12 * 86400e3)
  const sub = await account.client.from('subrentals').insert({ org_id: org.id, supplier_id: supplier.data.id, reference, starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 86400e3).toISOString() }).select().single()
  expect(sub.error).toBeNull()

  await page.goto(`${org.path}/inventory?tab=subrentals`)
  await page.getByRole('button', { name: new RegExp(reference) }).click()
  const win = page.getByRole('dialog', { name: 'Subrental' })
  await win.getByRole('button', { name: /^Conversation with the supplier/ }).click()
  await win.getByRole('button', { name: 'Make a link for the supplier' }).click()
  const linkBox = win.getByRole('textbox', { name: 'Supplier link' })
  await expect(linkBox).toBeVisible({ timeout: 15_000 })
  const link = await linkBox.inputValue()
  expect(link).toMatch(/\/s\/[\w-]+$/)

  const note = words('Ready from 8am at the warehouse')
  const { guest, thread, context } = await guestWrites(browser, baseURL, link, { name: 'E2E Supplier Person', text: note })
  await expect(guest.getByText(`Ref. ${reference}`)).toBeVisible()

  // Answered from the subrental (the window loads the conversation again when reopened)
  await page.reload()
  await page.getByRole('button', { name: new RegExp(reference) }).click()
  await win.getByRole('button', { name: /^Conversation with the supplier/ }).click()
  await expect(chatRow(page, note)).toBeVisible({ timeout: 15_000 })
  await expect(chatRow(page, note)).toContainText('supplier')
  const answer = words('Great, our van comes at 8')
  await send(page, answer)
  await guest.reload()
  await expect(thread.getByText(answer)).toBeVisible({ timeout: 15_000 })

  // A new link: the old one stops working
  page.once('dialog', dialog => dialog.accept())
  await win.getByRole('button', { name: 'New link' }).click()
  await expect(linkBox).not.toHaveValue(link, { timeout: 15_000 })
  await guest.reload()
  await expect(guest.getByRole('heading', { name: 'Link not available' })).toBeVisible({ timeout: 15_000 })
  await context.close()
})

// covers: T15 (the client's quote page and its conversation pass the colour-contrast check: grey text
// on white, and the header over the brand colour; issue #146, fixed)
test('the pages a client or supplier opens from a link pass the accessibility check', { tag: '@messages' }, async ({ adminWithOrg, browser, baseURL }) => {
  const { account, org } = adminWithOrg
  const quote = await addQuote(account, org, { title: words('E2E Contrast Quote'), lines: [{ description: 'PA system', qty: 1, unit_price: 100 }] })
  const link = await quoteLink(adminWithOrg.page, quote)
  const { guest, context } = await guestWrites(browser, baseURL, link, { name: 'E2E Client Person', text: words('Is the PA included?') })
  await expectAccessible(guest)
  await context.close()
})

// covers: T17. A report on the manager's own message is told to the manager too (#221, the owner's
// decision: every manager of the conversation hears about every report in it).
test('a reported message: the gig\'s manager keeps one and removes another', { tag: '@messages' }, async ({ adminWithOrg, crewOnGig, browser, baseURL }) => {
  const { page, account, world } = adminWithOrg
  const gig = crewOnGig.gig
  const crew = crewOnGig.page
  const extra = await world.account('extra')
  await addToGig(account, gig.id, extra, { functionTitle: 'Light' })
  const light = await pageAs(browser, extra, { baseURL })

  // The crew member reports a message by the Light technician
  const first = words('Parking is behind the venue')
  await light.goto(`${gig.path}?tab=chat`)
  await send(light, first)
  await crew.goto(`${gig.path}?tab=chat`)
  await (await menuOf(crew, first)).getByRole('menuitem', { name: 'Report' }).click()
  const report = crew.getByRole('dialog', { name: 'Report this message' })
  await report.getByRole('radio', { name: 'Spam' }).check()
  await report.getByLabel('Anything to add (optional)').fill('Testing the report')
  await chatAccessible(crew)
  await report.getByRole('button', { name: 'Send report' }).click()
  await expect(crew.getByText('Thanks. The report was sent.')).toBeVisible()

  // The manager is told, opens it and keeps the message
  await page.goto('/me')
  await openNotification(page, /was reported \(Spam\)\. Remove it or keep it/)
  const firstNote = chatRow(page, first).getByRole('note')
  await expect(firstNote).toContainText('Reported (1): Spam', { timeout: 15_000 })
  await chatAccessible(page)
  await firstNote.getByRole('button', { name: 'Keep it' }).click()
  await expect(page.getByText('Report closed; the message stays.')).toBeVisible()
  await expect(firstNote).toHaveCount(0)
  await expect(chatRow(page, first)).toContainText(first)

  // The Light technician reports the crew member's message; the manager removes it
  const second = words('Something rude')
  await send(crew, second)
  await expect(chatRow(light, second)).toBeVisible({ timeout: 20_000 })
  await (await menuOf(light, second)).getByRole('menuitem', { name: 'Report' }).click()
  await light.getByRole('dialog', { name: 'Report this message' }).getByRole('radio', { name: 'Abusive or harassing' }).check()
  await light.getByRole('button', { name: 'Send report' }).click()
  await expect(light.getByText('Thanks. The report was sent.')).toBeVisible()
  await light.context().close()

  await page.goto('/me')
  await openNotification(page, /was reported \(Abusive or harassing\)\. Remove it or keep it/)
  const secondNote = chatRow(page, second).getByRole('note')
  await expect(secondNote).toContainText('Reported (1): Abusive or harassing', { timeout: 15_000 })
  const secondId = await chatRow(page, second).getAttribute('id')
  page.once('dialog', dialog => dialog.accept())
  await secondNote.getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByText('Message removed.')).toBeVisible()

  // The author sees "Removed by a moderator" and is told
  await crew.goto('/me')
  await openNotification(crew, new RegExp(`A moderator removed your message in .*${second}`))
  await expect(crew.locator(`#${secondId}`)).toContainText('Removed by a moderator', { timeout: 15_000 })
  await expect(crew.getByRole('log').getByText(second)).toHaveCount(0)

  // The crew member reports the manager's own message: the manager is told all the same (#221)
  const own = words('Load-in moves to seven')
  await page.goto(`${gig.path}?tab=chat`)
  await send(page, own)
  await crew.goto(`${gig.path}?tab=chat`)
  await expect(chatRow(crew, own)).toBeVisible({ timeout: 20_000 })
  await (await menuOf(crew, own)).getByRole('menuitem', { name: 'Report' }).click()
  await crew.getByRole('dialog', { name: 'Report this message' }).getByRole('radio', { name: 'Something else' }).check()
  await crew.getByRole('button', { name: 'Send report' }).click()
  await expect(crew.getByText('Thanks. The report was sent.')).toBeVisible()
  await page.goto('/me')
  await openNotification(page, /was reported \(Something else\)\. Remove it or keep it/)
  const ownNote = chatRow(page, own).getByRole('note')
  await expect(ownNote).toContainText('Reported (1): Something else', { timeout: 15_000 })
  await ownNote.getByRole('button', { name: 'Keep it' }).click()
  await expect(page.getByText('Report closed; the message stays.')).toBeVisible()
})

// covers: T17
test('blocking someone in a direct conversation: neither can write; unblock from Account', { tag: '@messages' }, async ({ adminWithOrg, crewOnGig, browser, baseURL }) => {
  const { page, account, world } = adminWithOrg
  const extra = await world.account('extra')
  await addToGig(account, crewOnGig.gig.id, extra, { functionTitle: 'Light' })
  await account.client.rpc('block_user', { p_user: extra.id, p_block: false }) // a run stopped half way
  const before = words('Are you on the Light crew?')
  await page.goto(`/messages?to=${extra.id}`)
  await expect(page.getByRole('region', { name: extra.name })).toBeVisible({ timeout: 15_000 })
  await send(page, before)
  const other = await pageAs(browser, extra, { baseURL })
  await openDirect(other, account.name)
  const reply = words('Yes I am')
  await send(other, reply)

  // Block from the message menu
  await expect(chatRow(page, reply)).toBeVisible({ timeout: 20_000 })
  page.once('dialog', dialog => dialog.accept())
  await (await menuOf(page, reply)).getByRole('menuitem', { name: 'Block this person' }).click()
  await expect(page.getByText(`You blocked ${extra.name}.`).first()).toBeVisible()
  await expect(composer(page)).toHaveCount(0)
  await chatAccessible(page)

  // The blocked person's message isn't delivered
  await other.reload()
  await composer(other).fill(words('Hello?'))
  await other.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(other.getByText('This person isn’t receiving your messages here.')).toBeVisible({ timeout: 15_000 })

  // Unblock from Account → Privacy and blocking
  await page.goto('/settings/privacy')
  const blocked = page.getByRole('listitem').filter({ hasText: extra.name })
  await expect(page.getByText('People you blocked')).toBeVisible({ timeout: 15_000 })
  await chatAccessible(page)
  await blocked.getByRole('button', { name: 'Unblock' }).click()
  await expect(page.getByText(`You unblocked ${extra.name}.`)).toBeVisible()
  const after = words('Unblocked now')
  await openDirect(other, account.name)
  await send(other, after)
  await openDirect(page, extra.name)
  await expect(chatRow(page, after)).toBeVisible({ timeout: 15_000 })
  await other.context().close()
})

// covers: T12 (while a photo in a chat is loading it shows a labelled placeholder, not a link without
// an address, which the accessibility check flagged as serious; issue #212, fixed)
test('a photo in a chat is accessible while it loads', { tag: '@messages' }, async ({ adminWithOrg, crewOnGig }) => {
  const { page } = adminWithOrg
  const gig = crewOnGig.gig
  await page.goto(`${gig.path}?tab=chat`)
  const text = words('Photo of the truck')
  await page.locator('input[type=file]').setInputFiles([{ name: 'truck.png', mimeType: 'image/png', buffer: PNG }])
  await send(page, text)
  // The signed address takes a while (held here, as on a slow connection)
  await page.route('**/storage/v1/object/sign/**', () => { /* never answers */ })
  await page.reload()
  await expect(chatRow(page, text).getByRole('img', { name: 'truck.png' })).toHaveCount(1, { timeout: 15_000 })
  await expectAccessible(page)
})

// covers: T18 (not the hand-run migration, which is the owner's step: docs/notes/AT2.md)
test('organisation settings → Messages: usage, the retention warning and the download', { tag: '@messages' }, async ({ adminWithOrg }) => {
  const { page, account, org } = adminWithOrg
  // A message of this test's own, to find in the download
  const { data: channelId, error } = await account.client.rpc('save_org_channel', { p_id: null, p_org: org.id, p_title: words('Export check'), p_audience: 'staff', p_admins_post: false, p_archived: null })
  expect(error).toBeNull()
  const text = words('This line is in the export')
  expect((await account.client.from('messages').insert({ conversation_id: channelId, body: text, attachments: [], mentions: [] })).error).toBeNull()
  await account.client.rpc('set_message_retention', { p_org: org.id, p_days: null }) // a run stopped half way

  await page.goto(`${org.path}?panel=settings`)
  const settings = page.getByRole('dialog', { name: new RegExp(org.name) })
  await expect(settings.getByText(/^Messages: \d+ · conversations: \d+/)).toBeVisible({ timeout: 15_000 })
  await expect(settings.getByText(/last 30 days: \d+ messages, \d+ writing/)).toBeVisible()
  const keep = settings.getByLabel('Keep messages')
  await expect(keep).toHaveValue('')

  // A shorter period goes through the deletion warning; cancel keeps it as it was
  await keep.selectOption({ label: 'For 2 years' })
  const warning = page.getByRole('dialog', { name: 'Keep messages for 2 years?' })
  await expect(warning).toContainText('0 messages are already older and go tonight', { timeout: 15_000 })
  await expect(warning).toContainText('From then on, each message once it is more than 2 years old')
  await expectAccessible(page)
  await warning.getByRole('button', { name: 'Cancel' }).click()
  await expect(warning).toHaveCount(0)
  await expect(keep).toHaveValue('')

  // …and confirming (tick, type the organisation's name) saves it
  await keep.selectOption({ label: 'For 2 years' })
  await warning.getByRole('checkbox').check()
  await warning.getByRole('button', { name: 'Continue' }).click()
  await warning.getByLabel('To confirm, type the exact name below').pressSequentially(org.name)
  await warning.getByRole('button', { name: 'Delete older messages' }).click()
  await expect(page.getByText('Messages are now kept for 2 years.')).toBeVisible({ timeout: 15_000 })
  await expect(keep).toHaveValue('730')
  // Back to for ever: a longer period just saves
  await keep.selectOption({ label: 'For ever' })
  await expect(page.getByText('Messages are now kept for ever.')).toBeVisible({ timeout: 15_000 })

  // Download all messages: a JSON file with this organisation's conversations
  const downloading = page.waitForEvent('download')
  await settings.getByRole('button', { name: 'Download all messages' }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toMatch(/^avx-.*-messages-\d{4}-\d{2}-\d{2}\.json$/)
  const file = JSON.parse(await readFile(await download.path(), 'utf8'))
  expect(file.organisation).toBe(org.name)
  expect(Array.isArray(file.conversations)).toBe(true)
  expect(JSON.stringify(file.conversations)).toContain(text)
})
