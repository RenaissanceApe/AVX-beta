// Messages and notifications (AT2): mostly two accounts talking to each other. The owner's manual
// lines T2, T12–T15, T17 and T18 (docs/PENDING.md section 2); what still needs a person is listed
// in docs/notes/AT2.md. docs/TESTING.md, "Automated test suite".
import { test, expect } from './fixtures.js'
import { expectAccessible } from './helpers.js'
import { RUN } from './accounts.js'
import { addToGig } from './setup.js'

test.use({ area: 'messages' })

// Each test writes its own words, so a test run twice (or after another) finds only its own messages
const words = what => `${what} ${RUN} ${Date.now().toString(36)}`

const composer = page => page.getByRole('textbox', { name: 'Write a message…' })
const chatRow = (page, text) => page.locator('.chat-row', { hasText: text })

async function send(page, text) {
  await composer(page).fill(text)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(chatRow(page, text)).toBeVisible({ timeout: 15_000 })
}

// The ⋯ menu of a message (its buttons are faint until hover, but always there)
async function menuOf(page, text) {
  // (returns the open menu)
  const row = chatRow(page, text)
  await row.hover()
  await row.getByRole('button', { name: /^More for / }).click()
  return row.getByRole('menu')
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
  await expectAccessible(page)

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
  await expectAccessible(page)

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
  await expectAccessible(page)

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
  await expect(chatRow(page, fixed)).toBeVisible({ timeout: 20_000 })
  await chatRow(page, fixed).getByRole('button', { name: 'edited' }).click()
  const history = page.getByRole('dialog', { name: 'Earlier versions' })
  await expect(history).toContainText(draft)
  await expect(history).toContainText(fixed)
  await expectAccessible(page)
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
  await expectAccessible(page)
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
  // menu opens under the header (see the test.fail below), so the item is chosen with the keyboard.
  const pin = (await menuOf(page, hello)).getByRole('menuitem', { name: 'Pin' })
  await pin.focus()
  await pin.press('Enter')
  await expect(page.getByRole('button', { name: /1 pinned/ })).toBeVisible({ timeout: 15_000 })
  await expect(other.getByRole('button', { name: /1 pinned/ })).toBeVisible({ timeout: 20_000 })
  await expectAccessible(page)
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
  await expect(page.getByText('Only Sound and the gig\'s managers see this channel.')).toBeVisible({ timeout: 15_000 })
  const forSound = words('Sound team: bring the spare DI boxes')
  await send(page, forSound)
  await expectAccessible(page)

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
  await expectAccessible(crew)
  await result.click()
  await expect(crew).toHaveURL(/\/messages\/[0-9a-f-]{36}\?m=/)
  await expect(chatRow(crew, text)).toBeVisible({ timeout: 15_000 })

  await (await menuOf(crew, text)).getByRole('menuitem', { name: 'Save for later' }).click()
  await expect(crew.getByText('Saved for later.')).toBeVisible()
  await crew.getByRole('button', { name: 'Saved' }).click()
  await expect(crew.getByRole('link', { name: new RegExp(marker) })).toBeVisible({ timeout: 15_000 })
})

// covers: T13 (documents a bug: the ⋯ menu of a message near the top of a short conversation opens
// upwards, under the conversation's header, so its first items can't be clicked; issue ISSUE_MENU)
test('the menu of the first message in a short conversation can be clicked', { tag: '@messages' }, async ({ adminWithOrg }) => {
  test.fail(true, 'The ⋯ menu opens upwards under the header (issue ISSUE_MENU)')
  const { page, account, org } = adminWithOrg
  const title = words('Short channel')
  const { data: channelId, error } = await account.client.rpc('save_org_channel', { p_id: null, p_org: org.id, p_title: title, p_audience: 'everyone', p_admins_post: false, p_archived: null })
  expect(error).toBeNull()
  const only = words('The only message here')
  const sent = await account.client.from('messages').insert({ conversation_id: channelId, body: only, attachments: [], mentions: [] })
  expect(sent.error).toBeNull()
  await page.goto(`/messages/${channelId}`)
  await expect(chatRow(page, only)).toBeVisible({ timeout: 15_000 })
  const menu = await menuOf(page, only)
  // A click a person can make: nothing else is on top of the item
  await menu.getByRole('menuitem', { name: 'React with 👍' }).click({ trial: true, timeout: 5_000 })
  await menu.getByRole('menuitem', { name: 'Copy link' }).click({ trial: true, timeout: 5_000 })
})
