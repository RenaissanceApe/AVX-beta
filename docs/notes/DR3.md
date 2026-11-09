# DR3: Lists

What this worker would add to the files only the Dispatcher edits (docs/PARALLEL.md, "Worker rules").

## Changelog (under the feature set's version, heading "DR3: Lists")

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

## Roadmap
Nothing in ROADMAP.md names DR3 separately; the design refresh row is the set's. DESIGN_REFRESH.md marks
DR3 built (done in this PR) and has "How the list pages work".

## Pending: test lines (section 2)
- Lists (DR3): on a phone, open Quotes, Invoices and Contacts: one green button each; ⋯ in the header holds
  Company details / CSV / Import. Tap a status tab on Quotes and an Invoices view: the bar moves, the list
  filters. On Job posts, ⋯ on a post marks it filled. On Find crew, ⋯ on a person reports the profile.

## Pending: new questions (section 3)
- These strings are no longer shown and could be removed in DR6: `quotes.allStatuses`, `invoice.intro`, `expenses.intro`, `hours.pageIntro`, `hours.orgIntro`,
  `leave.intro`, `leave.introAdmin`, `jobs.boardIntro`, `jobs.orgIntro`, `crewSearch.intro`,
  `crewPay.intro`, `quotes.followUp`, `trust.report.profileNamed`, `jobs.declineNamed` (assumed: keep until DR6).
- Crew search results stay as cards (each person is something you act on: ask, offer), because
  `CrewProfileCard` is shared with the crew profile page. Make them rows too in DR6?
- Members is a dialog opened from the organisation home; DR3 did its list. Its invite form and the
  network picker (shared with the gig's Crew tab) are unchanged.

## Session prompt
The design refresh prompt's DR3 part ("Design refresh DR3: lists").
