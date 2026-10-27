// Help content in English (docs/HELP.md, H1). The Portuguese file has exactly the same ids;
// help.test.js fails otherwise. Plain words, one idea per sentence.
//   terms: the glossary (Help → Glossary, and the dotted words in the app)
//   hints: the ⓘ next to fields
//   pages: what the ? on a page header says

export default {
  terms: {
    gig: { term: 'Gig', definition: 'An event or job your team works on: a concert, a conference, a rental.', example: 'Festival main stage, 12–14 July.', where: 'Gigs list, calendar, gig page' },
    organisation: { term: 'Organisation', definition: 'A company in AVX. It has members, gigs, equipment and quotes.', example: 'Lumen and Pixel, with three admins and twenty crew.', where: 'Company switcher at the top' },
    workspace: { term: 'Workspace', definition: 'What you are looking at: one organisation, or "My work" with everything you are booked on.', example: 'Switch from "Lumen and Pixel" to "My work" to see gigs from other companies.', where: 'Company switcher at the top' },
    'my-work': { term: 'My work', definition: 'Your own view: the gigs you are on in every company, your requests and your unavailable dates.', example: 'A freelancer sees gigs from three companies in one list.', where: 'Company switcher → My work' },
    pm: { term: 'Production manager (PM)', definition: 'Runs a gig. Can change everything on it, invite crew and send the call sheet.', example: 'Ana is the PM of the gala dinner.', where: 'Gig → Crew' },
    crew: { term: 'Crew', definition: 'People working on a gig. They see it, its files and schedule, and can write in its chat.', example: 'Sound and light technicians.', where: 'Gig → Crew' },
    viewer: { term: 'Viewer', definition: 'Someone who can read a gig or an organisation but not change anything.', example: 'A client who follows the schedule.', where: 'Gig → Crew, organisation members' },
    'org-admin': { term: 'Admin', definition: 'Organisation role that can do everything: members, quotes, settings and deleting.', example: 'The company owner.', where: 'Organisation → Members' },
    'org-member': { term: 'Member', definition: 'Organisation role that works on gigs, files and quotes, but not on members or settings.', example: 'An office producer.', where: 'Organisation → Members' },
    'call-time': { term: 'Call time', definition: 'When a person must arrive for the gig.', example: 'Call time 08:00 at the venue’s loading dock.', where: 'Gig → Crew, call sheet' },
    'timecode': { term: 'Timecode', definition: 'A clock shown as hours:minutes:seconds:frames that cameras, consoles and show control share. Rehearsal notes are marked against it so everyone talks about the same moment.', example: '01:02:15:12 is one hour, two minutes, fifteen seconds and twelve frames.', where: 'Gig → Tools → Rehearsal notes' },
    'booking-times': { term: 'Booking times (shift)', definition: 'The hours someone is booked for. Without them, they count as busy for the gig’s whole days.', example: 'Booked only from 14:00 to 20:00 on the first day.', where: 'Gig → Crew → Set times' },
    'double-booking': { term: 'Double booking', definition: 'A person or item booked on two things at the same time. AVX warns you; it does not forbid it.', example: 'Carla is on two gigs on Saturday afternoon.', where: 'Gig → Crew, equipment, calendar' },
    'availability-request': { term: 'Availability question', definition: 'A question to someone: are you free for these dates? They answer yes or no from their phone.', example: '"Can you do 13–14 November?" → "Available, from 10:00".', where: 'Gig → Crew, My work → Requests, messages' },
    'crew-call': { term: 'Crew call', definition: 'An offer of a place on a gig to one or more people. Whoever accepts first takes the place.', example: 'Two sound technicians wanted; offered to five people.', where: 'Gig → Crew → Crew call' },
    'unavailable-dates': { term: 'Unavailable dates', definition: 'Days you mark as not free. Managers see that you are busy, not why.', example: 'Holidays from 1 to 15 August.', where: 'My work' },
    'gig-status': { term: 'Gig status', definition: 'Where a gig is: draft, confirmed, active (happening now), done or archived.', example: 'A quote is accepted, so the gig moves from draft to confirmed.', where: 'Gig page, gigs list' },
    'call-sheet': { term: 'Call sheet', definition: 'One page with everything the crew needs: times, places, contacts and schedule.', example: 'Printed and taped to the truck door.', where: 'Gig → Call sheet' },
    schedule: { term: 'Schedule', definition: 'The timed plan of a gig: load-in, sound check, show, load-out.', example: '09:00 load-in, 14:00 line check, 21:00 doors.', where: 'Gig → Schedule' },
    feed: { term: 'Updates (feed)', definition: 'Official posts on a gig, for things everyone must know. Important ones notify everyone.', example: '"Venue changed: now at the Coliseu."', where: 'Gig → Updates' },
    files: { term: 'Files and versions', definition: 'Documents on a gig. Uploading a file with the same name saves a new version and keeps the old ones.', example: 'Stage plot v1, v2, v3.', where: 'Gig → Files' },
    chat: { term: 'Chat (channel)', definition: 'A conversation for a group: a gig, a department of a gig, or the organisation.', example: 'The gig’s chat, or "Sound" for the sound team only.', where: 'Messages, Gig → Chat' },
    'direct-message': { term: 'Direct message', definition: 'A private conversation between two people who share a gig or an organisation.', example: 'Asking the PM about parking.', where: 'Messages' },
    announcement: { term: 'Announcement', definition: 'A message that asks everyone to confirm they read it. The sender sees who confirmed.', example: '"New safety rules — please confirm."', where: 'Messages' },
    mute: { term: 'Mute', definition: 'Stop notifications from a conversation or an organisation. Things addressed to you still arrive.', example: 'Mute a busy channel during your holidays.', where: 'Messages, company switcher' },
    'email-summary': { term: 'Email summary', definition: 'One email a day with the notifications you have not read. Nothing is sent when you are up to date.', example: 'Every morning: "3 updates you haven’t seen".', where: 'Settings → Notifications' },
    'push-notifications': { term: 'Notifications on this device', definition: 'Alerts on your phone or computer, like any app. Each device is turned on separately.', example: 'Your phone buzzes when someone mentions you.', where: 'Settings → Notifications' },
    'two-step': { term: 'Two-step sign-in', definition: 'Signing in asks for your password and a 6-digit code from an app on your phone.', example: 'Google Authenticator shows 482 913.', where: 'Settings → Sign-in and security' },
    'offline-copy': { term: 'Offline copy', definition: 'The last version of your gigs saved on your device, readable without signal.', example: 'Reading the call sheet in a basement with no network.', where: 'Gigs, gig page, call sheet' },
    network: { term: 'Your network', definition: 'People you have worked with on a gig or in an organisation; they can be found by name. Freelancers who switch on a crew profile can also be found by companies in Find crew.', example: 'Inviting a technician you worked with last year.', where: 'Gig → Crew → Invite' },
    findable: { term: 'Who can find you', definition: 'Who can find you by name when adding crew: only managers and admins, or other crew too.', example: 'A freelance PM can find you if you allow "other crew".', where: 'Settings → Privacy and blocking' },
    'catalogue-item': { term: 'Catalogue item', definition: 'A kind of equipment you own or hire out, with its price and stock.', example: 'Shure SM58 microphone.', where: 'Inventory → Catalogue' },
    'bulk-item': { term: 'Counted in bulk', definition: 'Stock kept as a number per location, not one by one.', example: '120 XLR cables in the warehouse.', where: 'Inventory → item' },
    'serial-item': { term: 'By serial number', definition: 'Each unit is recorded on its own, with serial, QR label and status.', example: 'Each of your 8 moving heads has its own record.', where: 'Inventory → item → Units' },
    unit: { term: 'Unit', definition: 'One physical piece of serial-numbered equipment.', example: 'Moving head MH-03, serial A12345.', where: 'Inventory → item → Units' },
    location: { term: 'Location', definition: 'Where stock is kept: a warehouse, a shelf, a van.', example: 'Main warehouse, shelf B4.', where: 'Inventory → Locations' },
    'stock-movement': { term: 'Stock movement', definition: 'A recorded change in stock: bought, moved, lost, sold, found.', example: '+20 cables purchased.', where: 'Inventory → Movements' },
    set: { term: 'Set', definition: 'Items always hired together, priced as one.', example: 'DJ set: two players and a mixer.', where: 'Inventory → item → Kit' },
    case: { term: 'Case', definition: 'A flight case that holds units. Scanning the case scans everything inside.', example: 'Case with 6 wireless microphones.', where: 'Inventory → item → Kit' },
    accessory: { term: 'Accessory', definition: 'Something that goes along with an item when you add it to a gig.', example: 'A clamp with every light.', where: 'Inventory → item → Kit' },
    alternative: { term: 'Alternative', definition: 'An item that can replace another when it is not available.', example: 'SM57 instead of SM58.', where: 'Inventory → item, gig equipment' },
    'prep-return-days': { term: 'Prep and return days', definition: 'Days before and after a gig when its equipment is still booked, for loading, testing and checking in.', example: '1 prep day: the gear is busy from the day before.', where: 'Organisation settings, gig equipment' },
    'packing-list': { term: 'Packing list', definition: 'What must leave the warehouse for a gig, with quantities.', example: 'Printed for the warehouse team on the day before.', where: 'Gig → Equipment → Packing list' },
    'scan-out-in': { term: 'Scan out / scan in', definition: 'Reading QR labels when equipment leaves for a gig and when it comes back.', example: 'Scanning 40 units into the truck.', where: 'Gig → Equipment → Scan' },
    'equipment-steps': { term: 'Equipment steps', definition: 'Where a gig\'s equipment is between the warehouse and back: prepped, out, on site, loaded back, back in, checked in.', example: '60 of 69 prepped, 40 out.', where: 'Gig → Equipment, Scan out / in, packing list' },
    'dmx-universe': { term: 'DMX universe', definition: 'One line of 512 lighting control channels. A fixture takes some of them, from its start address.', example: 'Universe 1 for the moving heads, universe 2 for the LED bars.', where: 'Gig → Tools → DMX patch' },
    'dmx-address': { term: 'DMX address', definition: 'The first channel a fixture listens to on its universe. It uses that one and the next ones, as many as its footprint.', example: 'A 14-channel spot on address 15 uses channels 15 to 28.', where: 'Gig → Tools → DMX patch' },
    split: { term: 'Split', definition: 'Sending the same stage inputs to two desks, usually front of house and monitors.', example: 'SB1 is split to the monitor desk.', where: 'Gig → Tools → Patch' },
    haas: { term: 'Haas effect', definition: 'We hear sound as coming from where it reaches us first. Delaying a delay tower a few milliseconds past the main keeps the sound seeming to come from the stage.', example: 'Delay tower set 10 ms later than the sound from the mains.', where: 'Gig → Tools → Sound system calculator' },
    spl: { term: 'SPL', definition: 'Sound pressure level: how loud, in decibels. It drops about 6 dB each time the distance doubles.', example: '136 dB at 1 m is about 106 dB at 32 m.', where: 'Gig → Tools → Sound system calculator' },
    truss: { term: 'Truss', definition: 'A metal frame that lighting hangs from, flown above the stage or standing on the floor.', example: 'Truss 1 at 7 m with eight spots.', where: 'Gig → Tools → Light plot' },
    'power-phase': { term: 'Power phase', definition: 'One of the live wires of a power supply. A three-phase supply has three, each with its own limit in amps; the load should be shared between them.', example: 'A 32 A three-phase supply gives 32 A on each of L1, L2 and L3.', where: 'Gig → Tools → Light plot' },
    'stage-plot': { term: 'Stage plot', definition: 'A drawing of the stage from above showing where everything goes: drums, mics, amps, monitors, risers.', example: 'The band\'s plot with the drum riser upstage centre.', where: 'Gig → Tools' },
    'input-list': { term: 'Input list', definition: 'The list of everything plugged into the sound desk, one line per channel: source, mic or DI, stand, 48V.', example: 'Ch 1 Kick in, Beta 91A, 48V.', where: 'Gig → Tools' },
    'phantom-power': { term: '48V (phantom power)', definition: 'Power the desk sends down the mic cable for condenser mics and active DIs.', example: 'Overheads and DI boxes need 48V; a dynamic SM58 doesn\'t.', where: 'Gig → Tools → Input list' },
    'stage-box': { term: 'Stage box', definition: 'A box on stage with many inputs that sends them to the desk over one cable.', example: 'SB1-03: stage box 1, input 3.', where: 'Gig → Tools → Input list' },
    'line-check': { term: 'Line check', definition: 'Testing every channel before the soundcheck: something plugged in, signal at the desk. Tick each line as you go.', example: 'All 24 lines checked by 15:00.', where: 'Gig → Tools → Input list' },
    'field-tools': { term: 'Field tools', definition: 'Optional technical tools on a gig (input list, and soon stage plot, patch, light plot), in its Tools tab.', example: 'The input list for the gala.', where: 'Gig → Tools; organisation settings' },
    'scan-mode': { term: 'Scan mode', definition: 'A full-screen way to scan, with big buttons, sounds, vibration and a torch, for gloves, noise and the dark.', example: 'Loading the van at night with one hand free.', where: 'Gig → Equipment → Scan out / in' },
    'mark-lost': { term: 'Mark as lost', definition: 'Units that did not come back are recorded as lost, so stock and reports are right.', example: 'Two cables missing after the festival.', where: 'Gig → Scan' },
    damage: { term: 'Damage report', definition: 'A note, with photos, that something broke. The unit can be taken out of use.', example: 'Cracked lens reported from site.', where: 'Gig → Equipment, Inventory → Maintenance' },
    repair: { term: 'Repair', definition: 'Fixing a damaged unit. While in repair it is not available for gigs.', example: 'Sent to the manufacturer for 2 weeks.', where: 'Inventory → Maintenance' },
    'write-off': { term: 'Write-off', definition: 'Taking equipment out of stock for good because it can’t be repaired.', example: 'A projector beyond repair.', where: 'Inventory → Maintenance' },
    inspection: { term: 'Periodic inspection', definition: 'A safety check due every few months, such as electrical testing (PAT).', example: 'PAT every 12 months for every cable.', where: 'Inventory → item, Maintenance' },
    'replacement-value': { term: 'Replacement value', definition: 'What it would cost to buy the item again today.', example: '€1,200 for a moving head.', where: 'Inventory → item' },
    depreciation: { term: 'Book value and depreciation', definition: 'What equipment is worth on paper: its price minus wear over the months you choose.', example: '€6,000 over 60 months is worth €3,000 after 30 months.', where: 'Inventory → Reports' },
    subrental: { term: 'Subrental', definition: 'Equipment you hire from another company for a gig.', example: 'Renting 4 extra speakers for the festival.', where: 'Inventory → Subrentals' },
    supplier: { term: 'Supplier', definition: 'The company you hire equipment from.', example: 'A rental house in Porto.', where: 'Contacts → Suppliers' },
    client: { term: 'Client', definition: 'A company or person you quote for, kept once in Contacts and picked on each quote.', example: 'Festival Lda, contact Ana, with their tax number and address.', where: 'Contacts → Clients' },
    'cross-hire-code': { term: 'Cross-hire code', definition: 'A code that links two companies on AVX, so hire requests go straight to the other company.', example: 'P-7K2Q.', where: 'Inventory → Subrentals' },
    quote: { term: 'Quote', definition: 'A priced proposal for a client, built from your price list.', example: 'Quote 2026-014 for the gala dinner.', where: 'Quotes' },
    'quote-version': { term: 'Quote version', definition: 'A saved copy of a quote as it was sent. Changes after that make a new version.', example: 'v1 sent, client asked for less, v2 sent.', where: 'Quote → Versions' },
    phase: { term: 'Phase', definition: 'A part of a quote with its own days and discount, such as rehearsal and show.', example: 'Rehearsal (1 day) and Show (2 days).', where: 'Quote editor' },
    factor: { term: 'Factor', definition: 'How many day prices a line costs for the whole phase. Often less than the number of days.', example: '3 days at factor 2.5.', where: 'Quote editor' },
    vat: { term: 'VAT (IVA)', definition: 'Tax added to the price. The rate is set per quote.', example: '23% in mainland Portugal.', where: 'Quote → Details' },
    validity: { term: 'Validity', definition: 'How many days the client has to accept a quote.', example: 'Valid for 30 days.', where: 'Quotes → Company details' },
    'client-link': { term: 'Client link', definition: 'A private web address where the client reads the quote, accepts it and writes to you, without an account.', example: 'Sent by email with the PDF.', where: 'Quote → Send' },
    'price-list': { term: 'Price list', definition: 'Your prices for equipment and services, used to build quotes.', example: 'SM58: €8 a day.', where: 'Quotes → Price list' },
    'retention': { term: 'Keeping messages', definition: 'How long an organisation keeps messages in its conversations before they are deleted.', example: 'Keep for 1 year.', where: 'Organisation settings → Messages' },
    report: { term: 'Report a message', definition: 'Telling the people who run a conversation that a message is spam or abusive. They don’t see who reported it.', example: 'Reporting an advert posted in a gig’s chat.', where: 'Messages → message menu' },
    block: { term: 'Block', definition: 'Stopping someone from writing to you in a direct conversation.', example: 'Blocking a person who keeps sending messages.', where: 'Messages, Settings → Privacy and blocking' },
  },

  hints: {
    'prep-days': 'Days before a gig when its equipment is already booked, for loading and testing. Example: 1 = the gear is busy from the day before.',
    'return-days': 'Days after a gig when its equipment is still booked, for unloading and checking it back in. Example: 1 = busy until the day after.',
    tracking: 'Counted in bulk: you keep a number per location (cables). By serial number: each unit has its own record and QR label (moving heads). This can’t change once there is stock.',
    'kit-type': 'Set: items always hired together and priced as one (a DJ set). Case: a flight case holding units; scanning the case scans what is inside.',
    'min-stock': 'When stock falls below this number, the item is shown as low. Example: 10 for spare batteries.',
    'replacement-value': 'What it would cost to buy again today. Used for insurance and for charging lost or broken gear.',
    depreciation: 'Over how many months the purchase price goes down to zero on paper. Example: 60 = five years.',
    'inspection-interval': 'How often this equipment needs a safety check, such as electrical testing (PAT). You get a reminder when it is due.',
    'unit-status': 'Available: can go to gigs. In repair: not available until fixed. Lost and Retired take the unit out of stock.',
    'cross-hire-code': 'If your supplier also uses AVX, ask for their code. Requests then go straight to them and they confirm in AVX.',
    factor: 'How many day prices this line costs for the whole phase. Example: 3 days at factor 2.5 costs 2.5 × the day price.',
    discount: 'A percentage taken off this phase’s total, before VAT.',
    vat: 'The tax rate added to the quote’s total. Example: 23 for mainland Portugal.',
    validity: 'How many days a new quote stays valid. After that the client can still read it but no longer accept it.',
    'call-time': 'When this person must arrive. It shows on the call sheet and in their phone.',
    'booking-times': 'The hours this person is booked for. Without them, they count as busy for the gig’s whole days, and short jobs on the same day would look like a clash.',
    'gig-status': 'Draft: still being planned. Confirmed: going ahead. Active: happening now. Done: finished. Archived: kept but hidden from the lists.',
    'gig-role': 'PM: changes everything on the gig. Crew: sees it, its files and schedule, and writes in the chat. Viewer: reads only.',
    'org-role': 'Admin: everything, including members and settings. Member: gigs, files and quotes. Viewer: sees the gigs, without quotes or prices.',
    findable: 'Who can find you by name when building a crew. Only people you already worked with, never everyone on AVX.',
    'email-summary': 'One email a day with what you haven’t read in the app. Nothing is sent when you are up to date.',
    'two-step': 'Signing in will also ask for a 6-digit code from an app on your phone. Recommended for admins.',
    'dmx-footprint': 'How many DMX channels one fixture takes in its mode, from its manual (e.g. 14 for a MAC Aura in Extended).',
    'dmx-universe': 'A DMX line of 512 channels. Big rigs use several; each fixture is on one.',
    'sys-temp': 'Sound travels faster in warm air. Use the temperature expected during the show.',
    'sys-haas': 'How much later than the main a delay or fill should arrive, so the sound still seems to come from the stage. 5–15 ms is usual.',
    'sys-y': 'Metres from the front edge of the stage: negative into the audience (e.g. −25 for a position 25 m out), positive towards the back.',
    'sys-spl': 'The loudest one box can play at 1 m, from its data sheet (maximum SPL).',
    'sys-angle': 'How wide the box spreads sound left to right, from its data sheet (e.g. 90° or 110°).',
    'light-trim': 'How high the bar hangs, from the stage floor to the bar, in metres.',
    'light-phase': 'Which phase of the supply feeds this position. Leave it shared and its load is spread evenly over the phases.',
    'light-power': 'The fixture\'s power from its manual or label. It comes from the catalogue item when there is one.',
    'light-supply': 'The limit of the power supply on each phase, e.g. 32 for a 32 A outlet. The plot warns above 80%.',
    'input-item': 'Link the mic or DI to an item in your catalogue. "Add mics and DIs to equipment" then plans them on the gig, so they are booked, packed and scanned.',
    'stage-box': 'Which stage box input the line goes into, e.g. SB1-03 (box 1, input 3). Helps the stage crew patch it.',
    'mark-lost': 'Records the units that did not come back as lost. Stock and reports change. If one turns up later, set its status back to Available.',
    'quote-client': 'Picking a client fills in their details from Contacts. The quote keeps its own copy, so you can still change them here for this quote only.',
  },

  pages: {
    'pocket-tools': { title: 'Pocket tools', summary: 'Calculators for any venue, with or without a gig in AVX: DMX addresses and dipswitches, a block of fixtures, universes and absolute channels, and value conversions. They work offline.' },
    home: { title: 'Gigs', summary: 'The gigs of the company you chose at the top, or all of yours in "My work". Open one to see its crew, schedule, files and chat. The calendar shows the same gigs by date.' },
    gig: { title: 'A gig', summary: 'Everything about one gig, in tabs: overview, crew, schedule, equipment, files, updates and chat. Managers change things; crew see them and can write in the chat.' },
    messages: { title: 'Messages', summary: 'Your conversations: direct messages, gig chats, department channels and the organisation’s channels. Unread ones are at the top. Use the menu on a message to reply, react, save or report it.' },
    inventory: { title: 'Inventory', summary: 'Your equipment: the catalogue, where it is kept, its stock and movements, maintenance and subrentals.' },
    'inventory-item': { title: 'An equipment item', summary: 'One catalogue item: its details, stock per location, units with their labels, kit contents, maintenance and history.' },
    jobs: { title: 'Jobs', summary: 'Open positions from companies on AVX: the ones for your functions and travel range, or all of them, and your applications. Your day rate goes only to the company you apply to.' },
    'org-jobs': { title: 'Job posts', summary: 'The positions your organisation posted to the job board and who applied. Shortlist, decline or offer the place; close a post or mark it filled.' },
    'crew-search': { title: 'Find crew', summary: 'Freelancers on AVX who switched on their crew profile and let companies see it. Search by function, place, dates and language, then ask about a gig or offer a place. Their contact details stay private until they join.' },
    'crew-profile': { title: 'Crew profile', summary: 'Let companies on AVX find you for work. Off until you switch it on; you choose who sees it (companies only, or companies and crew) and can change, switch off or remove it at any time. No rates on it.' },
    contacts: { title: 'Contacts', summary: 'Your clients and suppliers, kept once. Quotes pick their client from here and subrentals their supplier. Import them from a spreadsheet, or add the clients typed on older quotes in one go.' },
    quotes: { title: 'Quotes', summary: 'Your company’s quotes, newest first. Open one to edit it, send it to the client or turn an accepted quote into a gig.' },
    quote: { title: 'A quote', summary: 'Build the quote in phases with lines from your price list. Each send saves a version. The client reads and accepts it through a private link.' },
    orgs: { title: 'Organisations', summary: 'The companies you belong to and your role in each. Admins open the members and settings from here.' },
  },

  // guides: Help → Guides and the ? panel. Steps line up with the screenshots in index.js (GUIDES).
  guides: {
    'crew-join': {
      title: 'Accept an invitation and set your password',
      intro: 'A production manager added you to a gig. Set up your account once, then every gig you are on shows up in one place.',
      steps: [
        'Open the email from AVX and tap the button in it. Use the phone or computer you will use at work.',
        'Type your full name and choose a password of at least 8 characters. Tap Continue.',
        'You are in. "My work" shows your next gig with your call time; "All my gigs" lists every gig you are on, at any company.',
        'Next time, sign in with the same email and password. If you forget it, "Forgot password?" on the sign-in page sends you a link.',
      ],
      mistakes: [
        'The link has expired: go to the sign-in page, tap "Forgot password?" and use the email the invitation was sent to.',
        'You created an account with another email: the gig is not there. Ask the production manager to invite that email instead.',
      ],
    },
    'crew-install': {
      title: 'Install AVX on your phone',
      intro: 'AVX works in the browser, but on the home screen it opens like an app, full screen, and can send you notifications.',
      steps: [
        'iPhone: open AVX in Safari. Tap Share (the square with an arrow), then "Add to Home Screen".',
        'Android: open AVX in Chrome. Tap the menu (three dots), then "Install app" or "Add to home screen".',
        'Open AVX from the new icon on your home screen, and sign in if asked.',
        'For notifications: tap your initials at the top right to open Settings, choose Notifications and turn on "Notifications on this device".',
      ],
      mistakes: [
        'On iPhone, notifications only work when AVX is opened from the home-screen icon, not from Safari.',
        'You tapped "Don\'t allow": allow notifications for AVX in the phone\'s settings, then turn them on again in AVX.',
      ],
    },
    'crew-call-time': {
      title: 'Find your call time and the call sheet',
      intro: 'Your call time is when you must be there. The call sheet has the day\'s plan and everyone\'s phone number.',
      steps: [
        'In "My work", your next gig is at the top, with your call time in green. "Call sheet" opens it straight away; "Open the gig" shows everything else.',
        'On the gig, your call time is under the gig\'s name, in green.',
        'Tap Schedule to see the running order. Tap "Call sheet" for the full sheet.',
        'The call sheet shows the schedule and the crew with their phones. You can print it or save it as a PDF.',
        'Tap "Large print" for bigger type (it prints that way too), or "Read aloud" to hear it with your phone\'s voice. Your own line is marked in yellow.',
      ],
      mistakes: [
        'The call time is when you start work, not when the show starts.',
        'Times can change. Look again the day before; changes to the schedule are also posted in the gig\'s chat.',
      ],
    },
    'crew-calendar': {
      title: 'See your gigs in your phone\'s calendar',
      intro: 'Your gigs can show up in the calendar you already use (Apple, Google or Outlook), next to everything else, without opening AVX.',
      steps: [
        'Open Settings (your initials at the top) and choose "Calendar feed".',
        'Tap "Get my calendar link", then "Add to Apple / Outlook" on an iPhone or Mac, or "Add to Google Calendar" on Android. Your calendar asks to subscribe: say yes.',
        'From then on the gigs you\'re on appear with their venue, your role and call time, and update by themselves (most calendars check every hour or so).',
      ],
      mistakes: [
        'The link is private: anyone who has it sees your gigs\' names, dates and venues. If you shared it by mistake, tap "New link"; the old one stops working.',
        'Changes made in AVX can take an hour or more to show in your calendar. For the latest call time, open the gig in AVX.',
      ],
    },
    'crew-jobs': {
      title: 'Find work on the job board',
      intro: 'Companies on AVX post open positions. Those that fit what you do and how far you travel show up for you.',
      steps: [
        'Switch on your crew profile first (functions, town, travel range). Then open Jobs from the menu.',
        '"For you" shows open jobs that match; "All open jobs" shows every one. Each says the dates, the town, the pay or "Send your day rate".',
        'Tap Apply, write a short message, give your day rate if asked and confirm you\'re free. The company answers in your messages; if they offer the place and you accept, you\'re on the gig.',
      ],
      mistakes: [
        'Your day rate goes only to that company, never on your profile. "My applications" shows where each one stands; you can withdraw while it\'s open.',
        'If nothing shows "For you", widen your travel range or add functions in your crew profile.',
        'New jobs that fit you also arrive as a notification (at most 10 a day). Don\'t want them? Untick "Tell me about new jobs that fit me" in your crew profile.',
      ],
    },
    'crew-rehearsal': {
      title: 'Take notes during a rehearsal',
      intro: 'Everyone on the gig writes notes at the same time, against the same timecode. Afterwards each department has its own list.',
      steps: [
        'Open the gig → Tools → Rehearsal notes. Whoever starts the run taps "New session", names it, and chooses the frame rate and the clock (time of day, or a stopwatch).',
        'Everyone sees the same timecode. When something happens, tap Mark: the time is taken right then. Choose the department and priority, add the cue or song, type or dictate the note, add a photo if it helps, and save.',
        'Notes appear for everyone as they are written. Show only one department, your own ("Mine") or the open ones, and tick a note when it\'s done.',
        'After the run, Report prints the notes per department, and CSV opens in a spreadsheet. Open notes show again in the next session.',
      ],
      mistakes: [
        'The clock is shared: if someone sets it to the show\'s timecode, everyone\'s follows. Set it from the timecode the show actually runs on: "From camera" reads a timecode display through the phone\'s camera, "From LTC" listens to the LTC signal, or type it with "Set the clock".',
        'No connection? Notes are kept on your phone and sent when you\'re back online; photos need a connection.',
      ],
    },
    'pm-tasks': {
      title: 'Give out tasks on a gig',
      intro: 'Who does what by when: one task per job, with a checklist when it has steps.',
      steps: [
        'Open the gig → Tasks → "New task". Write what, choose who it\'s for and the due date, and add a checklist with one item per line. The person gets a notification.',
        'Tap a task to see its notes and checklist. Anyone on the gig can tick the checklist and the task; overdue tasks are marked in red. "Mine" and "Open" filter the list.',
        'From a rehearsal note, the list icon makes it a task for the same person. Everyone sees their own tasks, from every gig, in My work → My tasks.',
      ],
      mistakes: [
        'Only the gig\'s managers and the organisation\'s admins and members create and change tasks; crew tick them.',
        'Tasks can only be given to people on the gig. Add them to the crew first.',
      ],
    },
    'crew-onsite': {
      title: 'Use On-site mode on the day',
      intro: 'On the days of a gig, the gig opens on what you need there and then, in big buttons.',
      steps: [
        'On a gig day, open the gig: it starts in On-site mode by itself. On any other day, tap "On-site mode" on the gig to switch it on.',
        'At the top: your call time and today\'s schedule, with what\'s happening now and next. Below, big buttons for the call sheet, rehearsal notes, walking the rig, the input list, scanning equipment, files, chat and the crew\'s phones.',
        '"Full gig view" goes back to the usual overview for the rest of the day. All the tabs are always there.',
      ],
      mistakes: [
        'Don\'t want it to switch on by itself? Untick "Switch to On-site mode on gig days" in Settings → Language and appearance. It is kept on each device.',
        'Open the gig once before you get to the venue, so it is saved on your phone for when there is no signal.',
      ],
    },
    'crew-dmx-calc': {
      title: 'Set a fixture\'s DMX address with its dipswitches',
      intro: 'Many fixtures take their address from a row of small switches. AVX shows which ones to flip.',
      steps: [
        'Open My work → Pocket tools (no gig needed), or a gig\'s DMX patch. Under "How my fixtures show the switches", choose what your fixture\'s label shows: which way is ON, and which side switch 1 is on.',
        'Type the address: the switches to turn ON light up, drawn as the fixture shows them. Tapping switches works the other way round. Below, "Address a row of fixtures" lists every address and its switches for a block of the same fixture.',
        'On site, in the gig\'s DMX patch tap "Walk the rig": one fixture at a time, grouped by position, with big switches and "Next fixture". It works without a connection.',
      ],
      mistakes: [
        'Dipswitches only reach address 511. Fixtures above it need their menu instead.',
        'Some fixtures have a 10th switch for a function (not part of the address): choose 10 switches and leave it alone.',
      ],
    },
    'crew-trust': {
      title: 'Show your certificates are real, and choose who can contact you',
      intro: 'Companies trust a certificate more when someone has checked it. You also decide which companies can reach you.',
      steps: [
        'In your crew profile, save your certificates. Under each one, "Upload proof" sends a photo or PDF of it to AVX; once checked, companies see "proof checked by AVX". Only AVX sees the file.',
        'A company that has had you on one of its gigs can confirm a certificate too: it then shows "confirmed by" that company.',
        'Under "Who can contact you about work", choose "Only companies I\'ve worked with" if you don\'t want new companies to write to you. You can still apply to their jobs.',
      ],
      mistakes: [
        'Changing a certificate\'s name or expiry date removes its confirmations and checks: they were for the certificate as it was.',
        'See a fake profile or a dodgy job? Tap Report under it. You stop seeing it at once and AVX looks into it; nobody is told who reported.',
      ],
    },
    'crew-profile': {
      title: 'Get found for work with your crew profile',
      intro: 'Companies on AVX can find you by what you do, where you are and the languages you speak. It stays off until you switch it on.',
      steps: [
        'Open Settings (your initials at the top), choose Profile and tap "Open your crew profile".',
        'Pick what you do, type your town and tap Find to choose it, then say how far you travel and which languages you work in. Add certificates and links if you like.',
        'Choose who can see it (companies only, or companies and crew), tick "Let people find my profile" and save. The preview at the bottom shows what they\'ll see.',
      ],
      mistakes: [
        'Don\'t put rates on your profile: you give a day rate only when you answer a company.',
        'Only your town is kept, not your address. To hide your profile again, untick it and save; "Remove my crew profile" clears it completely.',
      ],
    },
    'crew-unavailable': {
      title: 'Mark the dates you can\'t work',
      intro: 'Holidays, another job, a doctor\'s appointment: mark them once and production managers are warned before booking you.',
      steps: [
        'In "My work", open Availability. On a phone, it is under More.',
        'Under "Unavailable dates", choose the first day in From. If it is more than one day, choose the last day in To. Add a note for yourself if you like.',
        'Tap "Add dates". To remove dates later, tap the × next to them.',
      ],
      mistakes: [
        'Production managers don\'t see your note or the reason, only that you are not available. They can still add you, but they are advised to talk to you first.',
      ],
    },
    'crew-availability': {
      title: 'Answer an availability question',
      intro: 'Before booking you, a production manager can ask whether you are free. Answering takes one tap.',
      steps: [
        'You get a notification: someone asks if you are available for a gig.',
        'In "My work", the questions are at the top. Add a note if needed (for example "only from 10:00"), then tap Available or Not available.',
        'The question also appears in your messages with that person, and you can answer there too.',
      ],
      mistakes: [
        'Answering "Available" doesn\'t book you yet. You are booked when the production manager adds you to the gig.',
        'A crew call is different: it offers you a place, and the first people to accept get it.',
      ],
    },
    'crew-chat': {
      title: 'Chat with the team',
      intro: 'Every gig has its own chat for everyone on it. You can also write to one person directly.',
      steps: [
        'Tap the speech bubble at the top to open Messages. Conversations with unread messages come first.',
        'Open the gig\'s chat. Write in the box at the bottom and tap Send. The clip attaches photos and files; type @ to mention someone.',
        'Open the menu on a message to reply, react, save or report it.',
        'Too many notifications? Mute a conversation from its menu. You still see its messages when you open it.',
      ],
      mistakes: [
        'Everyone on the gig reads the gig chat. For something private, send a direct message.',
        'Without signal, messages wait on your phone and are sent when you are back online.',
      ],
    },
    'crew-damage': {
      title: 'Report damaged equipment',
      intro: 'Something broke on site? Tell the warehouse straight away, so it is repaired before the next job.',
      steps: [
        'In "My work", tap "Report damage" on your next gig. For another gig, open it, tap Equipment, then "Report damage".',
        'Choose the item. For gear with its own label, type the code from the label. For cables and other counted items, say how many.',
        'Say what is wrong and add a photo if you can. Tap Send. The organisation\'s admins are notified.',
      ],
      mistakes: [
        'Report it even if it looks small. A loose connector today is a dead channel at the next show.',
        'Don\'t keep using equipment that is unsafe, especially anything on mains power.',
      ],
    },
    'crew-appearance': {
      title: 'Make AVX easier to read',
      intro: 'Bright sun, small screen, tired eyes: change how AVX looks on this phone or computer.',
      steps: [
        'Tap your initials at the top right to open Settings, then choose "Language and appearance".',
        'Under Appearance, choose the theme: Light for sunlight, High contrast for the strongest difference, or Like the device. Choose the text size too.',
        'Turn on Comfortable mode for bigger buttons (with gloves, on the move), and the easy-to-read font if letters blur together. Simple mode shows only your next gig and what you need for it; it is on by itself for crew.',
      ],
      mistakes: [
        'These choices are saved on each device. Set them again on your other phone or computer.',
      ],
    },
    'crew-offline': {
      title: 'Use AVX without signal',
      intro: 'Venues and basements often have no signal. Prepare before you go and the gig stays on your phone.',
      steps: [
        'While you still have signal, open the gig. AVX keeps a copy on this phone.',
        'Open Assets and tap "Save all files offline" to keep the riders, plans and other files too.',
        'Without signal, a bar at the top says you are offline and AVX shows the saved copy.',
        'Messages you write offline are sent when you are back online. Other changes need a connection.',
      ],
      mistakes: [
        'A gig you never opened on this phone is not saved. Open it once before you leave.',
        'Files are saved one by one on each phone. Saving them on your computer doesn\'t save them on your phone.',
      ],
    },
    'pm-create-gig': {
      title: 'Create a gig',
      intro: 'A gig holds everything about one job: crew, schedule, equipment, files and chat.',
      steps: [
        'At the top, choose the company the gig belongs to.',
        'Tap "New gig" (on a phone, under More). Type the name and venue, and choose the start and end dates.',
        'Choose the status: Draft while it is not certain, Confirmed when it is happening. Tap "Create gig", then add crew, schedule and equipment.',
      ],
      mistakes: [
        'Without dates, AVX can\'t warn about double bookings or check whether there is enough equipment.',
        'If the client accepted a quote, open the gig and use "Fill gig from quote" to add the schedule, positions and equipment in one go.',
      ],
    },
    'pm-post-job': {
      title: 'Post a job and choose who to take',
      intro: 'Need people you don\'t know yet? Post the position: freelancers on AVX who fit it see it and apply.',
      steps: [
        'On the gig\'s Crew tab, tap "Post a job" (or Organisation → Job posts). Pick the crew position or write a title, the function, the town and the pay ("Ask for their day rate" or a stated fee). You need two-step sign-in on.',
        'Applications arrive in your messages and in Job posts → Applicants, with each person\'s crew profile, message and rate.',
        'Shortlist, decline (with a polite note) or "Offer the place": if they accept, they join the gig with that function and the post closes when every place is taken.',
      ],
      mistakes: [
        'The post doesn\'t show the gig\'s name or client, only your organisation, the dates and the town. Close it if plans change.',
        'Until your organisation is verified it can have 3 open posts at a time. An admin verifies it in the organisation settings → Verification.',
      ],
    },
    'pm-find-crew': {
      title: 'Find crew you haven\'t worked with yet',
      intro: 'Short of a rigger in Porto next Saturday? Search the freelancers on AVX who made their profile visible to companies.',
      steps: [
        'Open the gig\'s Crew tab and tap "Find crew" (or Organisation → Find crew). The gig\'s dates are filled in.',
        'Choose a function, type the venue\'s town and tap Find, pick the distance and tick "Only people free on these dates" if you like. Tap Search.',
        'On a result, tap "Ask if free" to check their dates, or "Offer a place" to offer them the job. The answer arrives in your messages; if they accept an offer, they join the gig.',
      ],
      mistakes: [
        'Rates aren\'t on profiles: agree the fee in the messages. Their e-mail and phone are shared only once they join your gig.',
        'Searches and first contacts are limited each day to stop misuse. People you\'ve worked with before are always easy to reach from the gig\'s invite form.',
        'Looking for the same kind of person often? Tap "Save this search" and keep its alert on: you\'re told when someone who fits switches on their profile. Saved searches show above the form for everyone in the organisation.',
      ],
    },
    'pm-invite-crew': {
      title: 'Invite crew',
      intro: 'Add people to a gig so they see its schedule, files and chat. Anyone can be invited by email.',
      steps: [
        'Open the gig, tap Crew, then "Invite crew".',
        'Search people you have worked with, or type an email address.',
        'Write their function (for example "FOH engineer"), choose the access level (Crew for most people) and their call time. Tap "Add to gig".',
        'People without an account get an email and show as pending until they sign up. To offer one place to several people at once, use "Crew call".',
      ],
      mistakes: [
        'Production manager access lets someone change everything on the gig. Give it only to people who run it with you.',
        'A warning sign next to someone means they are already booked or unavailable at that time. Ask them first.',
      ],
    },
    'pm-schedule': {
      title: 'Build the schedule',
      intro: 'The schedule is the running order everyone on the gig sees: load-in, soundcheck, doors, show, load-out.',
      steps: [
        'Open the gig, tap Schedule, then "Add item".',
        'Write what happens, choose the day, the start and end times and where. Add notes if needed, and save.',
        'Everyone on the gig sees the schedule at once, and changes are posted in the gig\'s chat.',
      ],
      mistakes: [
        'The schedule is for the whole gig. Each person\'s own start time is their call time, set in Crew.',
      ],
    },
    'pm-call-sheet': {
      title: 'Prepare and send the call sheet',
      intro: 'The call sheet puts the schedule, the crew, their call times and their phones on one page.',
      steps: [
        'Fill in the schedule and each person\'s call time first.',
        'Open the gig, tap Schedule, then "Call sheet".',
        'Tap "Send to the crew" to post it in the gig\'s chat, or "Print / Save as PDF".',
        'In the gig\'s chat, see who has confirmed reading it.',
      ],
      mistakes: [
        'Phone numbers appear only for people who added one in their account.',
        'If the schedule changes after you send it, send it again so everyone confirms the new version.',
      ],
    },
    'pm-double-booking': {
      title: 'Avoid double bookings',
      intro: 'AVX warns when someone is already booked or has marked the dates as unavailable. Nothing is blocked; you decide.',
      steps: [
        'In Crew, a warning sign next to a person means they are booked elsewhere or unavailable at the same time.',
        'Before adding someone, tap "Ask availability". They answer available or not available, with a note.',
        'If someone is needed only part of the day, set their booking times ("Set times") so short jobs on the same day don\'t clash.',
        'Your own clashes show as "Double booking" on your gigs.',
      ],
      mistakes: [
        'Asking doesn\'t book anyone. Add them to the gig when they say yes.',
        'Without booking times, a person counts as booked for the whole of each gig day.',
      ],
    },
    'pm-patch': {
      title: 'Patch the stage boxes',
      intro: 'The patch says which stage box socket each input line goes into, so the stage crew can plug in and the desk gets the right channel.',
      steps: [
        'Make the input list first. Then in Tools, "Add a tool" → Patch.',
        'Tap "Add stage box" for each box (SB1, SB2…), set its number of inputs, and tick "Split to monitors" if it also feeds the monitor desk.',
        'For each socket, choose the line that goes there, or tap "Fill the free sockets" to place the remaining lines in channel order.',
        'Print the patch for the stage. The socket also shows on the input list, in the Stage box column.',
      ],
      mistakes: [
        'Two lines in one socket are flagged in orange: choose one of them for that socket.',
        'Removing a stage box doesn\'t delete lines: they go back to "without a socket".',
      ],
    },
    'pm-dmx': {
      title: 'Make the DMX patch',
      intro: 'The DMX patch gives every lighting fixture a universe and an address, so each one answers the desk without clashing with another.',
      steps: [
        'In Tools, "Add a tool" → DMX patch, then "Add fixtures".',
        'Choose the type (or an item from your catalogue), its mode and how many channels it takes, how many you have, and the universe. Each one gets the next free address.',
        'Check the list per universe: the range on the left is the channels each fixture uses. Overlaps are flagged in orange.',
        'Print it for the lighting crew, who set each fixture\'s address on site. "Add to equipment" plans the linked fixtures on the gig.',
      ],
      mistakes: [
        '"Readdress in order" gives new addresses to a whole universe: only use it before the fixtures are set up.',
        'The number of channels depends on the mode: check the fixture\'s manual.',
      ],
    },
    'pm-system-calc': {
      title: 'Work out the PA delays',
      intro: 'The sound system calculator estimates the delay for each delay tower, fill and sub, the level at each listening position, and how wide each source covers, from where everything is.',
      steps: [
        'In Tools, "Add a tool" → Sound system calculator. Set the air temperature and the Haas offset.',
        'Add the sources: mains, subs, delays and fills. For each one give its place (across, front/back, height), its maximum SPL and horizontal angle from the data sheet, and how many boxes.',
        'Add the listening positions, FOH first: it is the reference the subs are lined up to. Then the back of the room and anywhere you worry about.',
        'Read the delay on each source and the checks at each position: a delay arriving before its main, or more than 30 ms after it, is flagged. Print it for the system tech, then measure on site.',
      ],
      mistakes: [
        'These are estimates without reflections, with every box aimed straight at the audience: always confirm with a measurement system.',
        'Front/back is negative into the audience: a delay tower 30 m out is at −30.',
      ],
    },
    'pm-light-plot': {
      title: 'Draw the light plot',
      intro: 'The light plot shows the trusses, pipes and floor positions over the stage, with each fixture from the DMX patch hanging on them, and adds up the power per phase.',
      steps: [
        'In Tools, "Add a tool" → Light plot. Under "Add a position", add a truss or pipe for each bar; drag it into place and set its name, length and trim height.',
        'Select a bar and tap "Add fixtures here": they go into the DMX patch on free addresses and hang on that bar, spaced evenly. Fixtures already in the DMX patch can be hung from the "not on the plot" list.',
        'Drag a fixture to move it along its bar, or onto another bar. Each one shows its universe/address underneath.',
        'Set the supply (phases and amps) and give each bar a phase: the power section shows the load on each phase, as an estimate. Print the plot for the crew.',
      ],
      mistakes: [
        'Power is an estimate from the fixtures\' figures: fixtures without one count as 0 W. Check the real supply with the electrician.',
        'Removing a position doesn\'t delete its fixtures: they go to "not on the plot" (and stay in the DMX patch).',
      ],
    },
    'pm-stage-plot': {
      title: 'Draw the stage plot',
      intro: 'The stage plot shows where everything goes on stage. The drums, mics, amps and DIs you place become the channels of the input list.',
      steps: [
        'Open the gig, tap Tools, "Add a tool" and choose Stage plot. Set the stage\'s width and depth.',
        'Under "Add to the stage", tap what you need: drum kit, vocal mic, amps, keyboard, monitors, a riser. Drag each one into place, or select it and use the arrow buttons; Rotate turns it.',
        'Give things a name ("Ana", "Lead") so the crew know whose is whose. The list under the drawing says where each one is.',
        'Tap "Send to the input list": every channel the plot needs is added, numbered after the ones already there. Print the plot for the stage and the venue.',
      ],
      mistakes: [
        'The audience is at the bottom of the drawing, as on most riders: "left" is stage left as the audience sees it.',
        'Sending again only adds channels that are new; it never changes the ones already on the input list.',
      ],
    },
    'pm-input-list': {
      title: 'Make the input list',
      intro: 'The input list tells the sound team what goes into each channel of the desk. Everyone on the gig can read it on their phone, even without signal.',
      steps: [
        'Open the gig, tap Tools, then "Add a tool" and choose Input list.',
        'Tap "Add input" for each channel: the source (Kick in, Lead vocal), the mic or DI, the stand, the stage box input, and tick 48V if it needs phantom power.',
        'Use the arrows to change the order; the channels are renumbered for you. Print it for the desk and the stage.',
        'On site, tick each line as it\'s checked. If the mics come from your catalogue, "Add mics and DIs to equipment" plans them on the gig.',
      ],
      mistakes: [
        'Two lines can\'t share a channel. Move one first, or pick a free number.',
        'Crew can read the list but not change it: ask the production manager.',
      ],
    },
    'pm-equipment': {
      title: 'Plan the equipment',
      intro: 'List the gear the gig needs. AVX books it for the dates and tells you if there is not enough.',
      steps: [
        'Open the gig, tap Equipment, then "Add equipment".',
        'Tick the items and set the quantities. Each shows how many are free for the gig\'s dates, plus the prep and return days.',
        'If an item is short, hire it in, swap it for an alternative or change the quantity. Nothing is blocked.',
        'If the gig comes from an accepted quote, "Fill gig from quote" adds its equipment for you.',
      ],
      mistakes: [
        'Changing the gig\'s dates changes the equipment booking too. Check the Equipment tab again afterwards.',
      ],
    },
    'wh-import': {
      title: 'Import your equipment from a spreadsheet or another tool',
      intro: 'Bring your locations, catalogue, serial numbers and kits into AVX in one go, from an Excel or CSV export (Rentman, another rental tool or a spreadsheet), instead of typing them in.',
      steps: [
        'In Inventory, tap Import. Import in this order: locations, then equipment, then units (serial numbers), then kit contents, because each one refers to the ones before.',
        'Choose what you are importing, then choose the file (Excel .xlsx or CSV; from Excel the first sheet is read) or paste the rows from your spreadsheet (with their headings).',
        'AVX guesses what each column is, also from Dutch or Portuguese headings. Check the guesses and change any that are wrong. Save the matching with a name ("Rentman equipment export") so the next file needs none.',
        'The check shows what will be new, what matches what is already in AVX, and which rows have problems (they are left out). Import, then read the report. Fix the skipped rows in the file and import it again: what is already in AVX is matched, not doubled.',
      ],
      mistakes: [
        'Old Excel files (.xls) and other spreadsheet formats have to be saved as .xlsx or CSV first, or copy the rows and paste them.',
        'An import can be undone from "Earlier imports" only while nothing has used what it added (a gig, a scan, a kit). Undoing removes what it added for good.',
      ],
    },
    'wh-locations': {
      title: 'Set up locations',
      intro: 'Locations are where equipment is kept: warehouses, vans, venues. Stock is always counted per location.',
      steps: [
        'Open Inventory → Locations and tap "Add location".',
        'Type the name, choose the kind (warehouse, vehicle, site / venue, other) and add the address if useful.',
        'To move stock between locations, open the item and use Move. Every change is recorded in Movements.',
      ],
      mistakes: [
        'Locations are archived, not deleted, so their history stays complete. Archive one only when nothing is kept there any more.',
      ],
    },
    'wh-units-labels': {
      title: 'Add units and print QR labels',
      intro: 'For equipment tracked one by one, each unit has its own serial number, QR code and status.',
      steps: [
        'Open the item in the catalogue and tap "Add units". Paste the serial numbers, one per line, and add purchase details if you have them.',
        'Tick the units you want labels for, or open Inventory → QR labels for everything.',
        'Choose the label size and tap Print. Stick each label on its unit; scanning it later opens the unit in AVX.',
      ],
      mistakes: [
        'Items counted in bulk (cables, clamps) have one label for the item, not one per piece.',
        'Print a test page on plain paper first and check that the labels line up with your sheets.',
      ],
    },
    'wh-scan': {
      title: 'Scan equipment out to a gig',
      intro: 'Scanning out records exactly what left the warehouse for each gig, so nothing is forgotten on the way back.',
      steps: [
        'Open the gig, tap Equipment, then "Packing list" to prepare everything planned.',
        'Tap "Scan out / in" and choose "Out to the gig". Scan each label with the camera, or type the code. For bulk items, set the quantity first.',
        'Watch the progress ("Packed 32 of 40"). A case scans everything packed inside it.',
        'In the van or the dark, tap "Scan mode": the whole screen becomes big buttons, the camera and the last scan in large type. Each scan beeps and buzzes: one high beep is fine, two beeps is a warning, a low buzz is a problem. The torch button lights the label (on Android phones).',
      ],
      mistakes: [
        'Removed something by mistake? Most removals show "Undo" for a few seconds before anything is deleted.',
        'AVX warns when something isn\'t planned for the gig or is more than planned. It still records it, so check the warning.',
        'A USB or Bluetooth barcode scanner works too: it types the code and presses Enter for you.',
      ],
    },
    'wh-steps': {
      title: 'Follow equipment step by step',
      intro: 'Between the warehouse and back, equipment goes through steps: prepped, out (loaded), on site, loaded back, back in and checked in. Each scan moves it one step on, so everyone can see where the gear is.',
      steps: [
        'In "Scan out / in", choose the step at the top, then scan. "Out (loaded)" and "Back in" are the scans out and in; the others only record the step. A case brings everything packed in it.',
        'The gig\'s Equipment tab shows a bar per step ("66 of 69 out").',
        'The packing list shows how far each line has got, in the Step column.',
        'An admin chooses the steps the company uses in the organisation\'s settings. A small team may only use out and back in.',
      ],
      mistakes: [
        'Scanned the wrong thing? Press Undo on that scan. It works for your own scans for 15 minutes, and not for a damaged return (that one opened a repair).',
        'A step you skip is filled in by the later ones: a unit scanned back in counts as having been out.',
      ],
    },
    'wh-returns': {
      title: 'Check equipment back in',
      intro: 'When the gig comes back, scanning in shows what returned, what is missing and what came back damaged.',
      steps: [
        'Open the gig\'s "Scan out / in", choose "Back in" and scan everything that returned.',
        'If something came back damaged, tick "Came back damaged" before scanning it. It goes to repair and the warehouse is notified.',
        'Units still out are listed at the end. If they are really gone, mark them as lost.',
      ],
      mistakes: [
        'Don\'t mark units as lost on the first day: they may still be in a van. If one turns up later, scanning it in puts it back in stock.',
      ],
    },
    'wh-repairs': {
      title: 'Repairs and inspections',
      intro: 'Keep track of what is broken, what is being fixed and which units are due for an inspection (PAT, rigging).',
      steps: [
        'Open Inventory → Maintenance. Open repairs, damage reports from crew and inspections due are all here.',
        'Tap "New repair" to record a fault. Follow it from reported to in repair, and close it as repaired or written off, with the cost.',
        'For an inspection, tap "Record inspection" on the unit and choose Pass or Fail.',
      ],
      mistakes: [
        'A failed inspection opens a repair and takes the unit out of use until it is repaired.',
        'Writing off a unit is permanent for its history. Use it only when the unit will never come back.',
      ],
    },
    'wh-subrentals': {
      title: 'Hire in equipment (subrentals)',
      intro: 'When you are short, hire equipment from another company and AVX counts it as stock for those dates.',
      steps: [
        'Open Inventory → Subrentals and tap "New subrental".',
        'Choose the supplier (or add a new one), the gig and the dates. Under "What you\'re hiring", add the lines, linked to your catalogue items.',
        'Move it from draft to requested and then confirmed as the supplier answers.',
        'If the supplier also uses AVX, link them with their cross-hire code and send the request straight to them.',
      ],
      mistakes: [
        'A subrental counts as stock only for the dates it covers completely.',
        'Lines not linked to a catalogue item don\'t count in availability.',
      ],
    },
    'wh-reports': {
      title: 'Read the inventory reports',
      intro: 'See which equipment earns its keep: use, revenue, repair costs and book value per item.',
      steps: [
        'Open Inventory → Reports and choose the period.',
        'The tiles at the top sum up revenue, book value, repairs, losses and hire-in costs. The table shows each item.',
        '"Not used in this period" lists items to sell, rent out or stop buying. "Download CSV" opens it in a spreadsheet.',
      ],
      mistakes: [
        'Use counts only confirmed gigs. Revenue comes from accepted quotes; check "How it\'s counted" at the bottom.',
      ],
    },
    'of-company': {
      title: 'Set up your company details',
      intro: 'Your details are printed at the top of every quote. Set them once; new quotes use them.',
      steps: [
        'Open Quotes → Company details (only admins can change them).',
        'Fill in the legal name, VAT number, address, phone and website, the default VAT and how long quotes are valid.',
        'Write your default terms and conditions, then save.',
      ],
      mistakes: [
        'Changes apply to new quotes. Quotes you already sent keep the details they were sent with.',
      ],
    },
    'of-price-list': {
      title: 'Build your price list',
      intro: 'The price list holds what you quote often (equipment, crew rates, transport) with its usual price.',
      steps: [
        'Open Quotes → Price list and tap "Add item", or "Import list" to paste many at once from a spreadsheet.',
        'Give each one a name, a price without VAT, a category, a type and a unit (day, hour, km).',
        'In a quote, "From price list" adds the items you tick as lines.',
      ],
      mistakes: [
        'Changing a price affects new lines only. Quotes that already use the item keep their price.',
      ],
    },
    'of-contacts': {
      title: 'Keep your clients and suppliers in Contacts',
      intro: 'Type a client once and pick them on every quote. Suppliers live here too, for subrentals.',
      steps: [
        'Open Contacts (in the Quotes menu). Clients and Suppliers each have a tab. Tap "New client" to add one: the company or name, the contact person, e-mail, phone, tax number and address.',
        'Moving from another tool or a spreadsheet? Tap Import and bring them in from the export. Already have quotes? "Add them to contacts" turns the clients typed on them into contacts and links those quotes.',
        'On a quote, in Details, pick the client from "Client from contacts": their details are filled in. A client typed by hand can be kept with "Save to contacts".',
        'Open a client to see their quotes. Archive the ones you no longer work with: they stay on old quotes but leave the lists.',
      ],
      mistakes: [
        'Changing a client in Contacts doesn\'t change quotes already made: each quote keeps the details it was sent with. Pick the client again on a draft to refresh them.',
        'Two contacts with the same name are told apart by their tax number or e-mail when importing. Add the tax number to avoid doubles.',
      ],
    },
    'of-import-jobs': {
      title: 'Bring over your upcoming jobs and open quotes',
      intro: 'Import the jobs you still have to do, the equipment planned on them and the quotes you are waiting on, from your old tool\'s exports. Past jobs stay in the old tool\'s export as an archive.',
      steps: [
        'Import your equipment catalogue first (Inventory → Import). Then, in the same place, choose Upcoming jobs and the jobs export: each job becomes a gig with its dates, venue and status.',
        'The check shows which jobs are new, which match gigs already in AVX (by the job number) and which are left out: past jobs, cancelled ones, or ones without a start date.',
        'Next, Equipment on jobs: one row per line, with the job number and the item code. It books the gear for the gig\'s dates. Then check each gig\'s Equipment tab for anything double-booked.',
        'Open quotes: one row per quote line with the quote number. Each becomes a draft quote; open it to check the client, prices and dates before sending.',
      ],
      mistakes: [
        'Import the same file again after changes in your old tool: gigs and quotes are matched by their number, so they are updated, not doubled. A quote already sent from AVX is left as it is.',
        'Sets aren\'t planned on a gig directly: plan their contents, as AVX does when you add a set by hand.',
      ],
    },
    'of-build-quote': {
      title: 'Build a quote in phases',
      intro: 'Split a quote into phases (load-in, show days, breakdown), each with sections and priced lines.',
      steps: [
        'Open Quotes, tap "New quote", type the title and the client, and start blank or from a template.',
        'Name the first phase and set its dates. Add sections (Audio, Lighting, Crew) and lines, from the price list or typed.',
        'Use the factor for days or hours (3 days = factor 3) and a discount per line, per phase or on the total.',
        'In Details, check the client, the VAT and the validity. "Preview & print" shows what the client will see.',
      ],
      mistakes: [
        'An optional phase is priced separately and is not in the total. Use it for extras the client may add.',
        'The quote saves by itself. If someone else edits it at the same time, AVX asks you to reload.',
      ],
    },
    'of-versions': {
      title: 'Keep versions of a quote',
      intro: 'A version is a frozen copy of the quote as the client would see it. Go back to one at any time.',
      steps: [
        'Before a big change, open the quote and tap Versions.',
        'Add a note (for example "Before cutting the LED wall") and tap "Save version". Every quote you send is saved as a version too.',
        'To go back, open a version with View, then Restore. What you have now is saved as a new version first.',
      ],
      mistakes: [
        'Restoring replaces the whole quote, not one line. Copy the lines you want to keep before restoring.',
      ],
    },
    'of-send-quote': {
      title: 'Send a quote to the client',
      intro: 'The client gets a private link to the quote, where they can print it and accept or decline.',
      steps: [
        'Check the quote with "Preview & print".',
        'Tap "Send to client", type their email and tap "Send quote". To send the link yourself, untick the email and tap "Create link".',
        'You are notified when the client accepts or declines. The client can also write to you from the quote\'s page.',
      ],
      mistakes: [
        'The link is shown only once. If you lose it, send the quote again; that replaces the old link.',
        'The client sees the quote as it was when you sent it. After changes, send it again.',
      ],
    },
    'of-quote-to-gig': {
      title: 'From accepted quote to gig',
      intro: 'Once the client accepts, turn the quote into a gig with its schedule, crew positions and equipment.',
      steps: [
        'Open the accepted quote and tap "Create gig". The gig gets the quote\'s title, its dates and the client\'s name, and stays linked to the quote.',
        'AVX then offers to fill the gig (later: "Fill gig from quote"). Untick anything you don\'t want, or change titles and numbers.',
        'Tap "Add to the gig": the phases become schedule items, the crew lines become positions to fill and the catalogue lines become planned equipment.',
      ],
      mistakes: [
        'Optional phases the client didn\'t take are left out. Add them by hand if they were accepted later.',
      ],
    },
    'ad-members': {
      title: 'Organisation members and roles',
      intro: 'Members see all the organisation\'s gigs. Crew added to a single gig don\'t need to be members.',
      steps: [
        'Open Members (on a phone, under More).',
        'Type an email, choose the role and tap Invite. Admin: everything, including members and settings. Member: gigs, files and quotes. Viewer: sees the gigs, no quotes or prices.',
        'Change a role with the list next to each person, or remove them with ×.',
      ],
      mistakes: [
        'Keep at least two admins, so the company is never locked out if one leaves.',
        'Viewers never see prices. Use Viewer for clients or partners who only need the schedule.',
      ],
    },
    'ad-import-crew': {
      title: 'Bring your crew over from another tool',
      intro: 'Import your people from a spreadsheet or another tool\'s export. They wait as invitations until you send them, so nobody is e-mailed by surprise.',
      steps: [
        'In Members, tap "Import your crew from a file" (or Inventory → Import → Crew). Choose the file: one row per person, with at least an e-mail address.',
        'Check the guessed columns: name (or first and last name), phone, functions and role. Roles are read as admin, member or viewer; freelancers and crew become viewers.',
        'Back in Members, the imported people are listed as not invited yet. Check each role, select who to invite and tap Send. Discard anyone you don\'t want.',
      ],
      mistakes: [
        'A viewer sees all the company\'s gigs. For a freelancer you only book now and then, discard the import and add them to a gig by e-mail instead.',
        'People who are already members or already invited are left out. An invitation that couldn\'t be sent stays in the list to try again.',
      ],
    },
    'ad-verify-company': {
      title: 'Verify your company',
      intro: 'A verified company gets a badge on its job posts, so freelancers know it\'s real, and can have more than 3 open at a time.',
      steps: [
        'Open the organisation\'s settings (admins only) and find Verification.',
        'In the EU: choose the country, type the VAT number and tap "Check with VIES". The EU\'s service answers at once; if the number is valid the company is verified straight away, with the name VIES holds shown next to the badge.',
        'Outside the EU, or if VIES can\'t confirm it: write how AVX can check the company (registration number, website) and send it. The answer appears in the same place.',
      ],
      mistakes: [
        'VIES sometimes doesn\'t answer for a while. Try again later; there are 5 checks a day.',
        'If several people report your job posts, posting pauses until AVX has looked; your posts are hidden meanwhile.',
      ],
    },
    'ad-org-export': {
      title: 'Download all your organisation\'s data',
      intro: 'Keep a copy of everything, or take it to another tool. Nothing locks you in.',
      steps: [
        'Open the organisation\'s settings and scroll to "Your organisation\'s data". Only admins see it.',
        'Tap "Download everything (zip)". It gathers each kind of record in turn; keep the window open until the zip downloads.',
        'Open the zip: one spreadsheet (CSV) file per kind of record, numbered in the order another tool needs them, plus the messages and a README that explains the files.',
      ],
      mistakes: [
        'The files hold your clients\' and team\'s personal details. Keep them somewhere safe and delete them when you no longer need them.',
        'Uploaded files such as riders and photos are listed, not included. Download those from each gig.',
      ],
    },
    'ad-mute': {
      title: 'Mute an organisation or a conversation',
      intro: 'Work for several companies? Mute the ones you don\'t need to follow closely.',
      steps: [
        'Open Organisations and tap the bell next to a company to mute it: no unread badge and no email summary for it.',
        'To quiet one conversation instead, open it and tap the bell at the top ("Mute this conversation").',
        'Questions sent to you (availability, crew calls) still come through when muted.',
      ],
      mistakes: [
        'Muting is only for you. Everyone else in the organisation still gets their notifications.',
      ],
    },
    'ad-delete': {
      title: 'Delete safely',
      intro: 'Deleting in AVX is permanent: there is no trash. Most of the time, archiving is the better choice.',
      steps: [
        'For a gig that is over, set its status to Archived instead: it leaves the lists and keeps its history.',
        'To really delete a gig, open "Edit gig", then the Danger zone. For an organisation, open its Settings.',
        'Read the list of what will be deleted and tick that you understand.',
        'Wait a few seconds, type the exact name and tap "Delete permanently".',
      ],
      mistakes: [
        'Download what you need first (messages, reports, quotes as PDF). Nothing can be restored afterwards.',
        'Only organisation admins can delete. Crew lose access and are notified.',
      ],
    },
    'ad-export': {
      title: 'Download your data',
      intro: 'You can download your own data and, as an admin, the organisation\'s messages and reports.',
      steps: [
        'Your own data: tap your initials to open Settings, choose "Your data" and tap "Export my data".',
        'The organisation\'s messages: open Settings → Messages and tap "Download all messages". Here you also choose how long messages are kept.',
        'Inventory figures: Inventory → Reports → "Download CSV". Quotes: open one and use "Preview & print" to save a PDF.',
      ],
      mistakes: [
        'The downloads are files on your device. Keep them somewhere safe: they contain other people\'s names and messages.',
      ],
    },
  },
}
