# Changelog

## 0.43.0 — Switching S2: contacts

### Added
- **Contacts** (Quotes menu, `/org/:id/contacts`): a directory of **clients** and **suppliers**
  with search, archiving and a dialog per contact (company or name, contact person, e-mail,
  phone, tax number, address, notes). A client shows the quotes made for them.
- On a quote, **"Client from contacts"** fills in the client's details; a client typed by hand
  can be kept with **"Save to contacts"**. The new-quote form can pick a client too. A quote
  keeps its own copy of the details, so changing a contact doesn't change a quote already sent.
- **"Add them to contacts"** turns the clients typed on existing quotes into contacts (one per
  company, or per name when there's no company) and links those quotes.
- The import wizard imports **clients and suppliers** (CSV or Excel), matched by tax number, then
  by name (an e-mail address tells apart two of the same name). The address can come whole or as
  street, postcode, city and country. Headings are guessed in English, Dutch and Portuguese.
- Suppliers have an address and a tax number.
- The privacy page says what Contacts keeps about clients and suppliers.
- Help: the "Keep your clients and suppliers in Contacts" guide, a Contacts page note, the
  "Client" term and a hint on the quote's client picker.

### Changed
- The undo migration to run by hand is renamed again, to `20261117000001_import_undo.sql`, and
  now also switches on the contacts import (it replaces the import tables' checks, which needs a
  person to confirm) and undoes contacts imports. It still hadn't been run anywhere. Until it
  runs, importing contacts says so; adding them by hand works.

### Database
- Migration `20261117000000_contacts.sql` (no manual steps): `clients`, `quotes.client_id`,
  suppliers' `address` and `tax_id`, `clients_from_quotes`, contacts in `run_import`. Checks in
  `supabase/tests/contacts.sql`; after the hand-run file, `supabase/tests/contacts_import.sql`.

## 0.42.0 — Switching S1b: Excel files and kit contents

### Added
- The import wizard reads **Excel files (.xlsx)** directly (the first sheet), as well as CSV.
- **Kit contents** import: what goes in each set or case and the accessories that come with an
  item, one row per part, by code or name, with quantities. A kit becomes a set or a case as
  needed; importing again updates quantities. Column names are guessed in English, Dutch and
  Portuguese, and the matching can be saved as a preset.
- Undo also removes kit parts an import added and puts back changed quantities.

### Changed
- The undo migration to run by hand is renamed `20261116000001_import_undo.sql` (it now runs after
  the kits migration). It had not been run yet; nothing else changes for it.
- The import guide covers Excel and kits.

### Database
- Migration `20261116000000_import_kits.sql` (no manual steps): `subject` on import batches and
  presets, `import_part_changes`, kits in `run_import`. Checks in `supabase/tests/import_kits.sql`.

## 0.41.0 — Switching S1a: the import wizard

### Added
- **Import** in Inventory, a wizard for bringing in **locations, equipment and units** (serial
  numbers) from a CSV file or rows pasted from a spreadsheet: choose → match columns → check →
  import → report.
- Columns are guessed from English, Dutch (Rentman) and Portuguese headings; the matching can be
  saved as a preset for the next file. Prices, numbers and dates are read whichever way they are
  written; problems are shown per row before importing.
- The check shows what is new, what matches what is already in AVX, and what will be skipped.
  Importing the same file again updates instead of doubling. Units keep their old barcodes.
- A report of skipped rows and notes, downloadable as CSV.
- **Earlier imports**, each with **Undo** (with a warning and confirmation): removes what it
  added and puts back what it changed, unless something already uses it.

### Changed
- The old paste-only import in the catalogue is replaced by the wizard; the guide "Import your
  equipment" is rewritten for it.

### Database
- Migration `20261115000000_import_wizard.sql` (no manual steps): `import_batches`,
  `import_changes`, `import_presets`, `run_import`. Checks in `supabase/tests/import_wizard.sql`.
- Migration `20261115000001_import_undo.sql` (**run by hand**: it removes records): `undo_import`.
  Checks in `supabase/tests/import_undo.sql`.

## 0.40.0 — Field tools F4: sound system calculator

### Added
- **Sound system calculator** in a gig's Tools: the PA's mains, subs, delays and fills, and the
  listening positions (FOH first). It estimates each source's delay (delays and fills follow
  their nearest main plus a Haas offset; subs are lined up with the mains at FOH), the level at
  each position, whether a delay arrives too early or as an echo, and how wide each box covers.
  Temperature changes the speed of sound. Everything is clearly labelled as an estimate.
- A plan of the system (stage, boxes with their angles, listening positions)
- Print page `/gig/:id/system`; offline copies; read-only for crew
- Guide "Work out the PA delays"; glossary words Haas effect and SPL

### Changed
- The calculator is on by default; organisations that never changed their tools get it too.
  All four field tools (F1–F4) are now built; switching (S1) comes next.

### Database
- Migration `20261114000000_system_calc.sql` (no manual steps): `gig_show.system` and the new
  default tools. Checks in `supabase/tests/system_calc.sql`.

## 0.39.0 — Field tools F3: light plot

### Added
- **Light plot** in a gig's Tools: trusses, pipes, ladders and floor positions drawn over the
  stage, with the DMX patch's fixtures hanging on them (spaced evenly, or dragged into place;
  dropped near a position, a fixture hangs on it). Each fixture shows its symbol and
  universe/address. Positions have a length, trim height and phase.
- "Add fixtures here" on a position (adds them to the DMX patch on free addresses); fixtures
  not on the plot can be hung from a list
- **Power estimate**: watts, amps and weight per position and per phase against the supply
  (single or three phase), with warnings above 80% and 100%. Power and weight come from the
  catalogue item when not typed.
- Print page `/gig/:id/lights` with a legend; offline copies; read-only for crew
- Guide "Draw the light plot"; glossary words truss and power phase

### Fixed
- Stage plot: Enter or Space on a thing in the drawing now selects it (keyboard users)
- Help screenshot of the stage plot drawing showed the Print button instead of the drawing

### Changed
- The light plot is on by default; organisations that never changed their tools get it too

### Database
- Migration `20261113000000_light_plot.sql` (no manual steps): `gig_show.lighting`;
  `gig_fixtures.plot_x`, `plot_y`, `symbol`, `power_w`, `weight_kg`; power and weight from the
  catalogue; new default tools. Checks in `supabase/tests/light_plot.sql`.

## 0.38.0 — Field tools F2: patch and DMX patch

### Added
- **Patch** in a gig's Tools: the stage boxes (name, number of inputs, split to monitors), socket
  by socket, with the input line in each. Choose the line for a socket, or "Fill the free
  sockets" in channel order. Two lines in one socket are flagged. The socket is the input
  line's "Stage box", so the input list and the patch always match.
- **DMX patch**: every fixture with its universe, address, channels, mode and position. "Add
  fixtures" adds several of a type, each on the next free address; overlaps are flagged;
  "Readdress in order" repacks a universe. Linked fixtures can be added to the equipment.
- Print pages for both (`/gig/:id/patch`, `/gig/:id/dmx`), offline copies, read-only for crew
- Guides "Patch the stage boxes" and "Make the DMX patch"; glossary words DMX universe, DMX
  address and split

### Changed
- The new tools are on by default; organisations that never changed their tools get them too
- Organisation decision recorded: all field tools (F1–F4) come before switching (S1)

### Database
- Migration `20261112000000_patch_dmx.sql` (no manual steps): `gig_show.audio`, `gig_fixtures`,
  new default tools. Checks in `supabase/tests/patch_dmx.sql`.

## 0.37.0 — Field tools F1b: stage plot

### Added
- **Stage plot** in a gig's Tools: the stage from above (audience at the bottom, 1 m grid) with
  its width and depth, and a library of things to place: drum kit, vocal mic, amps, keyboard,
  acoustic guitar, DI, monitor wedge, musician, riser, power drop, text. Drag them, or select one
  and use the arrow keys or buttons; rotate, name and remove them (with Undo).
- **Send to the input list**: the drums, mics, amps, keys and DIs on the plot become channels on
  the input list (only the new ones, numbered after the last)
- Things linked to the catalogue can be added to the gig's **equipment**
- An "On stage" list under the drawing, a **print** page (landscape) and an offline copy; crew
  read it on their phone
- Guide "Draw the stage plot" and the glossary word "Stage plot"

### Database
- Migration `20261111000000_stage_plot.sql` (no manual steps): `gig_plot_items`. Checks in
  `supabase/tests/stage_plot.sql`.

## 0.36.0 — Field tools F1a: Tools tab and input list

### Added
- **Tools tab** on every gig (docs/FIELD_TOOLS.md): only the tools the gig uses, plus "Add a tool"
  for its production managers and the organisation's admins and members. Crew see the tab once
  the gig uses a tool, and read it on their phone, also offline.
- **Input list**: one line per mixer channel with the source, mic or DI, stand, 48V, stage box
  and notes. Reorder with the arrows (channels renumber), tick lines as they're checked on site,
  print it, and link mics and DIs to the catalogue so "Add mics and DIs to equipment" plans
  them on the gig. Removing a line has Undo.
- **Organisation settings → Field tools**: choose the tools the company uses
- Guide "Make the input list"; glossary words input list, 48V, stage box, line check, field tools

### Changed
- **Feed** and **Activity** are now one **Updates** tab (Posts / History), so the gig keeps eight
  tabs. Old links still open the right half.

### Database
- Migration `20261110000000_field_tools.sql` (no manual steps): `organisations.field_tools`,
  `gig_tools`, `gig_show` (the shared show model), `gig_inputs` and `order_inputs`. Checks in
  `supabase/tests/field_tools.sql`.

## 0.35.0 — Help H5b: equipment steps and undoing a scan

### Added
- **Equipment steps** on a gig: prepped → out (loaded) → on site → loaded back → back in →
  checked in. Pick the step at the top of "Scan out / in" (and in scan mode) and scan; a case
  brings what's packed in it. Out and back in are the scans out and in, as before; the other
  steps only record where the gear is.
- The gig's **Equipment tab** shows a bar per step ("66 of 69 out"), and the **packing list** has a
  Step column with how far each line has got
- **Organisation settings → Equipment steps**: an admin unticks the steps the company doesn't
  use (out and back in are always on)
- **Undo a scan**: each scan in the list (and the last one in scan mode) has an Undo button.
  Units go back to where they were, and the counts drop. It works for your own scans for 15
  minutes, while nothing else has happened to those units; a damaged return (which opened a
  repair) is changed under Maintenance instead.
- Guide "Follow equipment step by step" and the glossary word "Equipment steps"

### Database
- Migration `20261109000000_equipment_steps.sql` (no manual steps): scans grouped in batches,
  each unit's state before a scan kept for undo, undone scans no longer counted, the
  `gig_steps` log with `step_scan`, `undo_scan` and `gig_step_summary`, and
  `organisations.equipment_steps`. Checks in `supabase/tests/equipment_steps.sql`.

## 0.34.0 — Help H5a: field kit

### Added
- **Scan mode** (Scan out / in → Scan mode): the whole screen for scanning in the van or the
  dark, with gloves on. Big out/in switch, the camera, the last scan in large type, the count,
  and big buttons for the quantity and "damaged" where a thumb reaches. The phone's back button
  closes it.
- **Sounds and vibration on every scan**: one high beep when it's fine, two beeps for a warning,
  a low buzz for a problem (sound can be turned off; it's remembered on the device)
- **Torch** button on the camera, where the phone allows it (Android; not iPhones yet)
- **Read aloud** with the phone's own voice: the call sheet (your call first), your next gig on
  the simple home, any chat message (message menu), and, when turned on in scan mode, each scan
- **Large print** call sheet (prints large too); on by default for people who chose a larger text
  size. Your own line is marked in yellow, and phone numbers can be tapped to call.
- **Undo** instead of "are you sure?" when removing a schedule item, an equipment line, a crew
  position, a kit part or alternative, or your own chat message: it disappears at once, and is
  only deleted when the 8-second Undo runs out (or when you leave the page)

### Changed
- The green Print and Accept buttons on printable pages are darker, so white text on them is
  easier to read (WCAG contrast)
- Warehouse and crew guides cover scan mode, large print and read aloud

## 0.33.1 — Tabs scroll sideways only

### Fixed
- On phones, the gig's tabs (and other sideways-scrolling strips) could also be dragged up and
  down, hiding them behind the page for a moment; they now only scroll sideways

## 0.33.0 — Help H4: first steps and simple mode

### Added
- **Simple mode**: crew who only work on gigs (not in an organisation) see their **next gig** first,
  big, with the call time and four big buttons: call sheet, chat, open the gig, report damage.
  Gigs show fewer tabs. Anyone can turn it on or off in Account → Appearance.
- **First steps** on the home page for new admins (company details, equipment, team, first gig)
  and new crew (name and phone, AVX on the phone, notifications), each with its guide
- **Empty screens explain themselves**: what goes there, a button for the first thing to do and
  the guide

### Changed
- Crew guides describe the simple home

## 0.32.0 — Help H3: themes, text size and comfort

### Added
- **Account → Appearance** (saved on each device):
  - **theme**: dark, **light** (for sunlight), **high contrast**, or like the device;
  - **text size**: normal, large or extra large; the whole layout grows with it;
  - **comfortable mode**: bigger buttons and boxes, at least 44 px to tap;
  - **easy-to-read font** (Atkinson Hyperlegible).
- Guide "Make AVX easier to read"

### Changed
- **New look** from the Lumen and Pixel palette: navy background and the brand's lime green;
  new fonts (Nunito, and Space Mono for codes and numbers)
- Every colour now comes from the theme, and the tests check that all text stays readable in
  every theme
- On phones, the menu cards show their icon in the section's colour

## 0.31.0 — Help H2b: guides for the warehouse, office and admins

### Added
- **18 more guides** in Portuguese and English, with pictures of each screen:
  - for the warehouse: import the catalogue; locations; units and QR labels; scan out to a gig;
    check equipment back in; repairs and inspections; subrentals; inventory reports;
  - for the office and sales: company details; the price list; build a quote in phases;
    versions; send a quote; from accepted quote to gig;
  - for admins: members and roles; muting; deleting safely; downloading your data.
- Help and the ? panel group the guides by who they're for (five groups)

### Plans
- **Field tools** (docs/FIELD_TOOLS.md): a Tools tab on each gig for stage plots, input lists,
  patches, light plots and a sound system calculator that share their data
- **Equipment steps** with H5 (prepped → loaded → on site → returned)
- Fonts decided for H3: Nunito and Space Mono, with Atkinson Hyperlegible as the readable option

## 0.30.0 — Help H2a: how-to guides for crew and production managers

### Added
- **Guides**, step by step with a picture of each screen and the button to tap outlined, in
  Portuguese and English:
  - for crew: accept an invitation and set a password; install AVX on your phone; find your call
    time and the call sheet; mark the dates you can't work; answer an availability question;
    chat with the team; report damaged equipment; use AVX without signal;
  - for production managers: create a gig; invite crew; build the schedule; prepare and send the
    call sheet; avoid double bookings; plan the equipment.
  Each guide ends with common mistakes and the words it uses (linked to the glossary)
- **Help** now lists the guides by role above the glossary, and each guide has its own link
- The **?** next to a page title lists that page's guides and opens them right there, without
  leaving the page
- The pictures are made from the real screens with sample data by `npm run help:screens`, so they
  can be refreshed whenever a screen changes

### Fixed
- On a phone, the "Add schedule item" and "New gig" forms no longer run off the side of the screen
- The "New gig" form's labels are linked to their fields (screen readers now name them)
- The email example in the invite form is in Portuguese when AVX is

## 0.29.0 — Help H1: glossary, hints and accessibility checks

### Added
- **Help → Glossary**: 64 words used in AVX and in event work, in plain language, with an example
  and where each appears; searchable, in Portuguese and English, readable before signing in. In
  the top bar on computers (?) and under More on phones
- **ⓘ next to fields** people get wrong (prep and return days, stock tracking, kit type, minimum
  stock, depreciation, unit status, VAT, discount, factor, validity, call time, gig status, roles,
  who can find you, two-step sign-in, mark as lost, cross-hire code…): tap it for a short
  explanation with an example
- **? next to page titles**: what the page is for and the words used on it, in a side panel
- Words with a dotted underline show their meaning when tapped (first in the booking window)
- **Accessibility checks** in the automatic browser tests: serious problems for screen readers or
  keyboards now stop a release

### Changed
- Grey small text is lighter and easier to read (it was too faint for low vision and sunlight),
  and some blue, pink and purple labels are lighter too
- The logo, account and company buttons are named by what they show, for voice control

## 0.28.0 — Messaging M6b: how long messages are kept, export and usage

### Added
- **Organisation settings → Messages** (admins):
  - how much the organisation's conversations are used (messages, people writing, files);
  - **how long to keep messages**: for ever (the default), 90 days, 6 months, 1 year or 2 years.
    Older messages and their files are deleted every night. A shorter period shows what goes
    tonight and asks you to type the organisation's name. Direct conversations are never deleted;
  - **download all messages** of the organisation's conversations as a file
- Privacy notice (EN/PT): how long organisation conversations are kept, and the download

## 0.27.2 — iPhone home-screen app: top bar under the status bar

### Fixed
- Opened from the iPhone home screen, the top bar sat under the clock and battery. The app now
  keeps clear of the status bar (and of the notch when the phone is sideways) on every screen,
  with the app's colour behind the clock; windows such as Account open below it too

## 0.27.1 — Notifications panel on phones

### Fixed
- On phones, the notifications panel opened partly off the left edge of the screen; it now
  always fits the screen

## 0.27.0 — Messaging M6a: reports, moderators and blocking

### Added
- **Report a message:** message menu → Report, with a reason. The gig's managers or the
  organisation's admins are told (never who reported it) and choose Remove or Keep it, right under
  the message. Reports from direct conversations go to the AVX team
- **Remove as moderator:** whoever runs a gig's or organisation's conversation can remove any
  message in it; it shows "Removed by a moderator" and the author is told
- **Block a person:** in a direct conversation. Neither of you can write there, and their
  mentions don't notify you; work questions (availability, crew calls) still arrive. Unblock in the
  conversation or in Account → People you blocked
- **Rate limits** against spam: at most 20 messages a minute per person
- Privacy notice (EN/PT): reports and blocks

## 0.26.0 — Messaging M5a: push notifications and offline messages

### Added
- **Notifications on your phone or computer:** turn them on in Account → Notifications on this
  device. Messages, mentions, crew calls and the rest arrive like any app's notifications, in your
  language; tapping one opens it in AVX. On iPhone, add AVX to the home screen first. "Send a
  test" checks it works. A busy conversation shows one notification, not one per message
- **Write without a connection:** a message you write offline waits on your phone ("Waiting for a
  connection") and is sent by itself when the connection comes back. You can cancel it while it
  waits. Files need a connection
- Privacy notice (EN/PT): notifications on your devices and the push services that carry them;
  messages waiting to be sent are kept on the device

### Changed
- The email summary and push notifications share their wording (no change to the emails)

## 0.25.0 — Messaging M4b: clients and suppliers

### Added
- **Talk to your client on the quote:** the quote's page (the link you sent) now has a
  conversation under the quote. The client writes with their name, no account needed, even after
  the quote expired. You answer from the quote's Summary tab or from Messages
- **Talk to your supplier on a subrental:** make a link for the supplier in the subrental window.
  They see what you're hiring (items, quantities and dates, no prices) and can write to you. A new
  link turns the old one off; you can turn it off at any time
- The supplier conversation is separate from your team's own conversation about the subrental
- Notifications and the email summary for messages from clients and suppliers (they come through
  even when the organisation is muted)
- Privacy notice (EN/PT): messages from clients and suppliers

### Fixed
- Deleting an equipment item, a repair, a subrental or a quote left its conversations behind; now
  they're deleted with it
- Uploading a file again right after the first upload could save it as a separate file instead of
  version 2 (the list on screen hadn't caught up yet); found by the signed-in browser tests

### Planning
- Public site, pricing and help: a plan for the end of the build ([docs/PUBLIC_SITE.md](docs/PUBLIC_SITE.md))

## 0.24.0 — Messaging M4a: messages connected to gigs and equipment

### Added
- **Availability questions in messages:** the question arrives in your direct conversation with
  the person asking, with Available / Not available buttons; the answer is posted under it
- **Crew calls:** offer a place on a gig to several people at once from the Crew tab (or from an
  open position). They accept or decline in the message; the first to accept join the gig with
  that function and the call closes when it's full. Managers see who answered
- **Send the call sheet to the crew:** posts it in the gig's chat as an announcement everyone
  confirms
- **Schedule changes** are noted in the gig's chat (gathered when you make several in a row)
- **Team conversations** on equipment items, repairs and subrentals, for the organisation's admins
  and members; they show in Messages with a link back
- Notifications and the email summary: crew calls and their answers (crew calls come through
  even when the organisation is muted)
- Account export includes the crew calls you received and your answers
- Privacy notice (EN/PT): questions and crew calls in messages, schedule notes, team conversations

### Fixed
- Signing in sometimes opened My work instead of your organisation (the start page was chosen
  before your organisations had loaded); found by the signed-in browser tests, which now run
- Offline, the app sat on a spinner for about 7 seconds before showing saved copies (the database
  library retries failed requests); with no connection it now gives up at once
- **Deleting your account failed if you were on a gig** (the gig's activity log tried to name
  you after your account was already gone). Fixed in the database on both projects

## 0.23.0 — Messaging M3: channels, pins, announcements, search

### Added
- **Organisation channels:** admins create them from Messages (+) for everyone, admins and
  members, or admins only, and can make them "only admins write" or archive them
- **Department channels** in a gig's Chat: one per function (Sound, Light…) and one for the
  managers, seen only by those people and the gig's managers
- **Pin** messages; a bar above the conversation lists them
- **Announcements:** whoever runs a channel can send a message that everyone must confirm
  ("I've read this"); they see who has and hasn't confirmed. Everyone is notified, even in muted
  channels, in the app and in the email summary
- **Search** your messages, and **save** messages for later (only you see them)
- Account export includes saved messages and the announcements you confirmed
- Privacy notice (EN/PT): channels, announcements, saved messages and search

### Fixed
- Two-step sign-in: the authenticator entry is now named "AVX" and points to the AVX icon, for
  apps that show icons from the link (FreeOTP, 2FAS, Ente Auth…). Authy and Google Authenticator
  use their own icon lists, so they still show a generic icon

## 0.22.0 — Messaging M2: files, cards, mentions, reactions, edits

### Added
- **Files in messages:** attach up to 10 files (50 MB each) with the paperclip, by pasting or by
  dropping them on the box; pictures show as previews, other files download
- **Share a card:** a gig, schedule item, file, quote or equipment item, shown as a card that opens
  it. People who can't open it see only that it's there
- **@mentions** in gig chats: type @ to pick someone on the gig; the gig's managers can also
  mention @everyone, @crew, @managers or a function such as @Sound. Mentions notify (bell and email
  summary) and are highlighted for the person mentioned
- **Reactions** (👍 ❤️ 😂 😮 🙏 ✅ 👀), **edit** your messages (earlier versions stay visible),
  **remove** them (cleared for everyone, a marker stays), and **copy a link** to a message
- Your data export now includes your messages' files, cards and edit state
- Privacy notice (EN/PT): message files, edits and removal

### Fixed
- The chat message for changed gig dates showed the range one day short

## 0.21.1 — Fixes and plans

### Fixed
- Account → Unavailable dates: on iPhones the two date fields overlapped. They now share the
  row and have visible "From" / "To" labels. Date and time fields everywhere can no longer
  overflow their column or collapse when empty on iOS

### Docs
- `docs/PENDING.md`: everything waiting on a decision, setting or test since the inventory build
- `docs/HELP.md`: plan for a glossary, field hints, guides and other inclusive features (H1–H6)
- `docs/SWITCHING.md`: plan for importing from Rentman and other tools (S1–S5)

## 0.21.0 — Messaging M1: direct and gig conversations

### Added
- **Messages** (top bar): your direct conversations and gig channels, newest first, with unread
  counts; open one to read and reply. Side by side on wide screens, one at a time on phones
- **Chat tab on every gig**: everyone on the gig talks in one place; status, date and venue
  changes show up in it. Viewers can read but not post. The Feed stays for official updates
- Replies to a message, links made clickable, earlier messages loaded on demand, live delivery
- **Message** buttons next to crew on a gig and organisation members. You can message people you
  share a gig or organisation with
- Mute a conversation; no read receipts
- Notifications for direct messages and replies to you, grouped per conversation, also in the
  email summary (which now also covers damage reports, inspections and hire requests)
- Your sent messages are included in the account data export
- Privacy notice (EN/PT): who sees messages, no read receipts

## 0.20.0 — Your network

### Added
- **Your network** in the invite dialogs (gig crew and organisation members): search people
  you've already shared a gig or organisation with, see the functions they had on those gigs,
  how many gigs together and whether they're booked on the gig's dates, and add them in one go,
  without needing their email. Nobody can browse everyone on AVX
- **Account → Who can find you by name**: managers and admins only (default) or also other crew
- Privacy notice (EN/PT): what this search shows and the setting

## 0.19.0 — Inventory I7: reports

### Added
- **Inventory → Reports** for the last 90 days, 12 months or this year: use, gigs, last used,
  revenue from accepted quotes, revenue against purchase cost, repairs and what was charged back,
  losses at replacement value, subrental spend and book value per item, with totals
- Items not used in the period, with their book value
- CSV download of the report

## 0.18.0 — Inventory I6: subrental and cross-hire

### Added
- **Inventory → Subrentals**: suppliers, and gear hired in for a period or a gig, with lines, costs,
  reference and status
- Confirmed subrentals count as available stock for the dates they cover, so a gig's shortage clears
- **Subrent N** on short lines in a gig's Equipment tab, filled in with the gig's dates and the item
- **Cross-hire between companies on AVX**: share your cross-hire code; companies that link it can
  send you hire requests, which you confirm or decline with a note and a price. Both sides are
  notified, and they only see your organisation's name and what was asked

## 0.17.0 — Inventory I5: maintenance

### Added
- **Report damage** on a gig's Equipment tab, for everyone on the gig: the item or unit code, what's
  wrong and a photo from the phone. The organisation's admins are notified
- **Inventory → Maintenance**: open and recently closed repairs, and inspections due. Repairs have
  a status, repairer (in house or outside), cost, charge to the client, expected return and outcome
- Units under repair aren't available for gigs until repaired; written-off units are retired; bulk
  quantities under repair count against availability
- Returns scanned in as damaged open a repair
- **Inspections**: set a kind and interval per item (e.g. PAT test every 12 months), record passes
  and fails (a fail opens a repair), see what's due or overdue
- A daily reminder notifies admins of inspections coming due
- Item page: repairs and inspections for that item

## 0.16.0 — Inventory I4: kits

### Added
- **Sets**: catalogue items with no stock of their own that stand for a group of items. Adding a
  set to a gig (or filling a gig from a quote that has one) plans its contents; sets can hold sets
- **Cases**: stock items with fixed contents. Planning a case plans its contents; each case unit
  records which units are packed in it, and scanning the case out or in moves them and its bulk
  contents too
- **Accessories**: items that come along automatically when another is planned, per item
- **Alternatives**: when a gig line is short, the Equipment tab offers a free alternative and moves
  the shortfall across in one click
- Item page: Contents, Accessories and Alternatives panels; units show which case they're in
- The equipment picker shows what each item brings and how many sets are free

### Fixed
- Filling a gig from a quote no longer fails when the quote has catalogue items that aren't
  stock-tracked (they're left out of the equipment list)

## 0.15.0 — Inventory I3: warehouse

### Added
- **Packing list** for every gig (Equipment tab → Packing list): printable, by category, with
  packing notes, tick boxes and what has gone out and come back
- **Scan out / in** (Equipment tab): scan QR labels with the phone camera, a hardware scanner or by
  typing the code. Units are tracked one by one, bulk items by quantity; returns can be marked
  damaged, which sends the unit to repair
- Warnings for more than planned, a unit already out on another gig, more back than went out and
  lost units turning up; nothing is blocked
- Planned / out / back on each line of the Equipment tab; units still out after the gig can be
  marked lost in one go
- Item page: shows which gig a unit is out on

### Changed
- The site may use the camera (for scanning only)

## 0.14.0 — Inventory I2: availability

### Added
- **Equipment** tab on every gig: everyone on the gig sees the list; the gig's managers and the
  organisation's admins and members add gear from the catalogue, with how many are free on the
  gig's dates, and change quantities or give a line its own dates. Shortages are flagged, never
  blocked. Planners see total weight and power
- Equipment on gigs is booked in the reservations engine, for the gig's days plus the
  organisation's prep and return days (new in Organisation settings). Draft gigs hold gear,
  archived gigs free it, date changes move it
- Availability counts the busiest moment in a period, so bookings on different days don't add up;
  units in repair don't count as available
- Quotes: lines added from the price list remember their catalogue item; **Availability** in the
  quote editor checks them for the quote's dates; filling a gig from its quote now adds the
  equipment too (the most used in any one phase)
- Item page: upcoming bookings and a six-week availability strip

### Changed
- The "fill gig from quote" dialog lists equipment alongside schedule and positions

## 0.13.0 — Inventory I1: catalogue and stock

### Added
- Inventory menu for admins and members: Catalogue, Locations, Stock movements and QR labels
- The price list becomes the catalogue: rental and sale items can be counted in bulk or tracked by
  serial number, with a code, brand, model, weight, power, size, replacement value, minimum stock
  and packing note; low stock is flagged
- Locations (warehouses, vehicles, sites), archived instead of deleted
- Bulk stock through a ledger that can't be edited: add, move, remove (sold, lost, retired) and
  count (records the correction). You can't take out more than a location holds
- Serial-numbered units with QR code, status (available, in repair, lost, retired), purchase details
  and book value; every move and status change is logged automatically
- Paste import from a spreadsheet (creates items and adds stock)
- Printable A4 QR label sheets; scanning a label with any phone camera opens the item or unit
  (`/scan/<code>`)
- docs: decisions for the "your network" picker (after inventory) and the crew network / job board
  (after messaging) recorded in the roadmap

### Changed
- Archived catalogue items no longer appear in the price list or the quote picker
- Disabled buttons look disabled everywhere

## 0.12.0 — Phase 5a: people, bookings and clashes

### Added
- A reservations engine: one table records who (later: what equipment, vehicle or room) is taken
  for which time range, kept in step by the database (docs/RESERVATIONS.md)
- Booking times per crew member ("Set times" in the Crew tab); without them a person is booked for
  the gig's whole days, so short jobs on the same day no longer clash
- Double-booking warnings: ⚠ next to anyone booked elsewhere at the same time, with advice to talk
  to them first; the same warning while inviting by email; a warning in the new/edit gig form when
  the dates overlap your own bookings. Nothing is blocked. Other companies' gigs still show only as
  "another gig"
- Ask availability: managers send a question, the person answers Available / Not available with a
  note from My work, and both sides are notified (in the app and the email summary)
- My work marks gigs that overlap another booking or your unavailable dates ("Double booking" on the
  card, amber outline in the calendar)
- Unread updates per workspace in the switcher; mute an organisation from the Organisations page
  (no badge and no email summary for it; questions addressed to you still arrive)
- Organisation admins can add someone from a gig's crew to the organisation in one click
- Plans: docs/INVENTORY.md (inventory phases I1–I7) and docs/MESSAGING.md (messaging M1–M6)

### Changed
- Viewers can no longer create gigs (enforced by the database)
- Notifications about a gig always carry its organisation
- My work shows a gig once even if you hold two roles on it, with both functions

## 0.11.0 — Phase 4d: navigation and workspaces

### Added
- App shell on every signed-in screen: the logo always goes home; notifications and account in the
  top bar; section menus (Gigs, Quotes, Organisation) open dark frosted card panels on desktop, with
  a side list for smaller items; on phones a bottom tab bar plus a "More" sheet
- Workspace switcher next to the logo: **My work** (every gig you're on, at any company, with the
  company and your role on each) or one of your organisations, with your role there. Menus follow
  the role; AVX reopens the workspace you used last
- Organisations page (`/orgs`): your organisations with your role in each, the companies you work
  for as crew, and creating a new one
- Addresses for everything the menus link to (`/me`, `/org/:id`, quotes tabs, members, settings,
  new gig, account), so links, the back button and bookmarks work
- The gig page shows which company it belongs to and your role there

### Changed
- `/dashboard` now opens your current workspace; gigs shared with you moved into My work
- The gig page's back button returns to where you came from
- Viewers are no longer offered "New gig" in the menus

## 0.10.0 — Phase 3 leftovers and the quote PDF

### Added
- Quote PDF: emails to clients carry a PDF of the quote (same version as the link) as an attachment;
  "Download PDF" on the print preview and on the client's page. Made in the browser, never stored.
- Two-step sign-in (Account → Two-step sign-in): codes from an authenticator app. Once on, the database
  itself refuses a session that hasn't given the code (tables, files and the app's functions), so the
  password alone isn't enough even outside the app.
- Anonymous usage counts for the pilot: how often each screen and a few actions are used per day, with
  no user id, IP, device or cookie; skipped when the browser sends Do Not Track / Global Privacy Control
  (docs/USAGE.md)
- Signed-in browser tests for uploading a file and a new version, and for inviting someone by email
  before they have an account

### Changed
- Privacy notice names Brevo as the email provider and describes usage counts and quote recipients
- The client's quote page offers "PDF" and "Print" separately

## 0.9.0 — Phase 4c: quote versions, sending to clients, quote → gig

### Added
- Quote versions: save the quote as a numbered version with a note, view or print any version, and
  restore one (the current state is saved as a version first, so nothing is lost)
- Send to client: creates a private link to an online copy of the quote (valid 30 days) and emails it
  through Brevo when an address is given; otherwise copy the link yourself. Sending again replaces the
  previous link; links can be turned off. Each send is saved as a version.
- Public quote page (`/q/…`, no account needed) in the quote's language, printable, with Accept /
  Decline (name and optional message). The answer sets the quote's status and notifies the sender, the
  quote's author and the organisation's admins (in the app and in the daily email).
- Fill a gig from its quote: schedule items from the phase dates (one per day) and crew positions from
  the crew lines, shown first so you can untick or adjust them
- "Positions to fill" in the gig's Crew tab: roles with how many people are needed, how many are
  filled (crew and invites with that function), and a quick invite for the role

### Changed
- The printed quote fits phone screens (smaller type, wrapping, scrolls sideways when needed)

## 0.8.0 — Phase 4b: branded quotes, price list, safe deletion

### Added
- Delete a gig (Edit gig → Danger zone) or an organisation (dashboard → ⚙ settings → Danger zone),
  admins/creators only, behind a two-step confirmation: a list of everything that will be destroyed
  with counts and an "I understand" tick, then typing the name, with the button locked for 5 seconds.
  Crew and members get a notification (and the daily email) when it happens.
- Organisation settings (rename) for admins; deletion moved out of the Members window
- Quote branding: header image repeated on every printed page, accent colour, number prefix and
  "next number" to continue an existing numbering
- Quote fields for project manager and payment method; optional start/end times per phase, printed
  as an agenda
- Printed quote redesigned (Inter + Space Mono): client, title, project details, agenda, sections with
  section totals, totals by type, final discount, VAT, numbered conditions, contact footer
- Price list per organisation: add/edit items, paste-import from a spreadsheet, and "From price list"
  in every quote section

## 0.7.0 — Phase 4: quotes

### Added
- Quotes for organisation admins and members: phases as tabs (own dates, discount, optional),
  sections and priced lines (rental, sale, crew, transport, other, comment), live totals by phase,
  by type, with discount and VAT
- Templates: save a whole quote or one phase, start a quote from a template or add one as a block
- Printable quote / PDF in Portuguese or English with company details and terms; optional
  "no prices per line" layout
- Company details and quote defaults per organisation (admins)
- Create a gig from a quote, or link a quote to an existing gig
- Access-rule test for quotes (`supabase/tests/quotes_rls.sql`), unit tests for the quote maths,
  signed-in browser test for building and printing a quote

## 0.6.0 — Phase 3: out in the field

### Added
- Offline mode: the app opens without signal; dashboard, gig pages and call sheets show the last saved
  copy with a banner; files can be kept offline one by one or all at once. Saved data is cleared on sign-out.
- Magic-link sign-in ("Email me a sign-in link"), with a bilingual email template
- Daily email summary of unread notifications (Brevo), in each person's language, with an Account opt-out
- Signed-in browser tests against a separate Supabase test project (`e2e-auth` CI job, off until enabled)

### Changed
- Projects without email confirmation sign the new user straight in after sign-up
- Keep-alive also pings the test project when configured

## 0.5.0 — Phase 2b: team experience

### Added
- In-app notifications with a live bell (gig/org invites, new files and versions, important posts, schedule,
  call-time, status and date changes)
- Portuguese / English interface, including legal pages; language saved to your profile
- Crew availability (private unavailable dates) with clash warnings for managers
- "Coming up" schedule card on the gig overview
- Playwright browser tests in CI; optional backup of uploaded files

### Changed
- Gig page split into tab components (`src/components/gig/`) using the shared UI module

### Fixed
- Re-inviting someone already on a gig silently did nothing; it now updates their call time and role
- Feed post headers wrap properly on narrow screens

## 0.4.0 — Phase 2a: day-to-day production tools

### Added
- Gig schedule tab and printable call sheet (schedule + crew calls + phones)
- Activity log per gig, written by database triggers
- Live updates for the feed and for changes made by other people
- File version history with PDF/image preview and per-version download
- Dashboard calendar view
- Installable PWA (manifest, icons, iOS home-screen support)
- Optional phone number in Account

### Changed
- Gig tabs scroll horizontally on small screens
- New shared UI module (`src/components/ui.jsx`) for new components

## 0.3.0 — Phase 1: ready for pilot companies

### Added
- Organisation members: invite by email, roles, remove, leave, delete organisation (last admin is protected)
- Invitation emails for gigs and organisations, and a `/welcome` page to set name + password
- Account: export my data, delete my account
- Privacy notice and beta terms, linked from sign-up
- Dashboard filters (upcoming / past / archived / all) and search
- Optional Sentry error monitoring; daily encrypted database backups workflow
- Branded auth email templates and email deliverability guide

### Changed
- DM Sans font is now self-hosted (no requests to Google)
- Clearer message when choosing your current password as the new one

## 0.2.0 — Pilot foundation

### Added
- Password reset ("Forgot password?"), resend confirmation email, change password and name from the Account panel
- Crew by email: existing users are added at once; pending invites are claimed automatically on sign-up
- "Shared with you" gigs on the dashboard for crew outside the organisation
- Delete assets, delete feed posts, remove crew / leave a gig
- Upload hint showing when a file will become a new version
- Error boundary, toast notifications, central logger, friendly error messages
- Security headers (CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy), favicon, robots noindex
- ESLint, Vitest unit tests, GitHub Actions CI, Supabase keep-alive workflow
- `supabase/migrations/` and an access-rule smoke test

### Fixed
- Access rules: recursion errors, users able to join any organisation, crew seeing other gigs' files
- Creating an organisation failed; storage bucket was public
- A new upload replaced any asset of the same type (now only same type + same name)
- Empty dates broke gig create/edit; errors were silent
- Debug output shown when opening files; pinch-zoom disabled on mobile

### Changed
- Minimum password length 8; file uploads limited to 50 MB with a clear message
