# Changelog

## 0.79.0 — Tools, part 1: speaker library, MVR and GDTF, and e-signature

### S07: Speaker library (step 13)

#### Added
- **Speaker specs on catalogue items.** A "Speaker specs" part in the item form: kind of speaker,
  sensitivity, maximum SPL, dispersion (horizontal × vertical), frequency range, impedance, amplifier
  channels per cabinet and the datasheet they come from. Weight and power stay where they were. The item
  page lists them.
- **Rigging data** (centre of gravity, pickup points, bumper/frame limits, source), copied as printed from
  the manufacturer. Always shown as "needs a second person's check before use"; the line array tool (RG3)
  will add that check.
- **Presets for ten models**, typed from the manufacturers' own documents with the document, version and
  date: L-Acoustics K2, Kara II, X12, KS28; d&b V8, Y10P, V-SUB; RCF HDL 30-A; Meyer Sound LEOPARD; NEXO
  GEO M1220. What a document doesn't give stays empty.
- Help: ⓘ hints on every new field, the "Speaker specs" term, a tip in the sound system calculator guide.

#### Connected
- **Sound system calculator:** pick a catalogue speaker per source and its maximum SPL and horizontal
  angle come from the catalogue instead of typed numbers; "Update from catalogue" when the item changes.
- **Import wizard:** speaker columns are guessed; a "Speaker preset" column (e.g. "L-Acoustics K2") fills
  the empty cells. New refusals: unknown preset, value outside the limits, highest frequency below the
  lowest.

#### For developers
- Migration `20270103000000_speaker_specs.sql` (speaker and rigging columns on `price_items`;
  `private.import_item_row` takes them). Tests: `supabase/tests/speaker_specs.sql`.

### S08: MVR and GDTF for the light plot and DMX patch (step 14)

#### Added
- **Import MVR** in the DMX patch and the light plot: an .mvr file from Vectorworks, grandMA3, Capture or
  another lighting program brings its fixtures in one go, with type, mode, channels, DMX address, fixture
  number, place and height. You pick the catalogue item for each fixture type (AVX suggests one), type the
  channels where the file doesn't say, and see what will happen before anything is saved. New hanging
  positions appear on the light plot; importing the same file again updates the fixtures instead of adding
  them twice.
- **Export MVR:** the gig's light plot and DMX patch as an .mvr file for the lighting desk or the drawing
  program, with the fixture types' GDTF files inside.
- **GDTF fixture types on catalogue items** (Inventory item → ⋯ → "GDTF fixture-type file"): the modes and
  their channel counts, and the file's weight and power for the item.
- A help guide, "Bring a rig in from MVR, and send it back", and the words MVR and GDTF in the glossary.

#### Connected
- Catalogue: weight and power from GDTF files go on the item, so the light plot's power and weight per
  position use them (and later power distribution and rigging); matched fixtures take them automatically.
- DMX patch: picking an item offers its GDTF modes and fills the footprint.
- Light plot: imported fixtures keep their places; new positions are added; the import adds the DMX patch
  and light plot to the gig if they're missing.
- Gig equipment: matched fixtures count for "Add to equipment".
- Import fix panel (IM1): not connected, because IM1 isn't built yet; the MVR import has its own match step.

#### For developers
- Migration `20270104000000_mvr_gdtf.sql` (`fixture_types`, MVR fields on `gig_fixtures`, private
  `fixture-types` bucket). Tests: `supabase/tests/mvr_gdtf.sql`.

### S11: E-signature (step 16)

#### Added
- **Signatures you can't change.** A signature pad for a finger, a pen or the mouse. Each signature keeps
  the drawing, the signer's typed name (and role or company), the time and a fingerprint (SHA-256) of the
  exact document signed, with a signed PDF. Once saved, nobody can change it, not even AVX; it can only be
  hidden. It is a simple electronic signature, not a qualified one (no Chave Móvel Digital or Cartão de
  Cidadão), and the terms say so.
- **Quotes accepted with a drawn signature.** On the quote's page the client can add a drawn signature next
  to their typed name (optional). In "Send to client" the answer shows it, and **Signed PDF** makes and
  keeps the signed quote.
- **Delivery notes signed on site.** Packing list → **Delivery note: sign**: hand the phone to the client,
  who checks what went out, types their name and signs. The signed PDF is kept and listed under the packing
  list.

#### Changed
- A gig with signed delivery notes can't be deleted for good, only cancelled, so the signed proof isn't
  erased by accident.
- The privacy notice and terms have a section on signatures (their "last updated" date is now 9 November
  2026).

#### Connected
- Quotes (client page and Send to client), packing lists, gig files (each signed PDF is copied there), the
  privacy notice and terms in both languages, the data map, help (glossary "Simple electronic signature",
  an ⓘ on the delivery note, guides "Get a delivery note signed on site" and "A quote accepted with a drawn
  signature").

#### For developers
- Migrations `20270105000000_signatures.sql` (`signatures` table with a guard that refuses changes,
  private `signatures` bucket) and `20270105000001_signatures_keep_gig.sql`. Edge Function `quote-public`
  takes the drawn signature. Tests: `supabase/tests/signatures.sql`, `supabase/tests/signatures_keep_gig.sql`.

### CI: one signed-in test queue per PR (#138)

#### For developers
- Each PR (or branch) now has its own queue for the signed-in browser tests: a newer push replaces that
  PR's older run, and different PRs run side by side. Before, one queue for the whole repository held a
  single waiting run, so parallel PRs kept cancelling each other's.

## 0.78.0 — Design refresh: room to breathe, and a bin for deleted quotes

### DR1: Foundations and the home

#### Changed
- **Home:** calmer and arranged your way. Sections sit further apart with a plain heading each, no boxes
  around them. **Arrange home** (at the bottom) moves the availability questions, the numbers and the gigs
  up or down, hides any of them, or puts them back as they were; it is remembered on this device for each
  workspace.
- **Key numbers** (and My numbers) are bigger and, on a phone, a row you swipe sideways (arrow keys work
  too); on a computer three in a row. They no longer fold from their heading: hide them in Arrange home.
- **First steps** is now one quiet line ("First steps · 2 of 4 done · next: Add your equipment") that opens
  the steps still to do; finished steps are no longer listed and it has no green border.
- **On a phone** the home no longer repeats the organisation's name (the top bar shows it): the greeting is
  the title. What your role allows moved behind the ⓘ next to the role chip. The "Every gig you're on…"
  line under My work is gone (the ? explains it).
- The gig filters on the home mark the chosen one with a green bar instead of a green fill.

#### For developers
- Layout pieces in `ui.jsx`: `Section`, `Stack`, `PageHeader`, `SwipeRow`, `MoreMenu`, `usePhone`, `space`;
  spacing steps as CSS variables in `index.html`. A test stops new off-scale text sizes and gaps.

### DR2: The gig page

#### Changed
- **Gig page:** calmer. The header shows the gig's name, its labels and your call time, one line with the venue,
  dates and your role, and **Edit gig** (in ⋯ on a phone); Refresh is a small icon next to Back. Your call no
  longer has a green fill.
- **Overview** is a column of sections with plain headings and space between them, no boxes: what's coming up
  first, then the description, details, crew, files, the latest posts and the gig's finances. The wrap-up link is
  one quiet line.
- **Every tab** starts the same way: its name, a count where useful, the ⓘ (the explanation that used to sit under
  the name), one main button and at most one more. The rest is in ⋯: on Crew, **Find crew** and **Post a job**; on
  Equipment, **Dispatch** and **Report damage** (crew who can't add gear still see Report damage).
- **Lists are rows**, not a box each: the running order, crew, positions, crew calls, pending invites, labour cost,
  equipment, files, posts and history. A booking clash or gear that's short keeps its coloured row with a bar on
  the left.
- Chat channels, the Updates switch (posts / history) and the Tasks filters mark the chosen one with a green bar
  under it instead of a green fill.

#### Fixed
- The labour cost panel spread the rate card's data into its own style by mistake (a name clash); it is a plain
  section now.
- The gig finance panel's "Invoiced (incl. VAT)" row no longer has a glossary button whose name didn't match its
  text.

### DR3: Lists

#### Changed
- **Quotes, Invoices, Inventory, Contacts, Expenses, Hours, Leave, Jobs, Job posts and Find crew** have
  the calmer layout: the title with its ⓘ and one green button, then the list. The organisation's name no
  longer sits above the title (the top bar shows it).
- **Filters are tabs:** the chosen view or filter is marked with a green bar under its name instead of a
  green fill (Invoices, Expenses, Inventory's filters, Jobs). On Quotes the status list became tabs too:
  All, Draft, Sent, Accepted, Declined, To follow up.
- **Lists are rows with a thin line between them**, not a box around each one (quotes, templates,
  invoices, equipment, locations, contacts, members, hours, leave, jobs and applications).
- **Explanations moved behind ⓘ:** the line under the title on Invoices, Expenses, Hours, Leave, Jobs,
  Job posts, Find crew and Members, and the notes at the top of Inventory → Locations and Movements,
  Expenses → Recurring and Crew to pay, and Members → Held invitations.
- **Fewer buttons in view:** on a phone the second buttons in a page's header (Company details, Import,
  Labels, CSV, Add for someone) are in the ⋯ menu. On Job posts, "Mark filled", "Close" and "Reopen"
  are in each post's ⋯ and "Decline" in each applicant's ⋯; on Find crew, "Report" is in each person's ⋯.
- **Invoices:** the invoicing program panel moved below the list.
- **Jobs:** Apply and Offer are outlined buttons now, so the page has one green thing.

#### For developers
- `src/components/ListParts.jsx`: `FilterTabs` (filters or tabs with the 2px bar), `pageWrap`, and the
  row styles `rowList`, `row`, `rowButton`, `rowName`, `rowMeta`.
- `JobCard` renders an `<li>` row; put it in a `<ul style={rowList}>`.

### DR4: Detail pages and editors

#### Changed
- **Quote editor:** fewer buttons at the top. **Send to client** is the green one; **Preview & print** and
  **Create gig** (or **Open gig**) sit next to it on a computer. Everything else (Fill gig from quote,
  Availability, Versions, Duplicate, Save as template, Delete) is in the **⋯** menu; on a phone, Preview and the
  gig button are there too. The Details tab has no boxes around Client, Conditions and Texts, just headings
  with space between them; the Summary lists phases as plain rows; the groups of lines in a phase are no longer
  boxed. The line grid itself stays compact.
- **Equipment item page:** a calmer header (Edit and QR labels at the top, Archive in ⋯), the details without a
  box, and stock, units, bookings and history as plain rows with thin lines between them. Each location row shows
  Move and Remove; Count is in its ⋯.
- **Reports:** the report tabs are a row of words with a green line under the chosen one (no green block), and
  they scroll sideways on a phone. Sections on the Overview have more room between them.
- **Settings** and **organisation settings:** groups are separated by space instead of lines, sections have
  clear headings, and the buttons are no longer green.
- **Import:** the steps at the top are words with a line under the current one; the checklist, the kinds to
  import, the column matching and earlier imports are plain rows instead of boxes.
- Help: the guides for versions, sending a quote and quote-to-gig say where the moved buttons are now; their
  screenshots, and those of Reports, the item page, Import and the settings, are new.

### DR5: Field and crew screens

#### Changed
- **On-site mode:** today's schedule and your tasks are no longer in boxes; your call time is a highlighted band. Every
  button and schedule row is at least 44 px, easy to hit with gloves on. The note that on-site mode came on by itself
  has a plain line above and below it instead of a green border.
- **Simple home:** the next gig shows two buttons, Call sheet and Chat, with Read aloud below them; Open the gig and
  Report damage moved under ⋯ on the card. The gigs after it are a plain list. The help guides say where they went.
- **Scan out and in (Dispatch):** a clearer header. Sound and Scan mode stay in view; Packing list and the warehouse
  numbers are next to them on a computer and under ⋯ on a phone. Record is now the only green button. The step
  buttons no longer spill their text on a small phone.
- **Messages:** the conversation list is a plain list with lines between conversations, no box around it. Search and
  Saved show which one is open with a green bar. The buttons at the top of a conversation are bigger.
- **My tasks** and **My numbers:** the usual page header; My numbers' sections are no longer boxes.
- **Help:** the guides and the glossary are plain lists with more space between them; the word you came to see is
  highlighted. In a guide the step numbers are no longer green squares.
- **Field tools and Pocket tools:** text sizes and spacing are the same as everywhere else.

### DR6: The sweep

#### Changed
- **Every screen, the same few sizes:** the screens the earlier steps didn't reach (organisation menus and pages,
  reports, inventory panels, invoices, public quote and report pages, the call sheet and more) now use the same seven
  text sizes and the same spacing steps as the rest of the app. The smallest text grew from 10–12 px to 11–13 px.
- **The ⋯ "More actions" button** is bigger on a phone (44 × 44 px), so it's easy to hit (#126).
- **Help:** every guide's pictures were taken again so they show the screens as they are now.

#### For developers
- The off-scale test now fails on any text size or gap off the scales, in every `.jsx` and `.css` file
  (`src/theme/offScale.test.js`); the per-file baseline is gone. It also reads the size in a `font:` shorthand, and
  ignores pt / mm / em sizes (print sheets) and the 1px hairline grid in the menu cards.
- The design system's updated tokens and component notes are in `docs/design-system/`, ready to publish.

### Quotes: Recently deleted, Cancel quote, Revise and resend (#124)

#### Added
- **Quotes → Recently deleted:** deleting a **draft** or **declined** quote no longer erases it at once. It
  moves to Recently deleted (Quotes page, header button or ⋯ menu on a phone) for **15 days**, with an
  **Undo** on the message. While it is there it counts nowhere: not in lists, search, counts, reports, gig
  finance or chat, and its client link shows "not found". **Restore** brings it back as it was, with its
  versions, client links and number. After 15 days a nightly clean-up erases it for good.
- **Cancel quote:** a **sent** or **accepted** quote can't be deleted; ⋯ → **Cancel quote** marks it
  **Cancelled** instead. Cancelled is final: it can't be reopened, only duplicated as a new draft. It stays
  in the list (with its own filter), stops counting as waiting, in the win rate and in revenue, and the
  client's link shows it as cancelled with no accept button. Its gig, crew, equipment and invoices stay as
  they are.
- **Revise and resend:** on a **declined** quote, ⋯ → Revise and resend puts it back to draft to change
  and send again. The old decline no longer counts in the win rate; once sent again it is waiting (and
  its follow-up clock starts) from the new send. Its versions and the client's answer stay.
- Help: the term "Recently deleted", a ⓘ hint on the bin, and lines in the guide "Build a quote in
  phases" on deleting, cancelling and revising a declined quote.

#### Changed
- The status menu on a quote no longer offers Draft once it has been sent, and is locked on a
  cancelled quote.
- The delete question on a quote now says where the quote goes ("…goes to Quotes → Recently
  deleted, where you can restore it for 15 days"), and the message after it says "Quote moved to
  Recently deleted."
- Who may delete or cancel a quote is the same as who could delete one before: an admin, or whoever
  made it. The same people may restore it.

#### For developers
- Migrations `20270102000000_quote_cancelled_status.sql` (`quotes.status` gains `cancelled`; run by
  hand) and `20270102000001_quote_bin.sql` (`quotes.removed_at` / `removed_by`; the app's direct delete
  right on `quotes` revoked; RPCs `remove_quote`, `restore_quote`, `removed_quotes`, `cancel_quote`,
  `revise_quote`; status guard and revise-dates triggers; nightly `private.erase_removed_quotes()`).
  Readers that don't run as the reader (`private.report_quote_lines`, `public.gig_finance`,
  `private.can_see_card`, `private.guest_resolve`, `public.clients_from_quotes`) skip quotes in the bin.
- Edge Function `quote-public`: "not found" for a quote in the bin; `state: 'cancelled'` for a cancelled one.
- Tests: `supabase/tests/quote_bin.sql`; e2e "a deleted quote waits in Recently deleted and can be restored".

### Setup: `.env` no longer in the repository (#125, #133)

#### For developers
- `.env` is no longer in the repository and is listed in `.gitignore`. A fresh clone starts from
  `.env.example` (`cp .env.example .env`) and points it at the **test** Supabase project for local
  work and e2e. Production builds take `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from
  Vercel's Environment Variables. The old file stays in git history; the anon key is public by
  design, so nothing needs rotating.
- The backup, digest, key-numbers and keep-alive workflows take the production Supabase URL (and,
  for keep-alive, the anon key) from the repository variables `SUPABASE_URL` and
  `SUPABASE_ANON_KEY` instead of the committed `.env`. If one is missing, the run fails and says
  which.
- CI's `check` and `e2e` jobs take `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` from the
  repository variables `TEST_SUPABASE_URL` / `TEST_SUPABASE_ANON_KEY` (as `e2e-auth` already did).

## 0.77.0 — Money reports: sales, equipment, warehouse, operations, crew numbers and extras

### K4: Sales and clients

#### Added
- **Reports → Sales → Waiting:** the quotes sent and still without an answer, as of today: their
  value, how many the client opened, which expire within 7 days, and a chart of their value by age
  (0–7, 8–14, 15–30, over 30 days). Below it, the **follow-up list**: quotes sent 7 or more days ago,
  still valid and with no answer, each one a tap away. Quotes past their validity are named apart
  (they stay out of the win rate). "Show details" lists every waiting quote with its sent date,
  validity and who made it.
- **Win rate:** quotes accepted ÷ (accepted + declined), by count and by value, for the period you
  pick and against the comparison period, grouped by month, quarter, gig type, client, who made the
  quote, lost reason or one of your own "choice" fields (such as a sales channel). Also the median
  time from sending to the answer, the average quote value, the discounts given on accepted quotes
  (list price against what they were accepted for) and why quotes were lost.
- **Clients:** each client's revenue, margin, gigs and average gig for the period; "Show details"
  adds quotes, win rate and the first, last and next gig. Tiles show what the top 5 clients bring
  and how many clients are new or returning.
- **Three new key numbers** on Reports → Overview and your Home: quotes to follow up, win rate over
  the last 90 days and the top client this year.
- Help guide "Follow up quotes and see what sells", with pictures, and the terms follow-up, time to
  decide, discounts given, new and returning clients.

#### Connected
- **Quotes:** a "To follow up" choice in the status filter (also opened from the report and the
  new tile).
- **Contacts:** each client's card shows its numbers for the last 12 months (revenue, margin, gigs,
  average gig, quotes, win rate, first, last and next gig), with a link to Reports → Sales.
- **Overview:** the "Quotes waiting for an answer" tile now opens Reports → Sales.

### K5: Equipment money

#### Added
- **Reports → Equipment: what your gear earns.** Profit per item, category or unit in any period:
  revenue minus depreciation, repairs not charged to the client, inspections, hire-in for the
  item and losses at replacement value (less any payout). A set's revenue is shared out to its
  contents by their day prices; rental lines typed by hand show as "not linked to an item: N%".
  Labour is not shared out to equipment. Tiles compare with the previous period or last year;
  the chart shows the best and worst items; "Show details" groups by item, category or unit
  (a unit bought mid-period gets a smaller share).
- **Payback** per item and unit: revenue since purchase against the purchase cost, the day it
  paid for itself, or when it will at the pace of the last 12 months.
- **Buy or keep hiring in:** what each item cost to hire in over the last 12 months against the
  cost to buy as many as you hired at once (cost price, else replacement value), and the months
  that would take to pay back.
- **Purchase costs:** how many items and units have a purchase cost, with a list of the items to
  fill in.
- **A Numbers card on each item page:** revenue so far, payback, use over 12 months and the next
  bookings.
- **Three new key numbers** on Reports → Overview and your Home: best and worst earner this year,
  and hire-in spend this year.
- Help guide "See what your equipment earns", with pictures, and the terms equipment profit,
  payback, and buy or keep hiring in.

#### Connected
- Inventory → Reports now opens Reports → Equipment; the old use-and-value table is its
  "Use and value" view (the menu item and the equipment-use tile point there too).
- Inventory → Subrentals lists items hired in during the last 12 months with a "Buy instead?"
  link to that item in "Buy or hire in".
- The item page shows the Numbers card (admins and members).
- Overview and Home: the three tiles, read from their own function (`report_overview_k5`); the
  Overview now calls `report_overview` plus any function a tile names as its `source`.

### K6: Warehouse and upkeep

#### Added
- **Reports → Warehouse** (admins and members): four views for any period, days still to come
  included. *Demand*: for each item, the busiest moment booked against what you owned that day
  (from the stock history) and what you hired in for it, the days over stock, the days still short
  after hiring in and how often it was hired in; idle gear (no confirmed booking in 12 months) with
  its book value, as candidates to sell. *Suppliers*: hire-in spend per supplier, requests confirmed
  or declined and how long suppliers take to answer. *Damage and loss*: repairs per item, gig and
  client, how long they took, their cost and what was charged back; losses per gig and client;
  inspections overdue, due in 30 days, never done, and their cost. *Dispatch*: per gig, scanned out
  against planned, back against out and still missing; how many days before the gig gear left;
  scans per day (the warehouse's workload). CSV and print. Money shows only for those who see it.
- Three Overview tiles: items short in the next 30 days, units in repair, inspections overdue
  (with how many were never inspected).
- Hire requests now remember when they were sent and when they were answered, so the time to answer
  can be counted.
- Help: terms demand against stock, idle stock; ⓘ on the Warehouse report; guide "See how the
  warehouse is doing" with four new pictures and the refreshed Overview and Home pictures.

#### Connected
- Inventory → Maintenance: "Repair and inspection numbers" (admins and members).
- Inventory → Subrentals: "Supplier numbers" next to the suppliers.
- Dispatch page: "Dispatch numbers" for the organisation's admins and members.
- Overview and Home: the three tiles. The morning reminders keep notifying inspections that are due;
  nothing new is sent.
- Menu: Reports → Warehouse.

### K7: Operations and people

#### Added
- **Reports → Operations** (admins and members): four views for any period. *Activity*: gigs and
  gig days per month by status or type, cancellations, the busiest days and how far ahead gigs are
  booked. *People*: crew days (and the share done by freelancers), hours approved against planned,
  overtime, night, weekend and holiday hours, hours waiting for approval and how long approval
  takes; admins also get one row per person with utilisation and leave. *Staffing*: positions open
  and filled by gig date, how long they took to fill, crew-call answers and job posts. *Tasks*:
  open, overdue and done on time, per gig (and per person for admins). CSV and print.
- **Gig wrap-up**: a printable page per gig once it has ended, with planned against actual hours
  (each person for the gig's managers and admins), the money for those who see it, what came back
  damaged, was lost or isn't back yet, open tasks, and notes for next time.
- **Person page** (admins only): one person's days, hours and cost with the organisation, their
  gigs, and for staff their utilisation and holiday left.
- A **"Cancelled" gig status**, so cancellations can be counted. A cancelled gig holds no crew or
  equipment, isn't a clash, leaves the calendar feed and sits with the archived gigs.
- Four Overview tiles: crew days this month, open positions in the next 14 days, overdue tasks,
  hours waiting for approval.
- Help: terms crew day, staff utilisation, time to fill, gig wrap-up; guide "See how the work went".

#### Connected
- Gig page: "Open the wrap-up" once the gig has ended (managers, admins and members).
- Crew tab: admins open each person's page from their row.
- Organisation → Tasks: a link to Reports → Operations → Tasks.
- Overview and Home: the four tiles. Data map: a row for per-person reports.

#### Changed
- The suggested own status "Cancelled" now stands for the new built-in status (it stood for
  Archived). Existing organisations' statuses are unchanged.

### K8: Crew numbers

#### Added
- **My numbers in My work:** your own work on AVX in a year, at every company: gigs, days and hours
  (approved and waiting), overtime, what you earned (approved hours at your fee, else the agreed fee
  once the gig is over) and what is booked, what is not paid yet, km and travel time, earnings by
  month, per company, your busiest months and functions, the job posts you applied to and the crew
  calls you answered, and expense claims still to be paid back to you. Only your own rows; a company
  shows only its name. Three tiles on My work: earned this month, not yet paid, booked days in the
  next 30 days.
- **Year statement** per company: one row per month with the totals, then each gig. Download it as a
  CSV or print it for your tax return.
- **Fee paid:** in a gig's labour cost panel, those who see money tap "Mark paid" on an agreed fee. It
  records the payment as an expense linked to the fee (or adds the date to the invoice already
  recorded), so it counts once, and tells the person it was paid and on which date (not the amount).
  The person sees "Paid on …" on their fee and can mark it received.
- **Expenses → Crew to pay:** agreed fees on gigs that are over and not marked paid, with "Mark paid".
  Admins see everyone; members see the gigs they manage.
- **A new key number** on Reports → Overview and your Home: crew fees to pay.
- **Reports → Money → Cash** counts crew fees to pay (agreed fees on finished gigs with no invoice
  yet) in what goes out this month; a fee whose invoice is recorded counts once, through the invoice.
- Help guide "See what you earned and get your year statement", with pictures, and the terms fee paid
  and year statement.

#### Connected
- My work (tiles and menu), the labour cost panel (paid), My fee (paid on, received), Expenses (Crew to
  pay), Reports → Overview and Home (crew fees to pay tile). Step 27 will reuse the monthly summary
  (`my_monthly_summary`).

### K9: Report extras

#### Added
- **Weekly key numbers by email (admins, opt-in):** in Settings → Notifications, admins can turn on
  an email every Monday morning with the key numbers of each organisation they run: revenue this
  month and in the next 30 days, quotes waiting and to follow up, overdue invoices, money expected
  in, bills due, crew fees to pay, open crew positions, items short and overdue tasks. Each line links
  to its report. Off for everyone until they turn it on.
- **Saved views:** "Save this view" on every report tab keeps the report with its period and filters
  under a name. Pinned views show on Reports → Overview; "Manage" lists all of them to pin, unpin or
  remove. Only you see your saved views.
- **Monthly management pack:** on Reports → Overview, pick a month that is over and download one PDF
  with the key numbers, the month's money against the month before, sales, the top clients and the
  best and worst earning equipment.
- **A read-only link for your accountant (admins):** on Reports → Overview, make a link to one
  period's money (results by month, invoiced, received, paid out and spending by category). Choose
  how long it works (7, 30 or 90 days); revoke it at any time. An expired or revoked link shows
  nothing. AVX keeps only a fingerprint of the link, so it is shown once.
- Help guide "Saved views, the monthly pack and the accountant link", with pictures, and the terms
  saved view, management pack, accountant link and weekly key numbers.

#### Connected
- Email summary (the weekly email uses its Brevo sender and secrets, and Settings → Notifications),
  Reports → Overview (saved views, pack, accountant links), notification settings (the weekly
  opt-in, admins only).

## 0.76.1 — Reports try again when the server is slow

### Fixed
- **Reports try again once by themselves when the server is slow.** If a report (Overview,
  Revenue, Gig margins or Money) can't be read because the server is briefly busy, took too long
  or the connection dropped, it waits a moment and asks once more before saying it couldn't be
  loaded. Errors such as missing permission are still shown at once.

## 0.76.0 — Money: cash, spending and forecast

### Added
- **Reports → Money → Cash:** who owes you what and what you have to pay. Tiles for what is
  overdue now and what is expected in and out over the next three months; a chart of the cash
  position for each of those months (expected in − expected out). Overdue invoices are grouped by
  age (0–30, 31–60, 61–90, over 90 days, by your organisation's date), each client has a balance,
  and recurring costs coming up are listed. "Show details" adds the months ahead line by line and
  invoiced, deposits, credit notes, received and paid out per month. Cash figures include VAT.
- **Spending:** confirmed expenses by category, supplier, gig or month, against the comparison
  period, with the five biggest changes listed first.
- **Forecast:** accepted revenue of upcoming gigs per month for the next three months. Quotes
  waiting for an answer are shown apart, with the win rate beside them, never multiplied in.
- **Budgets and targets:** set a monthly budget for an expense category or a monthly revenue
  target and follow its progress for any period; "over budget" is said in words.
- **Four new key numbers** on Reports → Overview and your Home: overdue now, cash expected in 30
  days, expenses due in 14 days and confirmed revenue in the next three months.
- Help guide "Follow the company's cash", with pictures, and the terms cash position, overdue by
  age, win rate, budget and target.

### Connected
- Invoices, Expenses → Unpaid and due, and Contacts (clients and suppliers) link to the new views.
  A recurring cost counts once per date, whether it is still to come or already drafted. The client
  portal (step 26) will show a client's balance from the same function.

## 0.75.0 — Money: results and margins

### Added
- **Reports → Money:** the company's results for a month, quarter, year or your own dates, compared
  with the period before or the same period last year. It starts simple: revenue, gross margin,
  operating result, the gigs that lost money and a chart of the operating result by month. "Show
  details" opens the results line by line: revenue by kind (rental, sale, crew, transport, other),
  each direct cost (labour, subrentals, repairs not charged to the client, gig expenses, other
  direct costs, cost of goods sold), overheads by category and depreciation, next to the comparison
  period. Tap a category to open its expenses for that month.
- **Margins:** the same numbers grouped by gig type, status, client, kind of line, production
  manager, month or quarter. A gig with two production managers is shared equally between them, so
  the rows always add up to the total. "Margin per gig" opens the Gig margins list.
- **Labour:** planned hours and cost against the hours approved and the cost counted, per gig or per
  month.
- **Depreciation:** equipment is now spread over the months it is used: units by their purchase cost
  and write-off months, bulk purchases by their cost, and capital expenses over their category's
  months. A unit or purchase paid with an expense counts once, through the expense.
- **Four new key numbers** on Reports → Overview and your Home: revenue this month against the
  same days last year, gross margin % this year, operating result this year, and gigs losing money
  this year. They take the place of the two monthly margin tiles, which live on in Gig margins.
- What is estimated says so (labour from the rate card, units with no purchase cost), sale items
  with no cost price are counted and named, and every currency is shown apart. Help guide "See how
  the company is doing", with pictures, and the terms gross margin, operating result and cost of
  goods sold.

### Connected
- A gig's finance panel links to the company results; the Overview and Home show the new tiles;
  overhead categories open their list in Expenses. Gig cards keep their margin hint: it is the same
  number the Money report counts per gig (step 10's `gig_finance`), so nothing on the card changed.

## 0.74.1 — One loading sign, and a plan for room to breathe

### Changed
- Everything that loads now shows the same sign: the AVX mark building itself square by square
  (the brand's "Pixel Build"), then starting again. This replaces the fast-spinning square while
  the app opens and the spinning circles on pages, sections and busy buttons (about 200 of them).
  With reduced motion or Comfort mode on, the mark shows still.

### Planned
- A design refresh to give every screen more room: more space between sections, fewer boxes,
  one green thing per screen, explanations behind ⓘ and fewer buttons in view. The rules are in
  DESIGN.md and the order of work (DR1–DR6, starting with a home you can rearrange) in
  docs/DESIGN_REFRESH.md. Nothing on screen changes yet apart from the loading sign.

## 0.74.0 — Repairs charged to the client, and payments

### Added
- **Payments on invoices:** open an issued invoice and record each payment that comes in: the date,
  the amount, how it was paid (bank transfer, MB Way, Multibanco, card, cash, cheque, other) and a
  note. Part payments add up; the invoice turns paid by itself when the payments (and any credit
  notes) cover it, dated the last payment. "Mark as paid" now records a payment of whatever is
  left. Recorded one by mistake? Remove it and the invoice goes back to unpaid. A payment can't be
  more than is left to pay or dated in the future.
- **Repairs charged to the client:** a repair marked "Charge the client for this" now waits in the
  gig's invoice draft under "Repairs to charge the client"; "Add to invoice" adds it as a line at
  the repair's cost (change the price if you like). Each repair can be on one invoice only; the
  repair shows "billed on invoice …" or "not billed yet".
- Invoices you had already marked paid were each given one payment of their full amount ("Other",
  on their paid date), so the totals still add up.
- Help: the terms "payment" and "repair charged to the client", ⓘ notes for the payment amount,
  the repairs in an invoice draft and "Charge the client for this", and a new guide "Charge repairs
  and record payments" with two pictures; the guide "Invoice a quote" now points to payments.

### Changed
- An invoice can no longer be set to paid (or back) directly: it follows its payments.
- The unpaid and overdue totals (Invoices page, a gig's finance panel, Contacts → Clients) count
  only what is still left to pay, so part payments show.
- Overdue reminders skip invoices with nothing left to pay.

### Connected
- Repairs (billed on which invoice), invoices (payments section, repairs in the draft), the
  Invoices list ("… left to pay"), gig finance and Contacts (paid and outstanding now include part
  payments), the organisation export (an `invoice-payments` file), and a `payments_by_month`
  function for the cash reports (K3). The client portal (step 26) will show payments later.

### Not included
- Payment links (MB Way, Multibanco references, Stripe): left for the client portal (step 26).

## 0.73.0 — Invoicing program connectors

### Added
- **Connect your invoicing program** (admins, Invoices → Invoicing program): Moloni, InvoiceXpress
  or TOConline, one per organisation. "Send to …" makes the invoice a draft in your program; you
  check and finalise it there; "Check …" brings back its number, dates and PDF link. Credit notes
  too. AVX still never issues an invoice itself, and adding the number by hand always works.
- Each program is switched on only after it has been tested with a real account, so at first the
  panel may offer none.
- **Keys stay on the server:** the InvoiceXpress API key and TOConline's secret are stored where
  nobody can read them back in the app, admins included.
- **CSV of invoices** on the Invoices page: the invoices shown, one row per line, to import into a
  program without a connector.
- Help: the term "invoicing connection", ⓘ notes for the program and its keys, and a new step and
  picture in the guide "Invoice a quote"; the invoice pictures were refreshed.

### Not included
- Vendus: its connection would issue the legal invoice straight away (it has no drafts), so it
  stays by hand or CSV.

### Connected
- Invoices (send and check buttons), Company details (names the program), the organisation export
  (an `invoicing-connection` file without keys; the program on each invoice) and help.

## 0.72.0 — Invoices

### Added
- **VAT per line on quotes:** each line has its own VAT % (a new column). The quote's VAT % is the
  rate new lines start with, and "Apply this rate to every line" changes them all. A line at 0 %
  asks for the legal reason (AT code), which the invoicing program needs. When lines differ, the
  summary and the printed quote show the VAT per rate. Existing quotes kept their rate on every
  line, so no total changed.
- **Invoices** (admins and members), under Quotes → Invoices and on each accepted quote's
  Summary. Make an invoice for the whole quote, some phases, a deposit % or, after a deposit, the
  rest (the deposit is deducted). The client comes from Contacts; each line keeps its VAT rate.
- **Issued in your own program:** AVX prepares the invoice; you create it in your certified
  invoicing program (Moloni, InvoiceXpress, Vendus…), mark it as sent and add the number and PDF
  link it gave. AVX never issues an invoice itself: in Portugal only certified programs may.
  Connecting the most used programs directly is planned (step 11b).
- **Status** draft → sent to your program → issued → paid, with overdue worked out from the due date
  (default 30 days, set in Company details). **Credit notes** against an issued invoice, never
  more than is left on it.
- **Overdue reminders:** a notification to the quote's author and the admins, then weekly while it
  stays unpaid; "Email the client a reminder" sends them the PDF link.
- Help: the terms invoice, credit note and certified program, ⓘ notes, and the guide "Invoice a
  quote" with pictures; the quote pictures were refreshed.

### Connected
- Quotes (invoiced and left to invoice on the quote; "Invoiced …" in the list), contacts (each
  client's invoiced, unpaid and overdue), the client's conversation on the quote (post the issued
  invoice there), gig finance (invoiced vs paid), notifications and the email summary, the
  organisation export (`invoices` and `invoice_lines` files), and the revenue rule (each line now
  carries its VAT rate; amounts unchanged). K3 will read the issue, due and paid dates.

## 0.71.0 — Gig finance

### Added
- **Gig finance on each gig** (admins and members): the gig's Overview shows what it brings in and
  what it costs, excl. VAT, in euros. Revenue is every accepted quote of the gig (none accepted:
  the newest sent quote, marked as an estimate). Costs are labour (approved hours or the crew
  member's invoice, else the agreed fee, else the rate card), confirmed subrentals, repairs not
  charged to the client and expenses linked to the gig. An expense linked to a subrental, repair
  or crew fee replaces its planned amount, so each cost counts once. Margin in money and %, and
  it says in words when part of it is an estimate.
- **Add expense** right from the gig's finance panel.
- **Save as agreed fees:** once a gig is completed, its managers can keep the rate card's amounts
  as each person's fee, so a later rate change doesn't change the gig's margin.
- **Reports → Gig margins:** every gig starting in a period with revenue, cost and margin,
  compared with the previous period or last year; margin by month; "Show details" for the
  filters (status, type, client) and the table; CSV and print.
- **Two new key numbers** on Reports → Overview and the organisation's Home: margin of this
  month's gigs, and how many of them lose money.
- **Margin on gig cards:** admins and members see "Margin 18%" on each gig that has a quote in the
  organisation's gig list ("est." when part of it is estimated; red with its minus sign when
  negative).
- **Organisation export:** a new `gig_finance` file with every gig's revenue, costs and margin.
- Help: the term "gig margin", an ⓘ on the panel and the guide "See what a gig earns" with
  pictures; the Reports pictures show the new tiles.

### Connected
- Overview tiles and the Home key numbers, gig cards, expenses (add one from the panel), the
  labour panel's rule (the same in the database), the organisation export. K2 builds on the new
  `gig_finance` function.

## 0.70.0 — New look

### Changed
- **New look: Lumen & Pixel design language (Show, Daylight and Contrast themes, square UI, AVX
  glyph).** The rules are in [DESIGN.md](DESIGN.md). Nothing you can do changed: same screens,
  same places, same data; only how it looks.
- **Three themes** with the same names as before: Show (dark navy, the default), Daylight (light)
  and Contrast. One electric green marks the one thing to do on a screen; on Daylight that is
  navy, and green text becomes olive so it stays readable.
- **Square everywhere, flat everywhere:** no rounded corners, shadows, blur, glows or gradients.
  Cards, menus and dialogs are separated by thin lines. The sign-in page sits on a quiet dot
  field.
- **Two typefaces:** Space Mono names things and holds the numbers (titles, labels, table
  headings, times, dates, money, quantities, codes); Inter explains. "Readable font" in
  Appearance still swaps both for Atkinson Hyperlegible. Nunito is gone.
- **The AVX glyph** replaces the lightning bolt: in the top bar, the sign-in page, the browser tab
  and the installed app's icon.
- **Navigation:** the top bar is 56 px with a green bar under the section you're in; menus are
  square panels with up to four cards; on phones the tab bar has a bar on the current tab and
  "More" opens a plain list. Each workspace shows a two-letter monogram.
- **Statuses and labels** are a small square and the word, everywhere (gigs, quotes, units,
  repairs, subrentals, hours, leave, expenses); a gig's labels keep the nine colours you chose,
  now as a square beside the name. Calendar gigs are blocks with their label square; drafts
  (holds) have a dashed edge.
- **Gigs:** the list shows a date block and, in My work, your call time; your own call is the
  green "Call" chip in the gig header. Someone booked elsewhere at the same time gets a red
  "Clash" row with a sentence saying where and what to do. Availability questions show the days
  as squares and two large answers. The schedule marks what is on now (▶) and greys out what is
  done.
- **Quotes:** square phase tabs (dashed for optional phases), lines on a tighter grid with numbers
  in Space Mono, "Send to client" as the one green button, and the autosave shown as a square.
- **Inventory and scanning:** a square 14-day availability strip, segment bars with "7 / 12"
  counts, square corner brackets on the camera and a plain scan log with ✓ ⚠ ✕ and words.
- **Loading** shows a blinking square instead of a spinning circle.
- The call sheet, quote document, packing list and QR labels stay white paper with navy ink in
  every theme.
- Help: every guide picture redone in both languages.

## 0.69.0 — Reports

### Added
- **Reports** (step K1, [docs/ANALYTICS.md](docs/ANALYTICS.md)), a new menu section for the
  organisation's admins and members. **Overview** shows four key numbers: gigs this month,
  confirmed revenue in the next 30 days, the value of quotes waiting for an answer, and equipment
  use over the last 90 days. Tap one to see where it comes from.
- **Revenue:** net revenue of accepted quotes for this month, last month, this quarter, this year,
  the last 12 months or your own dates, compared with the previous period or the same period last
  year (a period not yet over is compared day for day). Simple first: three numbers with their
  change and one chart. "Show details" (remembered on your device) adds filters by gig status,
  type and client, a chart by kind of line, and a table grouped by kind, client, gig, gig type or
  month, with CSV and print. Every chart can be read as a table.
- **One revenue rule** everywhere: each priced line of an accepted quote after its line, phase and
  quote discounts, excl. VAT, without optional phases or comments, dated by the gig's start date
  (a quote without a gig: its first phase date, else its issue date). It is counted in the
  database and checked against the same examples in the app and in the database. Currencies are
  never added together.
- **Key numbers on the organisation's Home** (not in simple mode), which you can fold away.

### Changed
- **Inventory → Reports is counted in the database**, so organisations with more than 1000 units,
  bookings, quotes or movements now get complete figures. Revenue there now follows the revenue
  rule: a quote counts in the period its gig starts (before, its issue date), every accepted
  quote counts (before, at most 5,000), and only euro quotes are added (before, other currencies
  were added in as if they were euros). Days are counted in the organisation's time zone.
- **Labour cost panel:** "Quoted" now adds the crew lines of every accepted quote of the gig,
  after phase discounts too. With no accepted quote it uses the newest sent quote and says
  "estimate"; a draft never counts.

### Connected
- Inventory → Reports, the labour cost panel, the organisation's Home, the menus (a Reports
  section) and usage counts (which report tabs are opened and downloaded).
- Help: a guide with pictures ("Read the reports"), a page note and four glossary words (net
  revenue, estimate, comparison period, utilisation).

## 0.68.0 — Expenses

### Added
- **Expenses** (step 9b, [docs/BUSINESS.md](docs/BUSINESS.md)). The new **Expenses** page
  (Organisation → Expenses, for admins and members) records every company cost with its receipt:
  date, supplier (from Contacts or typed), what for, category, amount excl. VAT, VAT and total,
  currency, the supplier's invoice number, due date, when and how it was paid, and notes. Add the
  receipt with the phone camera or as a PDF. Type the amount excl. VAT or the total: the VAT is
  worked out.
- **Views, simple first:** this month's costs by kind (job costs, running the company, equipment
  and vehicles, taxes and other), what is unpaid and due (overdue first), claims, recurring costs.
  "Show details" adds the VAT, the totals by category and each expense's invoice, dates, link and
  receipt. Search and filter by kind and category. **CSV for the accountant.**
- **Categories:** each organisation starts with 23 (hire-in, fuel, tolls, rent, insurance,
  equipment…); admins rename, add and archive them. Equipment, vehicles and computers are spread
  over a number of months instead of counting as the month's cost.
- **VAT:** the organisation recovers VAT (as a VAT-registered company does), so costs count without
  it, except in categories where VAT can't be recovered (meals and travel to start). An admin can
  switch this off.
- **Expense claims:** anyone on a gig (crew too) claims what they paid themselves, from the gig's
  Crew tab, with a photo of the receipt. The gig's managers approve it or send it back with a note;
  both sides are notified. Approved claims show as "to reimburse" until someone adds the date they
  were paid.
- **Recurring costs** (rent, insurance, leasing): monthly, quarterly or yearly. Each one is drafted
  on its date for someone to confirm, and only counts once confirmed.
- **Who sees money:** the organisation's admins and members (decision D23). Crew see only their own
  claims; a gig's managers see its claims.

### Connected
- **Each cost counted once:** an expense can be linked to a subrental, a repair, a crew fee or a
  stock purchase, and then it is that record's actual cost (only one expense per record).
  Subrentals and repairs show the linked expense next to their planned amount, with "Add expense"
  until there is one. The labour panel shows a crew fee's invoice as that person's actual cost.
  Adding bought stock can record the supplier's invoice too.
- Contacts: each supplier shows what you spent with them this year and what is unpaid.
- Notifications in the app, by push and in the email summary; the organisation export (three new
  files: expense categories, expenses and recurring costs); the data map (receipts).
- Help: a guide with pictures ("Keep track of expenses"), four ⓘ hints and four glossary words.

## 0.67.0 — Leave

### Added
- **Leave requests** (step 9, [docs/BUSINESS.md](docs/BUSINESS.md)). An organisation's staff
  (admins and members) ask for leave in the new **Leave** page: holiday, sick, training or other,
  with a half day at the start or end if needed. The form shows how many working days it uses.
  Holiday, training and other wait for an admin, who approves or refuses (with a reason the person
  sees); both sides get a notification. A sick day counts at once, even for days already past, and
  the admins are told. Admins can also enter leave for someone, which counts at once.
- **Holiday days.** Each organisation has its holiday days per year (22 to start). An admin can
  give a person their own number for a year and type the days carried over from last year
  (nothing carries over by itself). Everyone sees their own balance: allowance, carried, taken,
  waiting and left; admins see everyone's.
- **Working week** per member of staff: their working days (Monday to Friday to start) and hours
  a day. Leave only counts working days, leaving out weekends off, Portugal's national holidays
  and the organisation's own.
- **Who is away**: the month day by day, for the organisation's admins and members. Members see a
  colleague's sick day only as "away", and never the notes.
- **Types for your own dates.** Freelancers' unavailable dates (My work → Availability) now have a
  type too, and still need no approval. Staff see their organisation leave there with its status,
  and a button to ask each organisation for leave.

### Connected
- Approved leave makes the person busy everywhere unavailable dates did: clashes on a gig's Crew
  tab, Find crew's "free only", and the ⚠ in the network picker (a half day only blocks that
  morning or afternoon). A request waiting for approval doesn't block anyone yet. Other companies
  still only see "busy", never the type.
- Time registration: no hours can be logged on a whole day of approved leave (a half day still
  allows them).
- Notifications in the app, by push and in the email summary; your calendar feed (your approved
  leave and unavailable dates as all-day events); the organisation export (new leave, holiday
  days, working weeks and settings files).
- Reports (K7): the database can now count each person's working days, leave by type, days and
  hours available and approved hours logged, ready for the K7 people reports.
- Help: two guides with pictures ("Ask for leave", "Approve leave and keep holiday days right"),
  five ⓘ hints and three glossary words.

## 0.66.0 — Hours

### Added
- **Time registration** (step 8, [docs/BUSINESS.md](docs/BUSINESS.md)). Everyone on a gig logs
  their hours per day on the gig's Crew tab: start, end, break, and optionally travel time and
  kilometres. Start and end fill in from their booking or the gig's schedule. An end before the
  start means they worked past midnight. Without a connection the hours wait on the phone and are
  sent when it's back.
- **Clock in / clock out** in On-site mode: one tap when you start, one when you finish, and the
  day is sent to the gig's hours.
- **Approval.** The gig's managers see everyone's days, each with its split (normal, overtime,
  night, weekend and holiday hours) and its cost. They approve a day, or send it back with a note
  ("Approve all" does every waiting day at once). The person is notified either way, and the
  managers are notified when hours come in. Approved days are locked, and each keeps its hours
  split and cost exactly as they were when it was approved, so changing a rate later never
  rewrites past costs.
- **How hours are paid**, as decided: overtime after the organisation's "overtime after" hours;
  night hours in a window the organisation sets (22:00–07:00 to start with); weekends; Portugal's
  13 national holidays plus the organisation's own days (a town holiday, Carnival). Each hour gets
  only its highest factor. A day fee pays the day rate plus extras at its hourly equivalent; an
  hour fee pays hours × rate × factor; a fixed fee ignores hours. Travel time is paid at the plain
  hour rate; km at a rate per km the organisation sets.
- **Labour cost** now shows the actual cost from approved hours next to the planned cost, for
  each person and in total.
- **My hours** (in My work): your hours on every gig, month by month, with what approved days pay.
  **Hours** for organisation admins: everyone's hours per person and month, with their approved
  cost. Both download as CSV, as does each gig's list.
- Organisation settings → Crew rates: the night window, the rate per km, and your own holidays.
- Help: two new guides with pictures ("Log your hours on a gig", "Approve crew hours and see the
  actual labour cost"), three ⓘ hints and a glossary word. The factors hint now explains how the
  factors apply to hours.

### Connected
- The labour cost panel (actual next to planned), My work (a "My hours" page), On-site mode
  (clock in and out), notifications (in the app, by push and in the email summary), your calendar
  feed (each gig shows the hours you logged on it), and the organisation export (new hours and
  holidays files; the factors file has the night window and km rate). Reports K2, K7 and K8 will
  read the approved days' stored hours and cost.

## 0.65.0 — Fees from the rate card

### Added
- **Crew calls can carry a fee** (step 7b, [docs/BUSINESS.md](docs/BUSINESS.md)). When you send
  a crew call for a function, the fee fills in from your rate card: the day rate for the gig's
  days, with weekend days at the weekend factor. Change it or leave it empty. The people you call
  see the fee in their offer and its notification before they answer; whoever accepts has it as
  their agreed fee, so "Labour cost" shows them as "Agreed". A fee you already set for them is
  kept. The gig's list of crew calls shows each call's fee.
- **The same fee on the other offers.** Find crew's "Offer a place" has the fee fields too, and
  starts from that person's own rate if they have one. On the job board, "Offer the place" now
  opens a small window (instead of the browser's OK / Cancel box) with the fee: the day rate the
  applicant sent for the post's days, else your post's pay. Change it or leave it empty.
- The crew call's note now gives "black clothes" as an example instead of "fee as usual". Find
  crew's offer no longer says pay is agreed in the messages or asks for their day rate, and its
  help guide mentions setting a fee in the offer.
- **Job posts** fill in the pay from the rate card when you choose the function (the day rate per
  day, else the hour rate per hour). You can still change it.
- **Quotes** show, under each crew line, its cost by your rate card and your margin, and the
  Summary tab adds them up under "Crew margin". Only your organisation's admins and members see
  this; it's never on the client's printed quote, PDF or link. Amounts are euros before VAT.
- Help: the "Set crew rates and see a gig's labour cost" guide has three new steps with pictures,
  and two new ⓘ hints.

### Connected
- Crew calls, Find crew's offer, the job board's offer, the chat offer card and its notification,
  the job board's post form, the quote editor and its Summary, and the gig's labour cost panel
  (an accepted offer's fee shows as agreed).

## 0.64.0 — Numbers start counting

### Added
- **History for the reports starts now** (step K0, [docs/ANALYTICS.md](docs/ANALYTICS.md)). No new
  report screens yet; these fields are recorded from today so the reports have months of data
  when they arrive. Only admins and members see them; amounts are without VAT.
  - **Quotes** remember when they were first sent and when the client accepted or declined,
    however that happened (in the editor, by email or through the client's link). Marking a
    quote Declined asks why it was lost (price, another supplier, cancelled, not available, scope
    changed, other) with an optional note; a client's note from the link is kept as the note.
  - **Gigs have a client** from Contacts: a picker in the new and edit gig forms, copied by
    "Create gig" from a quote, and filled by the jobs import when the client's name matches.
    Crew don't see it.
  - **Equipment costs:** a cost price and a write-off period per item; the cost each when you
    add stock you bought (it starts from the cost price) and the price each when you sell stock;
    an optional cost on inspections; and a sale or payout value when a unit is retired or lost.
    The equipment import recognises a cost price column.
  - The **organisation export** has the new columns.
- Existing quotes and gigs were filled in where possible: sent and decided dates from the client
  links (otherwise from the last change, so older dates are approximate), and each gig's client
  from its accepted quote, otherwise its newest one.

### Connected
- Quote editor, send-quote and quote-public (one database rule sets the dates for all three), the
  new and edit gig forms, "Create gig" from a quote, the stock and unit forms, Record inspection,
  the jobs and equipment imports, and the organisation export.

## 0.63.11 — A restore you can practise

### Fixed
- **Turning on file backups no longer wipes the database backup.** The nightly backup fetched the
  code after making the database copy, and that step empties the folder first, so with the
  files secret added each night's backup would have held only the files. The code is now
  fetched first. Backups made so far were not affected (the files secret was never set).

### Changed
- **Backups page rewritten as a restore drill** ([docs/BACKUPS.md](docs/BACKUPS.md)): what is and
  isn't backed up, what would have stopped a restore, a step-by-step drill into a throwaway
  Supabase project with checks (row counts, signing in, opening a gig's file), what to do for a
  real restore, and an "If the live site is down" checklist. The old restore command didn't work
  on Supabase; the drill builds the structure from the migrations and loads only the data.

## 0.63.10 — No more silent overwrites

### Fixed
- **Two people editing the same thing no longer overwrite each other.** If you and a colleague
  had the same gig, schedule item, task, client or catalogue / price-list item open, whoever saved
  last quietly replaced the other's changes. Now the second save is refused with "Someone else
  changed this — reload to see their changes" (also in Portuguese), and a Reload button. Your form
  stays open so you can copy what you typed. Quotes already worked this way. Quick one-tap
  changes (ticking a task, checking an input, moving things on a plot) still simply save.

## 0.63.9 — Pickers show everything

### Fixed
- **Pickers list everything, however big the organisation.** The equipment picker on a gig's
  Equipment tab and in the input list, stage plot, light plot and DMX patch tools, the client
  picker in Quotes and in a quote, the supplier lists in subrentals, and the units shown for a
  case's contents stopped at 1000. They now load everything. Nothing looks different.
- **Kits, alternatives and QR labels see the whole catalogue.** The Kits and Alternatives panels
  and QR label printing ("print all") only saw the first 1000 catalogue items. Now they see all.

## 0.63.8 — Imports and removing an organisation work at any size

### Fixed
- **Importing into a big organisation spots existing rows correctly.** The import preview reads
  what's already there (gigs, catalogue items, units, locations, contacts, kit contents, gig
  equipment, imported quotes, invites) to tell new rows from ones it will update. It used to read
  at most 1000 of each, so past that it could show rows as new. It now reads them all.
- **Removing an organisation removes all its files.** It used to find at most 1000 gigs, and at
  most 1000 files per gig, so with more than that, some files stayed in storage. Now every gig's
  folder is emptied completely.

## 0.63.7 — Stock checks hold under pressure

### Fixed
- **Two people can't take the same last items.** If two people sold or moved the same bulk item
  from the same place at the same moment, both could pass the "not enough stock" check, and the
  location went below zero. Now the second one waits a moment for the first to finish and then
  sees the real number. The message is the same as before.
- **More long lists load in full:** the clients and suppliers on the Contacts page, the gig
  picker in a quote, and My work no longer stop at 1000 rows. Nothing looks different.

## 0.63.6 — Long lists load in full

### Fixed
- **Big organisations see all their gigs, quotes and catalogue items.** The server sends at
  most 1000 rows at a time, so Home for an organisation, the Quotes list, the price list in
  quotes and the Inventory catalogue and stock totals quietly left out everything past the first
  1000. On Home, those were the newest gigs. AVX now reads long lists in batches of 1000 until it
  has them all. Nothing looks different.
- **Quote counts on the Contacts page stay right** for organisations with more than 1000
  quotes. The database now does the counting, instead of the page loading every quote.

### Faster
- **Stock totals don't slow down as history grows.** The database now keeps a running total
  per item and location, updated with every movement, instead of adding up every movement ever
  recorded each time Inventory opens or availability is checked. The numbers are the same.

## 0.63.5 — Town search works again

### Fixed
- **Finding a town works again** on the crew profile and in Find crew ("Find" / "Localizar"). It
  had stopped because OpenStreetMap's free place search refuses requests from our servers. AVX
  now uses LocationIQ, which uses the same OpenStreetMap data, on its servers in the EU. Only the town
  name you type is sent, as before. Results are towns only, never streets.
- A small "Search by LocationIQ.com" link now shows under the town field, as LocationIQ's free
  plan asks (EN, PT). The privacy notice names LocationIQ instead of OpenStreetMap.

## 0.63.4 — No personal address in the code

### Fixed
- Push notifications no longer fall back to a personal email address written into the code when
  the sender address isn't set; they use the app's address instead. Nothing changes while the
  sender address is set, as it is now.

## 0.63.3 — No more waiting on a silent service

### Fixed
- **AVX gives up after 10 seconds instead of hanging** when a service it relies on doesn't
  answer: the email service (Brevo), the phone and computer push services, OpenStreetMap's town
  search and the database itself (the EU VAT check keeps its 20 seconds, as that service is slow).
  You get a clear "took too long, try again" message instead of a spinner that never stops (EN, PT).
- **A quote or invite email that timed out says so honestly:** the email may or may not have gone
  out, so the screen asks you to check with the person before sending again, and nothing is sent
  twice on its own. Nothing is retried automatically where a retry could send a second email.
- The daily email summary stops for the day if Brevo stops answering, and never puts the same
  notifications in two summaries.
- **Long jobs finish in time.** The daily email summary and the nightly message clean-up stop
  starting new work after 100 seconds, so they always finish before Supabase's 150-second limit;
  whatever is left is done on the next run.
- A failed invitation email no longer passes the email service's own error text back to the app.
## 0.63.2 — No double emails

### Fixed
- **A quote is emailed once.** If the network is slow or drops just after you click "Send by email"
  and you click again, AVX now sees it's the same send: the client gets one email, the link in it
  keeps working (before, the second click replaced it), and no extra version is saved. The screen
  says it was already sent and shows it in the history (EN, PT).
- **An invite is emailed once.** Two invites to the same new address at the same moment (a
  double-click, two tabs, two admins) send one email; the other says it was already emailed a
  moment ago. If the email fails, inviting again still sends it.
- Push notifications already couldn't go out twice; nothing changed there.
- Database checks for both (`supabase/tests/no_double_sends.sql`).
## 0.63.1 — Limits on emails and push notifications

### Added
- **Send limits.** AVX now caps how many emails and push notifications it sends, so a fault in
  a screen or someone misusing an account can't flood Brevo and get the sending domain blocked:
  - **Invite emails:** 40 an hour and 150 a day per person, 300 a day per organisation, and at
    most 3 a day to the same address (inviting the same person again no longer emails them
    every time).
  - **Quote emails:** 20 an hour and 60 a day per person, 100 a day per organisation, and 5 a day
    to the same address.
  - **Email summary:** at most one per person every 20 hours, and 2,000 per run.
  - **Push notifications:** 60 an hour per person; test notifications 5 an hour.
  - **All emails together:** 250 a day, under Brevo's free plan (300 a day). Raise it after
    upgrading Brevo (see docs/PENDING.md).
- Over a limit, the invite is still saved and the quote link is still made; the app says the
  email wasn't sent and suggests sharing the link instead (EN, PT).
- Database checks for the limits (`supabase/tests/send_limits.sql`).
## 0.63.0 — Crew rates and a gig's labour cost

### Added
- **Crew rates** (Organisation settings → "Crew rates", admins): what you pay per function ("FOH
  engineer"), per person, or per person in one function, per day, half day or hour. The most
  specific rate wins. Admins and members can see them; crew never do.
- **Factors:** overtime (and after how many hours), weekend, night and holiday multipliers. Weekend
  days in a gig's planned cost use the weekend factor now; the others are for time registration.
- **Labour cost on a gig** (Crew tab, for the people running the gig): what each person costs, from
  the fee agreed with them or the rate card for their booked days. It shows the total, the crew lines
  of the gig's quote (the accepted one, else the newest) and the margin, and warns when someone has
  no rate.
- **Agreed fees:** set a person's fee on a gig per day, half day, hour or as a fixed amount, with a
  note, or go back to the rate card. Each person sees their own fee on the gig; nobody else on the
  crew does.
- **Export:** three more files in the organisation export: the rate card, the factors and the fees
  agreed on gigs.
- Help: guide "Set crew rates and see a gig's labour cost", with two pictures.

### Connected to earlier features
- Gig crew, their functions and booking times (the days counted), and quotes linked to a gig (crew
  lines, after the quote's discount).
- The crew function names from crew profiles are offered when adding a rate.
- The organisation export (S5) and the privacy notice and data map (0.62.1).
- Not yet: fees in crew calls and job posts, labour lines in quotes from the rate card, and the
  overtime, night and holiday factors (they need registered hours, step 8).

## 0.62.1 — Privacy and security check before more users

### Added
- **Data map** (docs/DATA_MAP.md): what personal data AVX keeps, where, who sees it, why and for how
  long, with the open items.
- **Security review** (docs/SECURITY_REVIEW.md): a whole-app pass against the OWASP Top 10. Nothing
  exploitable found; what's left is listed.
- **Browser tests for sign-in going wrong** (`e2e/auth/failures.spec.js`): wrong passwords five
  times, unknown emails, password reset and sign-in links for unknown emails, a short password and
  a malformed email at sign-up, and a broken session. They check that nothing reveals whether an
  email has an account.

### Changed
- **Privacy notice** (EN, PT): now covers tasks, repairs and inspections, organisations' own fields
  and two-step sign-in; dated 28 October 2026.
- Sign-in errors are announced by screen readers.
- Updated `ws`, `@remix-run/router` and `fflate` for security advisories (none was reachable in AVX).

### Connected to earlier features
- Sign-in and two-step sign-in, the crew network, tasks (T1, T2), maintenance, custom fields (S2)
  and the organisation export (S5), as described in the privacy notice and data map.

## 0.62.0 — Your own fields on gigs, clients, suppliers and items

### Added
- **Custom fields** (Organisation settings → "Custom fields", admins): add your own fields to gigs,
  clients, suppliers or catalogue items, such as "PO number", "Venue capacity" or "Insurance checked".
  - Six kinds: text, number, date, yes / no, choice from a list (one option per line) and link.
  - Up to 40 per kind of record. Rename, edit the choices or reorder with the arrows at any time; a
    field's kind can't change.
  - Removing a field (it asks first) hides it everywhere. Values already filled in are kept and still
    come out in the export.
- **In the forms:** the new-gig and edit-gig forms, the client and supplier forms and the catalogue
  item form show the fields after the built-in ones. The database checks every value against its
  field (a number is a number, a choice is one of the list, a link starts with http(s)://).
- **On the pages:** a gig's overview shows the filled-in fields under "More details"; a catalogue
  item's page lists them with its other details. Clients and suppliers show them in their form.
- **Search:** the gigs search also finds text and numbers in a gig's fields.
- **Export:** the organisation export has one column per field, named after it, in the gigs, clients,
  suppliers and items files.
- Help: guide "Add your own fields", with a picture.

### Connected to earlier features
- Gig statuses and types (S1, 0.61.0): the fields sit next to them in the gig forms and in the same
  organisation settings.
- The organisation export (S5): extra columns per field.
- Contacts (clients and suppliers), the inventory catalogue and the gigs list search.
- Not yet: the file imports (S3) don't map columns to custom fields.

## 0.61.0 — Your own gig statuses and gig types

### Added
- **Gig statuses** per organisation (Organisation settings → "Gig statuses and types", admins):
  your own names and colours ("Option", "Pencilled", "Invoiced"…).
  - Each one means one of AVX's five (draft, confirmed, active, done, archived), which still decide
    what is upcoming, past or archived.
  - "Start with a common set" adds six to rename; reorder with the arrows; remove (it asks first).
  - Changing what a status means moves its gigs; removing it keeps its gigs where they were.
- **Gig types** ("Festival", "Corporate", "Theatre"…) with colours, managed the same way.
- **On gigs:** the new-gig and edit forms offer your statuses (or the five built-in ones when you
  have none) and the gig types. The gig header and the gigs list show them in their colours; a new
  gig starts on your first status meaning "confirmed".
- **Gigs list and calendar:** filter by status and by gig type, also in My work across companies.
- **Export:** the organisation export's gigs file has two new columns, the status name and the gig
  type.
- Help: guide "Use your own gig statuses and types", with a picture; the "gig status" term mentions
  them.

### Connected to earlier features
- The five built-in statuses (lists, archiving, past/upcoming, notifications, activity log) are
  unchanged and kept in step by the database.
- Import of upcoming jobs (S3b, 0.45.0): imported gigs get the organisation's status matching what they were
  imported as.
- The organisation export (S5) and the offline copy of the gigs list.

## 0.60.0 — Truss load tables; LumiStage and StageKit compared

### Added
- **Truss load tables** (`src/data/truss/`, docs/TRUSS_DATA.md): 39 tables of allowable loads, copied
  from the manufacturers' own documents, for the rigging tools (RG2).
  - **Fantek:** EC30, EC40, EC29p, EC76.
  - **Global Truss:** F34, F34P, F34PL, F44, F44P, F43, F54, F14, F23, F24.
  - **Prolyte:** H30V, X30V, H40V, the triangle, rectangle and ladder types, S36, S52, S66 and
    B100RV.
  - **Per table:** UDL and point loads per span, with deflections, the manufacturer's conditions,
    and the source document with its address, edition and checksum.
  - **Checks run on every table:**
    - kg against lbs and mm against inches;
    - a second copy of the table where one exists (Prolyte's 2022 data sheets, Global Truss's
      black-finish pages, Fantek's certificates);
    - plausibility rules: no missing spans, loads falling and deflections rising with span, and
      beam-theory ratios at long spans.
  - **Status:** none can be used until a second person has compared it with its source. Four are
    blocked on questions to the manufacturers.
- `scripts/truss-data/`: downloads the documents and rebuilds the data byte for byte.
- `src/lib/trussTables.js` with tests: the plausibility rules fail the tests if a value is edited
  into an impossible state or a table is marked usable without a named checker.

### Docs
- **docs/COMPETITOR_RESEARCH.md:** LumiStage (3D stage planning on Windows) and StageKit (a free
  band rider tool) compared from their own sites.
- **docs/TOOLS_PLAN.md:**
  - a generator suggestion in P1;
  - MVR export;
  - overloaded positions coloured, in RG;
  - in the rider page: start from the line-up, plus a readiness check;
  - proposed, to confirm: venue pages.
- **docs/PENDING.md:** D12–D14.

### Connected to earlier features
- None in the app yet: the light plot's weights per position (RG1) and the rigging tools (RG2) will
  read these tables.

## 0.59.0 — Tasks (T2): organisation tasks, checklist templates, repairs

### Added
- **Organisation → Tasks** (`/org/:id/tasks`): the organisation's own tasks (office, warehouse,
  repairs) and those on its gigs that you can see, in one list.
  - Admins and members add tasks for anyone in the organisation, edit and remove them (removing
    asks first).
  - Filters: Mine, Open, Organisation, On gigs.
  - Gig tasks link to their gig and are edited there; they can be ticked here.
  - The list updates live and can be read offline.
  - Viewers of the organisation can read the list.
- **Checklist templates** (Organisation → Tasks → Checklist templates): a name, a checklist of up
  to 50 items and notes.
  - When starting a task, on a gig or for the organisation, "Start from a template" fills in the
    checklist (added after any lines already typed), and the title and notes if they're empty.
  - Changing or removing a template doesn't change tasks already made from it.
- **Repairs as tasks:** in Inventory → Maintenance, an open repair has "Make a task". It creates a
  task on the organisation with the item, unit and problem, ready to give to someone. A repair
  has at most one task at a time.
- **On-site mode:** your open tasks on the gig, most urgent first, with a button to the gig's
  Tasks tab, and a Tasks tile.
- Help: guide "Organisation tasks and checklist templates", with a picture. The On-site mode
  picture is updated.

### Connected to earlier features
- Tasks T1 (0.58.0): the same lists, task form and notifications. Someone given an organisation
  task gets "… gave you a task: …", opening My tasks.
- Inventory maintenance (I5): repairs.
- On-site mode (0.57.0): the tasks card and tile, also from the gig's offline copy.
- The organisation menu has a new Tasks item.

## 0.58.0 — Tasks (T1)

### Added
- **Tasks** on every gig, in a new **Tasks** tab: who does what by when.
  - Production managers add a task with a title, who it's for (anyone on the gig), a due date,
    notes and a short checklist (one item per line, up to 50), and can edit or remove it (it asks
    first).
  - Anyone who writes on the gig, and the person the task is for, ticks it done and ticks its
    checklist. Others only see it.
  - Overdue, due today and due within three days are marked; "Mine" and "Open only" filters.
  - Live for everyone on the gig, and readable offline from the last copy.
- **My tasks** (My work → My tasks, `/tasks`): every task given to you, on any gig, most urgent
  first, with a link to its gig.
- **Rehearsal notes → tasks:** in a rehearsal session, a production manager turns a note into a
  task in one tap, with the note's cue, text and the same person. A note becomes at most one task.
- **Notifications:** "… gave you a task on …" in the app, by push and in the e-mail summary,
  opening the gig's Tasks tab. Sent even when the organisation is muted, since it's addressed to
  you.
- Help: guide "Give out tasks on a gig", with a picture.

### Fixed
- The gig page had a second "main" area inside the app's own, which confused screen readers.

### Connected to earlier features
- Rehearsal notes (R1, 0.54.0): the "Make a task" button on each note, and the task shows it came
  from a note.
- Notifications, push (M5a) and the e-mail summary: new `task_assigned` kind.
- Gig members and functions: who a task can be for. The gig's offline copy and the help guides.
- Organisation tasks, checklist templates, tasks in On-site mode and inventory repairs as tasks
  come in T2.

### Docs
- `docs/TOOLS_PLAN.md`: the acoustic simulator in levels of detail (A4–A6) is confirmed, after the
  three simpler sound stages; build order step 5 split into T1 (built) and T2.

## 0.57.0 — On-site mode

### Added
- **On-site mode** on every gig: on the gig's days it opens on what's needed there and then, in
  big buttons:
  - your call time and function, today's schedule with what's on now and next;
  - the call sheet, rehearsal notes, walking the rig (with a DMX patch), the input list (when the
    gig uses it), scanning equipment (for those who may), files, chat, and the crew with their
    phones.
- It switches on by itself on gig days (on by default) and can be switched on or off by hand on
  each gig; a switch by hand lasts for that day. The first time it comes on by itself, a note says
  why and links to the setting: **Settings → Language and appearance → "Switch to On-site mode on
  gig days"**, kept on each device.
- Help: guide "Use On-site mode on the day", with a picture.

### Connected to earlier features
- Uses the gig's offline copy, the call sheet (with its large print), the rehearsal companion (R1),
  the walk-through (D1), the input list (F1) and equipment scanning (I3). The Tools tab's "On site"
  and "Plan" groups (0.54.0) stay as they are.

### Docs
- `docs/TOOLS_PLAN.md`: truss data from Fantek, Global Truss and Prolyte first (Q3); a proposed
  acoustic simulator that grows with the project's detail, stages A4–A6 (Q5, to be confirmed).

## 0.56.0 — DMX calculator and dipswitches (D1)

### Added
- **Pocket tools** (My work → Pocket tools, `/tools`): calculators for any venue, with or without a
  gig in AVX, that work offline. First, the **DMX calculator**:
  - **Address ↔ dipswitches**: type an address to see which switches go ON, drawn like the
    fixture's own switches, or tap switches to read the address they set. The layout follows the
    fixture's label: 9 or 10 switches (the 10th a function switch), switch 1 worth 1 or 256, ON up
    or down, switch 1 on the left or the right. Kept on the device.
  - **Address a row of fixtures**: a count of the same fixture from a start address; every
    fixture's channels and switches, moving to the next universe instead of straddling two.
  - **Universe ↔ absolute channel**, with universes counted from 1 or from 0 (Art-Net).
  - **Values**: percent ↔ 0–255, 16-bit ↔ coarse/fine, hex.
- **DMX patch**: a "Dipswitches" switch shows each fixture's switches next to its address, and
  **Walk the rig** steps through the fixtures one at a time, grouped by position, with big
  switches and "Next fixture". Offline from the patch's saved copy.
- Help: guide "Set a fixture's DMX address with its dipswitches", with pictures.

### Connected to earlier features
- The walk-through and the dipswitch column read the gig's DMX patch (F2); positions come from the
  light plot (F3).

## 0.55.0 — Rehearsal companion R2: camera and LTC sync

### Added
- **Sync the rehearsal clock from a camera** ("From camera"): point the phone at a timecode display
  (an LTC reader, console or monitor) with the digits inside the box. The digits are read on the
  phone a few times a second; a reading is offered only when two of them move on with the clock,
  and it keeps counting so you can compare it with the display before using it. "Type it" falls
  back to typing.
- **Sync from LTC** ("From LTC"): the SMPTE timecode signal is decoded live from the microphone or a
  line input, with a level meter, the frame rate it measured, and a warning when the LTC's frame
  rate or drop-frame doesn't match the session.
- A note under the clock when a camera or LTC sync is more than 20 minutes old, as those clocks
  drift.

### Changed
- The shared clock is more exact: the phone sends the server time of its reading (within 5
  seconds), so network delay is no longer added to every sync, nudge or setting.
- Privacy notice: the camera and microphone are read on the device; no picture or sound is sent or
  kept.

### Connected to earlier features
- Both syncs set the session's clock type ("Camera sync", "LTC"), shown in the session line and the
  report header.

## 0.54.0 — Rehearsal companion R1

### Added
- **Rehearsal notes** (gig → Tools → On site): a shared, time-stamped notebook for rehearsals.
  - A session per run, with a frame rate (23.976 to 30, drop-frame at 29.97) and a clock that
    everyone on the gig shares: time of day or a stopwatch. Anyone writing on the gig can run,
    pause, nudge (±1 frame, ±1 second) or set it to the show's timecode, and every phone follows.
  - **Mark** takes the time at the tap; then the note gets a department (preset from your function
    on the gig), priority (note, fix, urgent), cue or song, text (typed, quick words or dictated),
    an optional photo and who it's for.
  - Notes appear for everyone as they're written; filter by department, "Mine" or "Open", and tick
    them done. Open notes from earlier runs show under the next session.
  - Report per department (print or PDF), CSV, and a JSON file with timecodes and frames for other
    show software (the start of the cueing app bridge).
  - Written without a connection, notes stay on the phone and are sent later (photos need a
    connection).
  - Crew and PMs write; viewers read. Removing a note or a session only marks it.
- Help: guide "Take notes during a rehearsal" and the glossary word "timecode".

### Changed
- The gig's Tools tab has two groups: **On site** (rehearsal notes, on every gig) and **Plan** (the
  tools the gig uses). The tab is now shown to everyone on the gig.

### Connected to earlier features
- Departments come from each person's function on the gig; notes can be assigned to anyone on it.
- Reports open from the tool and print like the other sheets.

### Docs
- `docs/TOOLS_PLAN.md`: decisions on On-site mode, the cueing app and rigger sign-off; build order
  by dependencies, with what each step must connect to.

## 0.53.0 — Crew network N5: alerts and saved searches

### Added
- **Job alerts**: when a company posts a job that fits your crew profile (one of your functions,
  within how far you travel; the same rule as "For you" on the job board), you get a notification
  in the app, by push and in the e-mail summary. On by default; switch it off on your crew profile
  ("Tell me about new jobs that fit me"). At most 10 a day; never for the company's own people,
  people already on the gig, or across a block. The alert names the company, never the gig.
- **Saved searches** in Find crew: save the current filters under a name (up to 30 per
  organisation), run one with a tap, switch its alert on or off, or remove it. With the alert on,
  whoever saved it hears when a crew profile that fits is switched on (at most 5 a day per search),
  and the notification opens Find crew with that search.

### Changed
- The e-mail summary's footer points to Settings → Notifications.
- Privacy notice: alerts and saved searches.

## 0.52.0 — Settings page

### Changed
- **Your settings are a page now** (`/settings`), no longer one long dialog. The avatar (and More →
  Account on phones) opens it. Sections: Profile, Sign-in and security, Availability,
  Notifications, Language and appearance, Privacy and blocking, Calendar feed, Your data, and AVX
  reviews for AVX admins.
- On wide screens the sections are listed on the left and the chosen one is shown on the right; on
  phones the list comes first and each section opens on its own, with a way back. Each section has
  its own address (`/settings/notifications`…), so links from the first-steps checklist, the menu
  and the help guides open the right one. Old `?panel=account` links still work.
- Help guides and their screenshots now point to the sections.

### Docs
- `docs/COMPETITOR_RESEARCH.md` (Rentman, Crewbooking and the rider apps compared, 29 features
  ranked) and `docs/TOOLS_PLAN.md` (rehearsal companion, DMX calculator, power, rigging and sound
  tools, and where prep and on-site tools live), merged with 0.51.0.

## 0.51.0 — Crew network N4: trust

### Added
- **Verified companies** (organisation settings → Verification, admins): in the EU, check the
  VAT number with the EU's VIES service (the new `vies-check` function); a valid number verifies
  the company at once and the name VIES holds shows next to the badge on its job posts. Outside the
  EU, or when VIES can't confirm, ask AVX for a manual check. Verified companies have no limit of
  3 open job posts.
- **Certificates you can trust**: certificates now have an id. A company that has had the person on
  one of its gigs can confirm a certificate (Find crew and Job posts → Applicants); the person can
  upload a proof (photo or PDF, only AVX sees it) for AVX to check. Profiles show "proof checked by
  AVX", "confirmed by …" or "self-declared". Editing a certificate's name or expiry drops its marks.
- **Report** a crew profile (Find crew) or a job post (Jobs): it disappears for the reporter at
  once, the reporter can also block the person, and AVX reviews it. Three people reporting hide a
  profile, or pause an organisation's posting, until reviewed. Notices on the profile page and on
  Job posts say so.
- **Contact settings** on the crew profile: "Any company that finds you" or "Only companies I've
  worked with"; Find crew shows it, and contact from others is refused.
- In a direct conversation between strangers (no shared gig or organisation), files can be sent
  only once the other person has written.
- **AVX reviews** (`/admin/trust`, from Account for AVX admins with two-step sign-in): manual
  company checks, certificate proofs and reports to decide; verifications to revoke; suspensions
  to undo.
- Help: "Show your certificates are real, and choose who can contact you" and "Verify your
  company". The privacy page describes all of it.

### Fixed
- An organisation admin could mark their own organisation verified by editing it directly (the N3
  column had no guard; nobody had). `verified_at`, `verified_name`, `verified_method` and
  `posting_suspended_at` are now set only by the database's own functions.

### Database
- Migration `20261125000000_crew_trust.sql` (no manual steps): `private.avx_admins`,
  `org_verifications`, `certificate_confirmations`, `certificate_proofs` (+ private bucket
  `certificate-proofs`), `network_reports`; `crew_profiles.contact_from` and `suspended_at`;
  `start_vies_check()`, `record_vies_result()` (service role only), `request_manual_verification()`,
  `decide_verification()`, `revoke_verification()`, `confirm_certificate()`,
  `submit_certificate_proof()`, `review_certificate_proof()`, `report_network()`,
  `decide_network_report()`, `lift_suspension()`, `trust_queue()`, `trust_queue_count()`,
  `am_avx_admin()`; new versions of `search_crew`, `contact_crew`, `publish_job`, `list_jobs`,
  `job_applicants`, `can_see_crew_profile` and the message guard. Tests:
  `supabase/tests/crew_trust.sql`.
- Edge Function `vies-check` (JWT verification on).

## 0.50.0 — Crew network N3: the job board

### Added
- **Post a job** (a gig's Crew tab, or Organisation → Job posts): title or one of the gig's crew
  positions, function, how many, dates (the gig's), town, languages, a certificate, a description,
  and pay: "ask for their day rate" or a stated fee (fixed or a range, per day, job or hour, in a
  chosen currency). Posting needs two-step sign-in switched on; organisations not verified yet can
  have 3 open posts. The post shows the organisation's name, never the gig's name or client.
- **Jobs** (My work → Jobs), for freelancers with their crew profile on: "For you" (their
  functions within their travel range), "All open jobs", and "My applications". **Apply** with a
  message, the day rate when asked (it goes only to that company), and a tick that they're free.
- Applications start a conversation with the person who posted, and notify them and the
  organisation's admins. **Job posts → Applicants** shows each applicant's crew profile, message and
  rate: shortlist, decline (a polite note goes in the messages) or **offer the place** (a crew call;
  accepting adds them to the gig, marks the application accepted and fills the post when every
  place is taken). Posts can be closed, marked filled or reopened, and close on their last day.
- Notifications (in the app, by push and in the e-mail summary) for a new application and a
  declined one. Help: "Find work on the job board" and "Post a job and choose who to take".
  The privacy page describes the job board.

### Database
- Migration `20261124000000_job_board.sql` (no manual steps): `job_posts`, `job_applications`,
  `organisations.verified_at` (set in N4), `publish_job()`, `close_job()`, `list_jobs()`,
  `apply_job()`, `withdraw_application()`, `answer_application()`, `my_job_applications()`,
  `job_applicants()`. Checks in `supabase/tests/job_board.sql`.
- `send-push` and `send-digest` redeployed with the new notification wording.

## 0.49.0 — Crew network N2: crew search

### Added
- **Find crew** (Organisation menu, and "Find crew" on a gig's Crew tab), for admins and members:
  search the freelancers who switched on their crew profile and let companies (or crew) see it, by
  function, name or words, language, certificate (still valid on the dates), distance from a town
  or the gig's venue, and dates. Results show how far away they are, whether they're free on the
  dates (never which gigs), and how often they've worked for you. People who travel further than
  the distance searched are included when they say they go that far.
- From a result, **Ask if free** (an availability question, as from the gig) or **Offer a place**
  (a crew call for one): it arrives in their messages, and the two can write to each other from
  then on. Contact details stay private until they join the gig.
- Limits against misuse: 200 searches and 25 new people contacted per organisation per day.
- Help: "Find crew you haven't worked with yet". The privacy page describes the search.

### Changed
- The town search is shared by the crew profile and Find crew; in Portuguese its button now says
  "Localizar", so it isn't confused with "Procurar".

### Database
- Migration `20261123000000_crew_search.sql` (no manual steps): `search_crew()`, `contact_crew()`,
  `crew_contacts`, `crew_search_log`; people a company contacted can message each other.
  Checks in `supabase/tests/crew_search.sql`.

## 0.48.0 — Crew network N1: crew profiles

### Added
- **Crew profile** (Account → "Open your crew profile", `/me/profile`): what you do (a shared list
  of functions plus your own), your town, how far you travel, languages, years of experience,
  certificates (self-declared, with an expiry date), a short text and up to three links. It's **off
  until you switch it on**, and you choose who sees it, at any time: **companies only** (admins and
  members of AVX organisations) or **companies and crew** (also other people on AVX). Never the
  public web; people you've blocked never see it. No rates. A preview shows what others see;
  "Remove my crew profile" clears it.
- Your town is found by name (OpenStreetMap, through the new `geocode` function, for signed-in
  people only) and kept to about 1 km.
- The plan for the crew network and job board, with the decisions taken: `docs/CREW_NETWORK.md`.
- Help: "Get found for work with your crew profile". The privacy page describes the profile.

### Fixed
- The calendar link (S4) now asks for two-step sign-in like everything else, for people who use it.

### Database
- Migration `20261122000000_crew_profiles.sql` (no manual steps): `crew_profiles`,
  `crew_profile()`, `clear_crew_profile()`. Checks in `supabase/tests/crew_profiles.sql`.
- New Edge Function `geocode` (Verify JWT **on**), sharing `_shared/places.ts`.

## 0.47.0 — Switching S5: organisation export

### Added
- **Download everything**: organisation settings → "Your organisation's data" (admins) gives one
  zip with a CSV file per kind of record: the organisation's details, members, crew waiting to be
  invited, locations, equipment, stock per location, units, kit contents, stock movements,
  clients, suppliers, gigs, their equipment, crew, schedule and files list, quotes and their lines,
  subrentals and their lines, repairs and inspections, plus the messages (`messages.json`) and a
  README. Names are used instead of internal numbers, and the files are numbered in the order
  another tool would need them.
- The files import straight back into AVX: their headings are the words the import wizard
  recognises (equipment, units, kit contents, contacts, gigs, gig equipment, quote lines).
- Help: "Download all your organisation's data". The privacy page says what admins can download.

### Changed
- The import wizard recognises "gig" and "gig ref" as the gig columns of a gig equipment file.

### Database
- Migration `20261121000000_org_export.sql` (no manual steps): `export_org_part()`, admins only,
  with two-step sign-in; reads only. Checks in `supabase/tests/org_export.sql`.

## 0.46.0 — Switching S4: Rentman exports, the switching checklist and the calendar feed

### Added
- **Rentman exports** are recognised: their own column names (`rental_sales`, `current_quantity`,
  `email_1`, `visit_street`, `planperiod_start`, `firstname`…, from the mock Rentman account) are
  matched automatically for equipment, units, contacts, crew and jobs, and the wizard says
  "Recognised as a Rentman export". Rentman's values are read too ("Track stock", "Exclude from
  stock tracking", date-times), the address is put together from street, number, postcode and
  city, and crew marked inactive aren't invited.
- When equipment has quantities but no location column, the wizard asks which location the stock
  is in.
- **Switching checklist** on the Import page: the steps in order (locations → equipment → units →
  kits → clients → suppliers → crew → jobs → their equipment → quotes), each ticked with what's
  already in AVX; tap one to choose it.
- **Calendar feed**: in the account panel, "Your gigs in your phone's calendar" gives a private
  link to subscribe to in Apple, Google or Outlook calendar. Each gig shows its dates (or your own
  booking times), venue, role and call time, and updates by itself; drafts show as tentative.
  "New link" replaces it if it was shared by mistake.
- Help: "See your gigs in your phone's calendar". The privacy page mentions the feed.

### Changed
- A column called just "unit" is no longer taken as what a price is charged per (Rentman's "unit"
  is a counting unit like "Piece"), and "type" no longer as rental/sale (Rentman's is item/set/case).

### Database
- Migration `20261120000000_calendar_feed.sql` (no manual steps): `calendar_feeds`,
  `calendar_feed()`. Checks in `supabase/tests/calendar_feed.sql`.
- New Edge Function `calendar-feed` (Verify JWT **off**), sharing `_shared/ics.ts`.

## 0.45.0 — Switching S3b: upcoming jobs, their equipment and open quotes

### Added
- Three more kinds in the import wizard (admins and members):
  - **Upcoming jobs** → gigs with name, dates, venue and status ("Bevestigd" → confirmed,
    "Optie" → draft…); the client and notes go in the gig's description. Past and cancelled jobs
    are left out (they stay in the old tool's export). The importer becomes the gigs' manager.
  - **Equipment on jobs** → planned equipment on each gig (by job number or name, item by code or
    name), which books the gear for the gig's dates.
  - **Open quotes** → draft quotes, one per quote number, with their lines grouped by section;
    lines from the catalogue keep their item and price, and a client whose name is in Contacts is
    linked.
- Gigs and quotes keep the old tool's number, so importing again updates them instead of
  doubling; a quote already sent is left as it is.
- The wizard's first step groups the kinds: inventory, contacts, people and work.
- Help: the "Bring over your upcoming jobs and open quotes" guide.

### Fixed
- An installed app (or a tab left open) now looks for a new version each time it comes back to
  the screen and reloads into it, instead of only when it's started.

### Database
- Migration `20261119000000_import_jobs.sql` (no manual steps): `import_ref` on gigs and quotes,
  `import_jobs`. Checks in `supabase/tests/import_jobs.sql`.

## 0.44.0 — Switching S3a: crew as held invitations

### Added
- **Crew import**: in the import wizard (admins only) or from Members → "Import your crew from a
  file", one row per person with e-mail, name (or first and last name), phone, functions and
  role. Roles are read in English, Dutch and Portuguese ("Freelancer" → viewer, "Medewerker" →
  member…); viewer if the file doesn't say.
- Imported people are **held**: nobody is e-mailed. In Members, a "not invited yet" list lets an
  admin check each role, select people and **send** the invitations (through the normal
  invitation, one at a time; one that fails stays held), or **discard** them.
- Re-importing updates the held ones instead of doubling; people already in the organisation or
  already invited are left out with a note.
- Help: the "Bring your crew over from another tool" guide. The privacy page mentions the details
  kept for held invitations.

### Changed
- The Members dialog scrolls when it's taller than the screen.

### Database
- Migration `20261118000000_held_invites.sql` (no manual steps): `held_invites` (never removed:
  sent or discarded instead), `import_crew`. Checks in `supabase/tests/held_invites.sql`.

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
