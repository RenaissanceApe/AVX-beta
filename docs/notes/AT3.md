# AT3: Automated tests, quotes, invoices and payments

Spec file `e2e/auth/quotes.spec.js`, area `quotes`, tag `@quotes`. T-lines from docs/PENDING.md
section 2: T7, T67, T75, T77, T102.

## Changelog
### Added
- **Automated tests for quotes, invoices and payments (AT3).** 19 signed-in browser tests on the
  test project: a quote with catalogue items checked for availability, accepted from the client's
  link and turned into a filled-in gig; declining a quote (with a reason, or by the client through
  the link with a note); VAT per line; invoices (a deposit, issued by hand, then the rest less the
  deposit); credit notes; payments (part payment, refusals, paid, a payment removed); repairs charged
  to the client; quotes signed with a drawn signature and their signed PDF; a check in Portuguese.

## Roadmap
Automated tests: AT3 quotes, invoices and payments built (`e2e/auth/quotes.spec.js`).

## T-lines automated

| T-line | Test(s) in `e2e/auth/quotes.spec.js` | What it checks |
|---|---|---|
| T7 | `quote to gig: catalogue items, availability, accepted from the client link, gig filled from it` (**@smoke**) | Item added with "From price list", phase dates, Availability window and the item listed, client accepts through the link, the quote is Accepted, Create gig → Fill gig → the gig is confirmed and has the item booked |
| T67 (quotes and gigs part) | `declining a quote asks why, and the button by the status shows the reason`; `a client declines through the link with a note: the quote shows Declined and keeps the note`; `"Create gig" from a quote with a client gives the gig that client`; `in Portuguese: …` (the "why was it lost" question in Portuguese) | Declined asks why, the reason is saved and shown ("Lost: Price too high"), Skip saves no reason; declining through the link keeps the client's note; the new gig has the quote's client |
| T75 | `lines carry their own VAT: …`; `invoices: a 30 % deposit, marked sent and issued by hand, then the rest less the deposit`; `a credit note for part of an issued invoice is fine; crediting more than is left is refused`; `an issued invoice: "Invoiced" in the quotes list, told to the client in the quote's conversation, no Moloni button`; `a viewer has no Invoices page`; `an overdue invoice: the next morning's job tells the quote's author and the admins` (needs test_support); `in Portuguese: …`; `"Credit note" on an issued invoice …` (documents bug #208) | VAT per line (6 %, 0 % with a reason) in the summary and the printed quote; whole quote / 30 % deposit; mark sent, add number and PDF link → Issued; "The rest, less deposits" deducts the deposit; the database refuses crediting more than is left; Quotes list "Invoiced …"; "Tell the client" posts in the quote's conversation and the client sees it on the link; no Moloni button; a viewer sees "Only the organisation's admins and members can see invoices."; the overdue job's notification |
| T77 | `payments: a part payment by MB Way, refusals, paid for the rest, a payment removed`; `a repair charged to the client goes on one invoice draft of the gig only, and off again`; `a viewer can't read payments`; `in Portuguese: …` | Part payment by MB Way, "… left to pay" in the list; amount above what is left and a date tomorrow refused (screen and database); "Mark as paid" → Paid on that date; removing a payment → unpaid; a credit note covering what is left → paid; a charged repair is offered on the gig's draft, billed when added and saved, not offered on another draft, unbilled again when its line is taken out; a viewer reads no invoices or payments |
| T102 | `a quote accepted with a drawn signature: signature and fingerprint shown, signed PDF downloads`; `a quote accepted without drawing works as before, with no "Signed" line` | Drawn signature → the page shows it and its SHA-256 fingerprint; the client's PDF has the signature block; Send to client → Signed PDF downloads the signed quote; without drawing: no signature, no "Signed" line |

Also: `the client's quote page passes the accessibility check` documents the known bug #146 with
`test.fail()` (the page T7, T67 and T102 all open).

## T-lines left manual, and why

- **T7:** "Accept it from the client link" on a real phone, and the emailed link: a person and an inbox
  (the tests make the link without emailing it).
- **T67, the parts outside quotes:** Inventory (cost price, written off over, Add stock → Purchase,
  Remove → Sold, Retired asks a value), an inspection with a cost, importing a jobs file with a client
  column and an equipment file with "Cost price", and the new columns in the organisation export.
  These are the inventory, import and settings areas' screens; they're not in this file. Also "as a
  crew member who manages a gig, the client field isn't there" (gigs area). Suggest the Dispatcher
  checks whether the inventory, import or settings worker covers them, or leaves them manual.
- **T75:** "Email the client a reminder" sends a real email (an inbox); "the next morning" by the real
  daily job (the test runs the same job for one organisation through test_support instead); the
  printed **invoice** from the certified program (outside AVX); Contacts → Clients and the gig's
  finance panel totals, Company details "Days to pay an invoice" and the `invoices` /
  `invoice_lines` export files are not in this file (contacts, reports and settings screens).
  Moloni and the other invoicing programs stay manual (real accounts); nothing here calls them.
- **T77:** the repair's own screen ("billed on invoice …", box locked) is in the gig's repairs panel
  (gigs / inventory area); this file checks the same thing through the database. The gig's finance
  panel, Contacts → Clients and the `invoice-payments` export file: as for T75.
- **T102:** "on a phone": drawing with a finger on a real touch screen (the test draws with the mouse).
  "with a gig, it appears in the gig's Files": not checked here.
- **Portuguese wording:** one test checks the main invoice, payment and "why was it lost" words in
  Portuguese; reading the rest of the Portuguese text for sense needs a person.

## Bugs found

- **#208 (new, should fix):** "Credit note" on an issued invoice does nothing: the new credit note is
  opened with the same React key as the invoice (`src/pages/InvoicesPage.jsx` line 199,
  `src/components/invoices/QuoteInvoices.jsx` line 61), so a credit note can't be made from the app.
  Documented by `"Credit note" on an issued invoice opens a new credit note, which refuses more than is
  left` with `test.fail()`. Take the `test.fail` line out when fixed.
- **#146 (already open):** the client's quote page has three serious colour-contrast findings.
  Documented by `the client's quote page passes the accessibility check` with `test.fail()`.

## Pending: test lines (section 2)
- **AT3:** once test_support is installed on the test project (AT0's line), the test "an overdue
  invoice: the next morning's job tells the quote's author and the admins" runs instead of being
  skipped; check it passes in the next nightly run.
- T7, T67 (quote and gig parts), T75, T77 and T102 can move from "by hand" to "automated" except the
  parts listed above under "T-lines left manual".

## Pending: new questions (section 3)
- None.

## Session prompt
None: docs/SESSION_PROMPTS.md has no section for the Automated tests set (it was given by the Dispatcher).
