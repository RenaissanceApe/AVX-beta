# Navigation, workspaces and roles

People in events wear different hats with different companies: admin of their own company,
member of another, crew on someone else's gig. AVX handles this without "user types": **a person
has no global role; they have a role in each organisation and a role on each gig**, and the app
always shows the one that applies to what's on screen.

## Workspaces

The button next to the logo picks the workspace:

| Workspace | What it shows | Who it's for |
|---|---|---|
| **My work** | Every gig you're on, at any company, labelled with the company and your role on it (PM, crew, function). One list and one calendar for everything. | Everyone; the home of freelancers |
| **An organisation** | That organisation's gigs, quotes and people, with the menus your role there allows | Company staff |

- Switching organisation switches your role with it: the switcher, the page heading and the
  menus show it (Admin / Member / Viewer), and items you can't use aren't offered.
- AVX opens the workspace you used last. The first time, it's the first organisation where you
  work (admin or member), or My work if you only work as crew or viewer.
- Gigs you work on for a company you don't belong to are in My work; the company's name is shown,
  nothing else about it (`my_gig_companies()`, migration `20261023000000`).
- The logo always goes to the home of the current workspace.

## Addresses

| Address | Screen |
|---|---|
| `/me` (`?view=calendar`) | My work |
| `/org/:id` (`?view=calendar`, `?new=gig`, `?panel=members`, `?panel=settings`) | Organisation home, new gig, members, settings |
| `/org/:id/quotes` (`?tab=templates`, `?tab=prices`, `?company=1`) | Quotes, templates, price list, company details |
| `/orgs` (`?new=1`) | Organisations: yours with your role in each, companies you work for as crew, create one |
| `/dashboard` | Opens the current workspace (used by sign-in and old links) |
| `/me?panel=account` | Account (also from the avatar) |
| `/org/:id/inventory` (`?tab=locations`, `?tab=movements`) | Inventory: catalogue, locations, stock ledger |
| `/org/:id/inventory/:itemId` (`?unit=<id>`) | One item: stock, units, history |
| `/org/:id/inventory/labels` (`?items=…&units=…`) | Printable QR labels |
| `/scan/:code` | What a label's QR code opens: finds the item or unit and goes there |

## Menus

All menu items come from one list (`src/lib/nav.js`), filtered by workspace and role, and covered by
`src/lib/nav.test.js`:

- **Desktop**: section menus in the top bar open on hover (after a short pause) or click, close
  with Esc or a click elsewhere. Main items are cards with an icon; once a section has more than
  four main items, or for smaller items, the extras go in a list beside the cards.
- **Phones**: a bottom bar with three everyday places and **More**, a sheet with the workspace chips
  and every section as cards.

To add a screen: add the route, then one item to `navSections()` (and to `phoneTabs()` if it's an
everyday place), with `nav.<key>` and `nav.<key>Desc` in both language files.

## Unread and mute

- The switcher shows unread updates per workspace (My work counts gigs at companies you aren't a
  member of), and a dot on the button when another workspace has some (`my_unread_counts()`).
- Mute an organisation on the Organisations page (bell icon): no badge and no email summary for its
  updates. Questions addressed to you (availability requests) still come through.
- My work marks double bookings and lists availability questions waiting for your answer
  (see [RESERVATIONS.md](RESERVATIONS.md)).

## Ideas for later (not built)

- **Guest view of a company**: crew who work often for a company could see its public profile
  (contacts, venues) without being members.
- **Gig requests / coordinator role**: if a company needs viewers to propose gigs (they can't
  create them since 0.12.0).
