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

## Sending it

**Preview & print** opens the quote as the client will see it, in the quote's language (Portuguese or
English, chosen per quote, independent of your own app language). Use the browser's print dialog →
**Save as PDF**. Untick *Show prices per line* (Details tab) to send quantities and section totals only.

Company details on the quote (legal name, NIF, address, contacts), default VAT, validity and default
terms are set once by an admin under **Quotes → Company details**.

## Statuses and gigs

Draft → Sent → Accepted / Declined is set by hand. **Create gig** turns the quote into a gig (dates from
the earliest to the latest phase) and links them; or link an existing gig in the Details tab.

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
per-category discounts, multiple VAT classes per line, and quote versions. Possible next steps are in
ROADMAP.md.

## Technical notes

- Tables: `quotes` and `quote_templates` (migration `20261019000000_quotes.sql`). Phases, sections
  and lines live in one `body` JSON document per quote; `src/lib/quotes.js` does all the maths and is
  covered by `src/lib/quotes.test.js`.
- Quote numbers are per organisation and assigned by the database (`Q0001`, `Q0002`, …).
- `total_net` is stored on each save so the list can show totals without loading every quote.
- Access rules are tested by `supabase/tests/quotes_rls.sql` (run it in the test project's SQL editor;
  it rolls itself back and ends with `ALL QUOTE CHECKS PASSED`).
