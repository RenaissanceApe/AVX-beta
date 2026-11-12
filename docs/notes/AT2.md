# AT2: Automated tests, messages and notifications

## Changelog
### Added
- **Automated tests for messages (AT2).** Signed-in browser tests, mostly two people talking:
  direct messages both ways with a reply and mute; the gig chat with photos, a PDF, a schedule card,
  @mentions (a person and @crew), a reaction, an edit with its earlier version, a removal and a link
  to a message; organisation channels ("only admins write"), an announcement confirmed by a member,
  pinning; department channels (crew see only their own); search and saved messages; asking
  availability and answering it in Messages; a crew call accepted from Messages; the call sheet sent
  to the crew and confirmed; schedule notes; team conversations on an item, a repair and a
  subrental; a quote's client and a subrental's supplier writing through their links (and a new
  supplier link turning the old one off); reporting, keeping and removing a message; blocking and
  unblocking; organisation settings → Messages (usage, the retention warning, the download).
  File: `e2e/auth/messages.spec.js`, tag `@messages`; the PR smoke run has the direct-message test.

## Roadmap
Automated tests: AT2 messages built (`e2e/auth/messages.spec.js`).

## Pending: test lines (section 2)
Lines the tests now cover (the owner can strike them, or keep only the part listed as manual below):

| T-line | Test(s) in `e2e/auth/messages.spec.js` |
|---|---|
| T2 | "two people message each other directly, reply and mute"; "the gig chat: crew and manager talk, and a venue change is posted in it" |
| T12 | "the gig chat: files, a schedule card, mentions, a reaction, an edit, a removal and a link"; "a photo in a chat is accessible while it loads" (`test.fail`, #212) |
| T13 | "an organisation channel: admins only write, an announcement is confirmed, a message pinned"; "department channels on a gig: crew see only their own function"; "search finds a message, and a saved message is under Saved"; "the menu of the first message in a short conversation can be clicked" (`test.fail`, #211) |
| T14 | "asking crew with a clash if they are available, answered from their Messages"; "a crew call for a position, accepted from Messages: they join the gig"; "the call sheet is sent to the crew, who confirm it in the chat"; "two schedule items make one note in the gig chat"; "a team conversation on an equipment item, a repair and a subrental" |
| T15 | "a quote's client writes from the quote's page and is answered from its Summary tab"; "a subrental's supplier writes through their link; a new link turns the old one off"; "the pages a client or supplier opens from a link pass the accessibility check" (`test.fail`, #146) |
| T17 | "a reported message: the gig's manager keeps one and removes another"; "blocking someone in a direct conversation: neither can write; unblock from Account" |
| T18 | "organisation settings → Messages: usage, the retention warning and the download" |

What stays by hand, and why:
- **T15, the email:** "send a quote to your own second email": the tests make the link with
  Send to client → Create link and never send email (example.com addresses). Whether the email
  arrives and its link opens needs a real inbox.
- **T18, the migration:** running `20261108000001_message_retention_delete.sql` by hand in the SQL
  editor is the owner's step (it deletes). The nightly deletion itself (pg_cron at 03:17 UTC and the
  `message-retention` function) isn't run by the tests: it needs a message older than the period,
  which can't be made from the app.
- **T2, the venue form:** the test changes the venue through the database API, as the gig's edit
  form saves it, and checks the chat line; the edit form itself belongs to the gigs area (AT1).
- **T12, photos from a phone:** the tests attach files with the file picker on a desktop browser;
  taking a photo with a phone's camera needs a device.

## Pending: new questions (section 3)
- **T17's wording:** a gig's manager isn't notified when someone reports the manager's *own* message
  (`report_message` skips the author: `continue when v_user = v_msg.author_id`). They still see the
  "Reported" note under the message. The line says "report a message of yours… as the gig's manager,
  open the notification", which can't happen when the manager wrote it. The test has the reported
  messages written by other people on the gig. Is skipping the author intended (then reword T17), or
  should a manager also be told about reports on their own messages?

## Bugs found
- #211 (should fix): a message's ⋯ menu opens upwards under the header near the top of a short
  conversation, so its first items can't be clicked.
- #212 (should fix): a chat photo's link has `aria-label` but no `href` while it loads (serious axe
  finding; made accessibility checks on chats with photos depend on timing).
- #146 (already open): colour contrast on the client's quote page and its conversation; the
  supplier's page has the same grey text.
- Nice to have: a conversation looks up once whether you run it (`canManage` in `Conversation.jsx`);
  if that query fails (it did on the overloaded test project), Pin, announcements and moderation
  disappear until a reload. The T13 test reloads once if Pin is missing.
- Nice to have (seen once in about 20 runs): an edited message didn't update live on the other person's
  open chat within 20 s (the realtime UPDATE didn't arrive); after a reload it showed. The test now
  reloads there. Worth watching in the nightly runs.
- Nice to have: the crew member's own view of their availability answer says "You is available"
  (`chat.sys.availability.available` with the actor replaced by "You").

## Session prompt
None: docs/SESSION_PROMPTS.md has no section for the Automated tests set (it was given by the Dispatcher).
