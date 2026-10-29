# Quotes

Organisation **admins and members** can build quotes: dashboard → pick the organisation → **Quotes**.
Viewers and gig crew never see quotes or prices (enforced by the database, not just hidden in the app).

## How a quote is built

A quote is laid out in **phases**, shown as tabs in the editor, just like Rentman's subprojects:

```
Quote  (client, dates, VAT, discount on total, terms)
 └─ Phase       e.g. "Load-in", "Show day 1", "Breakdown", "Lisbon", "Porto"
     │          own dates, own discount %, can be marked Optional
     └─ Section e.g. "Audio", "Lighting", "Crew", "Transport"
         └─ Line   type · description · qty · unit · × factor · unit price · discount %
```

- **Line total** = qty × factor × unit price − line discount. Use the factor for days or hours
  (e.g. 2 pieces × 3 days). Leave it at 1 when the price is already for the whole job.
- **Line types**: rental, sale, crew, transport, other, and comment (text only, no price). The summary
  splits the total by type.
- **Phase total** = its lines, less the phase discount.
- **Optional phases** are priced on the quote but not added to the total ("options not included").
- **Quote total** = all non-optional phases, less the discount on the total, plus VAT.

The editor saves by itself about a second after you stop typing. If someone else saves the same quote
at the same time, you get a "changed elsewhere" notice instead of silently overwriting their work.

## Templates (building blocks)

- **Save as template** (top of the quote) saves all phases with their sections, lines and prices.
- The template button on a **phase** saves just that phase, e.g. a standard "Conference day" or "Crew pack".
- **New quote → Start from** a template, or inside a quote use **Template** in the tab bar to add a
  template's phases to the current quote. Mix as many blocks as you need, then set their dates.

Templates never store dates or client details.

## Versions

**Versions** (top of the quote) lists numbered copies of the quote, each with a note and its total.
**Save version** freezes the quote as it is now (e.g. "Before cutting the LED wall"). The eye opens a
version as the client would see it (printable); **Restore** puts it back into the editor, after saving
the current state as a new version, so a restore can always be undone. Every quote you send to a
client is saved as a version automatically.

## Sending it to the client

**Send to client** saves a version and creates a private link to an online copy of that version
(e.g. `https://avx-beta.vercel.app/q/Xk3v…`). With the client's email ticked, AVX emails the link
(see docs/EMAIL.md); otherwise copy the link and send it yourself. A draft quote becomes *Sent*.

- The client opens it without an account, in the quote's language, and can print it or save a PDF.
- **Accept** / **Decline** asks for their name and an optional message (e.g. an order number). The
  answer is final: the quote's status changes, and whoever sent it, whoever wrote the quote and the
  organisation's admins get a notification.
- Links last 30 days. Sending again replaces the previous link; the ⊘ button turns a link off.
- For security only a fingerprint of the link is stored, so the link is shown once, right after
  sending. If it gets lost, send again.
- The window lists every send: to whom, which version, when it was opened and the client's answer.
- With **Attach the quote as a PDF** ticked (the default), the email also carries a PDF of the same
  version. The PDF is made in your browser and never stored. **Download PDF** on the print preview
  (and **PDF** on the client's page) gives the same file.

## Printing it yourself

**Preview & print** opens the quote as the client will see it, in the quote's language (Portuguese or
English, chosen per quote, independent of your own app language). Use the browser's print dialog →
**Save as PDF**. Untick *Show prices per line* (Details tab) to send quantities and section totals only.

Company details on the quote (legal name, NIF, address, contacts), default VAT, validity and default
terms are set once by an admin under **Quotes → Company details**.

## Look of the printed quote

Set once by an admin under **Quotes → Company details**:
- **Header image**: a wide strip (about 8:1) printed full-width at the top of every page. PNG, JPG or
  SVG up to 320 KB. Without one, quotes get a coloured bar with the company name.
- **Accent colour**: the short bars above section headings.
- **Number prefix / next number**: "Q" gives Q0001, Q0002…; an empty prefix gives plain numbers.
  "Next number" carries on an existing numbering (e.g. 143 after your last Affinity quote).
- **Default terms**: lines like `3. Availability` print as headings, blank lines start new paragraphs.

Per quote (Details tab): project manager, payment method, and the client. Phases with dates (and
optional times) are printed as the **Agenda**; phases without lines appear only there.

## Price list

**Quotes → Price list** holds items you quote often with their usual price (excl. VAT), type, unit
and category. **Import list** takes one item per line, `name; price; category; type; unit`, so you can
paste columns from a spreadsheet. In a quote, **From price list** under any section adds the ticked
items as lines; you can still change quantity, factor, price and discount per quote.

## Statuses and gigs

Draft → Sent → Accepted / Declined is set by sending and by the client's answer, and can still be set
by hand. **Create gig** turns the quote into a gig (dates from the earliest to the latest phase) and
links them; or link an existing gig in the Details tab.

**Fill gig from quote** (once a gig is linked; it also opens right after *Create gig*) lists what the
quote adds to the gig, to untick or adjust first:
- **Schedule**: one item per day of each dated phase, at the phase's start time (09:00 if none) and
  until its end time on the last day. Items already on the gig are left unticked.
- **Crew positions**: one per crew line description, merged across phases, with the number of people
  (the line's quantity, or 1 for lines priced per hour, km or lump sum). Optional phases are left out.

Positions appear under **Positions to fill** in the gig's Crew tab, with how many are filled (crew
and pending invites whose function matches) and a button to invite someone for that role. Only the
gig's production managers, its creator and organisation admins can change them.

## What was taken from Rentman, and what wasn't

The structure was read from a Rentman trial account through its public API (projects, subprojects,
function groups, equipment groups, functions, costs, quotes), not from Rentman's code:

| Rentman | AVX |
|---|---|
| Project | Quote (optionally linked to a gig) |
| Subproject (own dates, discounts, "in financial" toggle) | Phase (own dates, discount %, Optional) |
| Equipment group / function group | Section |
| Planned equipment, functions (crew/transport), additional costs | Lines of type rental/sale, crew/transport, other |
| Factor (rental days multiplier) | × factor |
| Quote document (number, version, date, expiry, VAT, "no individual prices" layout) | Numbered quote, validity date, VAT, *Show prices per line* |

Deliberately left out for now: inventory and availability, rate cards with time-based price rules,
per-category discounts and multiple VAT classes per line. Possible next steps are in
ROADMAP.md.

## Technical notes

- Tables: `quotes` and `quote_templates` (migration `20261019000000_quotes.sql`). Phases, sections
  and lines live in one `body` JSON document per quote; `src/lib/quotes.js` does all the maths and is
  covered by `src/lib/quotes.test.js`.
- Quote numbers are per organisation and assigned by the database (`Q0001`, `Q0002`, …).
- `total_net` is stored on each save so the list can show totals without loading every quote.
- Access rules are tested by `supabase/tests/quotes_rls.sql` and `supabase/tests/phase4c_rls.sql` (run
  them in the test project's SQL editor; they roll themselves back and end with `ALL … CHECKS PASSED`).
- Versions, client links and positions: `quote_versions`, `quote_shares` and `gig_positions`
  (migration `20261021000000_quote_versions_shares_positions.sql`). Links are created only by the
  `send-quote` Edge Function and answered only through `quote-public`; members can only turn a link off.
- No double sends: each click of Send carries a key (`quote_shares.request_key`, unique per quote,
  migration `20261205000000_no_double_sends.sql`). Clicking again after an error reuses the key and the
  saved version, so `send-quote` answers `duplicate` instead of a second link and email. The new link
  is stored before the older ones are revoked, so a duplicate never kills the link that was sent.
