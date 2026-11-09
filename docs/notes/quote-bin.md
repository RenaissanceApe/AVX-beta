# quote-bin: Recently deleted for quotes (#124)

## Changelog
#### Added
- **Quotes → Recently deleted:** deleting a quote no longer erases it at once. It moves to Recently
  deleted (Quotes page, header button or ⋯ menu on a phone) for 15 days, with an **Undo** on the
  message. While it is there it counts nowhere: not in lists, search, counts, reports, gig finance or
  chat, and its client link shows "not found". **Restore** brings it back as it was, with its
  versions, client links and number. After 15 days a nightly clean-up erases it for good.
- Help: the term "Recently deleted", a ⓘ hint on the bin, and a line in the guide "Build a quote in
  phases".

#### Changed
- The delete question on a quote now says where the quote goes ("…goes to Quotes → Recently
  deleted, where you can restore it for 15 days"), and the message after it says "Quote moved to
  Recently deleted."
- Who may delete a quote is unchanged (an admin, or whoever made it); the same people may restore it.

#### For developers
- Migration `20270102000000_quote_bin.sql`: `quotes.removed_at` / `removed_by`; `quotes_select`,
  `quotes_insert` and `quotes_update` skip or refuse removed quotes; the app's direct delete right on
  `quotes` is revoked; RPCs `remove_quote`, `restore_quote`, `removed_quotes`; nightly
  `private.erase_removed_quotes()` (pg_cron `avx-quote-bin`, 03:41 UTC). Readers that don't run as
  the reader got the filter by hand: `private.report_quote_lines`, `public.gig_finance`,
  `private.can_see_card`, `private.guest_resolve`, `public.clients_from_quotes`.
- Edge Function `quote-public` answers "not found" for a quote in the bin.
- Test: `supabase/tests/quote_bin.sql`; e2e: "a deleted quote waits in Recently deleted and can be
  restored".

## Roadmap
Nothing to mark: a fix from issue #124 (owner's decision: a 15-day bin), not a ROADMAP step.

## Production steps (in this order, after the owner's yes)
1. Apply `supabase/migrations/20270102000000_quote_bin.sql` to production (`otmulrlslecgyezpcqxy`).
   pg_cron is already installed there; `cron.schedule('avx-quote-bin', …)` replaces a job of the same
   name, so it is safe to run twice.
2. Compare `md5(prosrc)` on test and production for: `public.gig_finance`, `private.can_see_card`,
   `private.guest_resolve`, `public.clients_from_quotes`, `private.can_remove_quote`,
   `public.remove_quote`, `public.restore_quote`, `public.removed_quotes`,
   `private.erase_removed_quotes`.
3. Deploy the Edge Function `quote-public` (JWT verification stays **off**, as now).
   Until step 3 is done, a client link to a quote in the bin still opens the quote's page on
   production (accepting it would set the status of a quote nobody sees); the client chat on it is
   already closed by step 1.

## Pending: test lines (section 2)
- Quotes: open a quote → ⋯ → Delete → OK. It leaves the list and the message offers Undo. Quotes →
  Recently deleted lists it with "Erased for good on <date>" (15 days later). Restore: it is back in
  the list with its versions. As a member, someone else's deleted quote is not in your bin.
- Send a quote to yourself, delete it, open the client link: "not found". Restore it: the link works
  again.
- A gig with an accepted quote: delete the quote, the gig's revenue (Gig → Overview → Gig finance
  and Reports) drops; restore it, the revenue is back.

## Pending: new questions (section 3)
- **Should sent or accepted quotes be deletable at all?** The Dispatcher suggested only drafts can
  be deleted, while sent or accepted ones are cancelled instead. Built meanwhile: the bin works for
  every status, with the old rule about who may delete (admin or author). Restricting it later is a
  small change in `public.remove_quote` and the ⋯ menu.
- **Organisation export:** a quote in the bin is still included in Settings → Export data (it is
  the organisation's data until it is erased). Say if the export should leave it out.

## Session prompt
none (issue #124)
