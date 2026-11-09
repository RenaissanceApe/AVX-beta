# quote-bin: Recently deleted for quotes, cancelling sent ones, revising declined ones (#124)

## Changelog
#### Added
- **Quotes → Recently deleted:** deleting a draft or declined quote no longer erases it at once. It moves to
  Recently deleted (Quotes page, header button or ⋯ menu on a phone) for 15 days, with an **Undo**
  on the message. While it is there it counts nowhere: not in lists, search, counts, reports, gig
  finance or chat, and its client link shows "not found". **Restore** brings it back as it was,
  with its versions, client links and number. After 15 days a nightly clean-up erases it for good.
- **Cancel quote:** a sent or accepted quote can't be deleted any more; ⋯ → **Cancel quote**
  marks it **Cancelled** instead. It stays in the list (with its own filter), stops counting as
  waiting, in the win rate and in revenue, and the client's link shows it as cancelled with no
  accept button. Its gig, crew, equipment and invoices stay as they are.
- **Revise and resend:** on a declined quote, ⋯ → Revise and resend puts it back to draft to change
  and send again. The old decline no longer counts in the win rate; once sent again it is waiting
  (and its follow-up clock starts) from the new send. Its versions and the client's answer stay.
- Help: the term "Recently deleted", a ⓘ hint on the bin, and two lines in the guide "Build a quote
  in phases" (three, with revising a declined quote).

#### Changed
- The delete question on a quote now says where the quote goes ("…goes to Quotes → Recently
  deleted, where you can restore it for 15 days"), and the message after it says "Quote moved to
  Recently deleted."
- Who may delete or cancel a quote is the same as who could delete one before: an admin, or whoever
  made it. The same people may restore it.

#### For developers
- `20270102000000_quote_cancelled_status.sql` (applied by hand): `quotes.status` gains `cancelled`.
- `20270102000001_quote_bin.sql`: `quotes.removed_at` / `removed_by`; `quotes_select`,
  `quotes_insert` and `quotes_update` skip or refuse removed quotes; the app's direct delete right on
  `quotes` is revoked; RPCs `remove_quote` (drafts and declined), `restore_quote`, `removed_quotes`,
  `cancel_quote` (sent or accepted), `revise_quote` (declined → draft); triggers
  `quotes_cancel_guard` (only `cancel_quote` sets cancelled) and `quotes_revise_dates` (a revised
  quote's sent/decided dates start afresh); nightly `private.erase_removed_quotes()` (pg_cron `avx-quote-bin`, 03:41 UTC).
  Readers that don't run as the reader got the bin filter by hand: `private.report_quote_lines`,
  `public.gig_finance`, `private.can_see_card`, `private.guest_resolve`,
  `public.clients_from_quotes`. Reports needed no change for cancelled: they already count only
  `sent` (waiting), `accepted` (revenue) and `accepted`/`declined` (win rate).
- Edge Function `quote-public`: "not found" for a quote in the bin; `state: 'cancelled'` (no
  answering) for a cancelled one.
- Errors from the bin and cancel functions come as `quote:<code>` and show `quote.error.<code>`.
- Test: `supabase/tests/quote_bin.sql`; e2e: "a deleted quote waits in Recently deleted and can be
  restored" (also: a sent quote has no Delete, and Cancel quote works).

## Roadmap
Nothing to mark: a fix from issue #124 (owner's decisions: a 15-day bin; drafts and declined
quotes deletable, sent and accepted ones cancelled, declined ones revised and resent), not a
ROADMAP step.

## Production steps (in this order, after the owner's yes)
1. **By hand** in the SQL editor: `supabase/migrations/20270102000000_quote_cancelled_status.sql`
   (it replaces a check constraint, which the connector may not run).
2. Apply `supabase/migrations/20270102000001_quote_bin.sql`. pg_cron is already installed;
   `cron.schedule('avx-quote-bin', …)` replaces a job of the same name, so it is safe to run twice.
3. Compare `md5(prosrc)` on test and production for: `public.gig_finance`, `private.can_see_card`,
   `private.guest_resolve`, `public.clients_from_quotes`, `private.can_remove_quote`,
   `public.remove_quote`, `public.restore_quote`, `public.removed_quotes`, `public.cancel_quote`,
   `public.revise_quote`, `private.quotes_cancel_guard`, `private.quotes_revise_dates`, `private.erase_removed_quotes`.
4. Deploy the Edge Function `quote-public` (JWT verification stays **off**, as now). Until then, a
   client link to a quote in the bin or a cancelled quote still opens the quote's page on
   production.

## Pending: test lines (section 2)
- Quotes: open a draft → ⋯ → Delete → OK. It leaves the list and the message offers Undo. Quotes →
  Recently deleted lists it with "Erased for good on <date>" (15 days later). Restore: it is back in
  the list with its versions. As a member, someone else's deleted quote is not in your bin.
- A sent or accepted quote: ⋯ has no Delete, but Cancel quote. Cancel it: it shows Cancelled in the
  list, its gig is unchanged, its client link says it was cancelled (no accept button), and it no
  longer counts in Reports → Sales (waiting, win rate) or in the gig's revenue.
- A declined quote: ⋯ shows Revise and resend and Delete. Revise: it is a draft again with its
  versions; send it, and it is waiting in Reports → Sales from today (not flagged for follow-up).
  Delete instead: it goes to Recently deleted.
- A gig with an accepted quote: cancel the quote and the gig's revenue drops; set the status back
  to Accepted and it returns.

## Pending: new questions (section 3)
- **The decline's reason:** when a declined quote is revised, its lost reason and note are cleared
  (as the status menu already did). The client's answer on the old link and the versions stay. Say
  if the reason should be kept somewhere.
- **The status menu still moves any quote to any status but Cancelled.** So an accepted quote can
  be set back to Draft and then deleted, and a cancelled one can be reopened. Kept on purpose so
  mistakes can be undone; say if a sent or accepted quote should never go back to Draft.

## Session prompt
none (issue #124)
