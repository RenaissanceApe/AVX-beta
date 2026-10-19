# Messaging: plan

Status: **M1 (0.21.0), M2 (0.22.0), M3 (0.23.0), M4a (0.24.0), M4b (0.25.0), M5a (0.26.0) and M6a (0.27.0) built**; M5b and M6b planned. A project of
its own, built in stages M1–M6. The aim: one messaging system that works wherever people need
to talk about something in AVX (a gig, a person's availability, a file, a quote, a piece of
equipment), instead of WhatsApp groups that lose the context.

## Principles

1. **Conversations live next to what they're about.** Every conversation can point at an
   object (gig, schedule item, file version, quote version, availability request, equipment item,
   repair, subrental). That object's page shows its conversation, and the conversation shows
   a card of the object.
2. **Access follows the object.** Who can read a gig's channel is decided by the same database
   rules as the gig itself. Leaving a gig or an organisation removes access at once.
3. **Quiet by default.** Per-conversation mute and notification levels, organisation mutes (already
   built in 5a), digest by email, push only for what's addressed to you.
4. **Works on site.** Fast on phones, readable offline, messages typed offline are sent when the
   connection comes back.
5. **Nothing silently lost.** Edits keep history; deletions leave a "message removed" marker; exports
   for users and organisations.

## Kinds of conversation

| Kind | Members | Created | Typical use |
|---|---|---|---|
| **Direct** | 2 people | From any place a person appears (crew row, clash warning, member list, request) | "Can you do the 14th?" |
| **Group** | A chosen set of people | By anyone, inside an organisation or across companies | A small team for a tour |
| **Gig channel** | Everyone on the gig, automatically | With the gig | Day-of coordination; replaces the feed over time |
| **Department channel** | Gig crew by function (Sound, Light, Video, Rigging…) or managers only | By the gig's managers | Department chatter without flooding everyone |
| **Organisation channels** | Members of the organisation (all, or by role) | By admins | Announcements, general |
| **Context thread** | People with access to the object | From the object | A file version, a quote, a repair, a subrental |
| **External thread** | Staff plus a client or supplier through a secure link (no account) | From a quote or subrental | "Can we swap the LED wall?" on the client's quote page |

## Features

**Core (M1):** text with links and line breaks; replies (threads); unread counts per conversation
and in the switcher; mute; live delivery; notifications in the bell and the email digest; "Message"
buttons on people; system messages for gig events ("call time changed to 08:00").

**Rich content (M2):** attachments (stored like gig files, with previews), images; object cards
(gig, schedule item, file version, quote, equipment); @mentions of people and of groups (`@sound`,
`@crew`, `@managers`); reactions; edit (with history) and delete; copy link to a message.

**Organisation (M3):** organisation and department channels; pinned messages; **announcements
that need an acknowledgement** ("read and confirmed" list, e.g. safety briefings or call sheets);
search across your conversations; saved messages.

**Integrations (M4):**
- availability requests become direct conversations (the question, the answer and the follow-up together);
- **crew calls**: send a position ("2 × Sound technician, 13–14 Nov") to several people, who accept
  or decline in the message; first to accept fills it;
- call sheet published to the gig channel with acknowledgement;
- quote conversations with the client on the public quote page;
- equipment: threads on items, repairs (photo of the damage from site) and subrentals with suppliers;
- schedule changes posted automatically to the gig channel.

**Reach (M5):** push notifications (web push from the installed app; native push if the phone app
is built), reply by email to a digest, offline outbox, quick replies from notifications.

**Care (M6):** moderation (admins remove messages, report a message), retention settings per
organisation, export (person and organisation), usage counts, rate limits against spam.

## Use cases mapped

| Situation | Today | With messaging |
|---|---|---|
| Person already booked | ⚠ + "Ask availability" (5a) | The request opens a direct conversation with the answer and any follow-up |
| Positions to fill | Invite one by one | Crew call to several people; accept in the message |
| Day-of changes | Important post + notification | Gig channel, @department mentions, announcement with acknowledgement |
| File questions | Feed post | Thread on the file version, card shows which version |
| Client questions about a quote | Email outside AVX | Thread on the quote's public page, linked to the version |
| Damage on site | Phone call | Repair thread with photo, unit marked unavailable |
| Shortage | Phone a supplier | Subrental thread with the supplier, linked to the reservation |

## Data model (sketch)

- `conversations`: id, kind, org_id, gig_id, context_type, context_id, title, created_by, archived_at
- `conversation_members`: conversation_id, user_id, role (owner/member), notify level, muted, last_read_at;
  for gig/department/organisation channels membership is **derived** from the gig or organisation
  (a database view), not copied, so it can't drift
- `messages`: id, conversation_id, author_id, body, reply_to, kind (text/system/card/request), payload
  (card or crew-call data), mentions, edited_at, deleted_at, created_at
- `message_edits`, `message_reactions`, `message_acks` (announcements), `message_attachments` (storage paths)
- external participants: a token per thread (hashed like quote links), limited to that thread

Access rules in the database (RLS) as everywhere else; two-step sign-in enforced; each table with
the `mfa_required` rule. Live delivery through Supabase Realtime per conversation, typing and
presence through broadcast channels (nothing stored).

## Capacity notes

Realtime connections are the first limit (about 200 concurrent on the free plan, 500 on Pro,
more as an add-on). Messages are small: 100 companies × 50 people × 50 messages/day is about
250,000 rows/day, fine for Postgres with the right indexes and monthly partitioning later.
Attachments count against file storage, like gig files.

## Stages

| Stage | Scope |
|---|---|
| **M1** | Direct and gig channels, replies, unread, mute, live delivery, bell + digest, "Message" buttons |
| **M2** | Attachments, object cards, mentions (people and groups), reactions, edit/delete |
| **M3** | Organisation and department channels, pinned, announcements with acknowledgement, search |
| **M4** | Integrations: availability requests, crew calls, call sheet, quotes with clients, equipment threads |
| **M5** | Push notifications, offline outbox (M5a); reply by email, emailing clients and suppliers (M5b) |
| **M6** | Reports, moderators, blocking, rate limits (M6a); retention, organisation export, usage counts (M6b) |

## Decisions (settled before M1)

- **Gig feed stays** as the "official updates" board; the gig channel is a separate **Chat** tab.
- **Direct conversations**: anyone can message people they share a gig or an organisation with
  (the same people as the "your network" picker, 5c). Strangers can't be messaged.
- **Read receipts: off.** You see your own unread counts; nobody sees whether you've read a
  message. Announcements with acknowledgement (M3) cover "did they read it".
- **External threads (M4): clients and suppliers** from day one, through secure links.

## What M1 built (0.21.0)

- Migration `20261101000000_messaging.sql`, tests `supabase/tests/messaging.sql`.
- Tables `conversations` (direct or gig; one channel per gig, one direct conversation per pair),
  `conversation_members` (direct only; gig channels follow the gig's members), `conversation_state`
  (your last read time and mute) and `messages` (text or system, up to 4000 characters, optional reply).
- Who sees what: a direct conversation, its two people; a gig channel, everyone who can see the gig.
  Crew and PMs post in a gig channel, viewers only read. Messages can't be edited or deleted yet (M2).
- System messages in the channel when a gig's status, dates or venue change.
- Notifications (kind `message`): direct messages, and replies to you in a gig channel. One unread
  notification per conversation, counting up; reading the conversation clears it. Muting stops them.
  Ordinary channel messages only show as unread counts, so a busy channel doesn't flood the bell.
- Functions `start_direct`, `gig_conversation`, `my_conversations`, `read_conversation`.
- UI: `/messages` (list and conversation, one at a time on phones), the gig Chat tab, a messages
  button with an unread count in the top bar, "Message" buttons on crew rows and organisation members.

## What M2 built (0.22.0)

- Migration `20261102000000_messaging_m2.sql`, tests `supabase/tests/messaging_m2.sql`.
- **Files:** up to 10 per message, 50 MB each, in the private `message-files` bucket
  (`<conversation>/<random>/<name>`). Whoever can post uploads; whoever can read the conversation
  downloads, but only files a message still shows. Pictures show as previews.
- **Cards:** one gig, schedule item, file, quote or equipment item per message. The author can only
  share what they can see; readers who can't open it see "… you can't open", never its contents.
- **@mentions** in gig channels: people on the gig, and (from the gig's managers only) the groups
  everyone, crew, managers and each function ("@Sound"). Mentioned people get a notification
  (grouped per conversation like other messages, kind `message`, `details.why = 'mention'`).
- **Reactions** from a fixed set (👍 ❤️ 😂 😮 🙏 ✅ 👀), switched on and off, live.
- **Edit** your own messages; earlier versions are kept and visible to the conversation ("edited").
- **Remove** your own messages: text, files, card, mentions, earlier versions and reactions are
  cleared; a "Message removed" marker stays.
- **Copy link** to a message (`/messages/<conversation>?m=<message>`); opening it jumps there.
- Functions `edit_message`, `remove_message`, `react`.
- Why a message always has text: changing the M1 rule would need a destructive statement, so a
  message that is only files or a card gets a short automatic text ("📎 rider.pdf"), hidden next
  to its files or card and used in notifications and the email summary.
- Not yet: files of removed messages stay in storage (unreachable) until the retention work in M6.

## What M3 built (0.23.0)

- Two migrations: `20261103000000_conversation_kinds.sql` (**run by hand** in the SQL editor: it
  replaces two rules on `conversations`, which needs DROP CONSTRAINT) and
  `20261103000001_messaging_m3.sql`. Tests `supabase/tests/messaging_m3.sql`.
- **Organisation channels** (`kind = 'org'`): made by the organisation's admins (Messages → +), with
  a name, an audience (everyone, admins and members, or admins only) and optionally "only admins
  write". Viewers read but don't write. Admins rename, change or archive them (archived channels are
  read-only and sink to the bottom of the list). No deleting yet.
- **Department channels** on gigs (`kind = 'department'`): one per function on the gig ("Sound",
  "Light"…) plus "Managers" (the gig's PMs). Seen by those people and the gig's managers, made on
  first use from the chips in the gig's Chat tab (`gig_departments`, `department_channel`).
- **Pinned messages**: the people running a channel (gig managers, organisation admins), or either
  person in a direct conversation, pin messages; a bar above the conversation lists them.
- **Announcements with read-and-confirm**: the people running a channel send a message as an
  announcement. Everyone in the channel gets a notification (kind `announcement`, one each, even in
  muted channels) and a "I've read this" button; the author and the channel's managers see
  "3 of 12 confirmed" and who hasn't. Confirming clears the notification.
- **Search** across every conversation you can read (`search_messages`, plain text, newest first,
  50 results) and **saved messages** (private to you).
- `my_inbox()` replaces `my_conversations()` in the app (same rows plus channel titles, the
  organisation, archived and the number of pinned messages); the old function stays for now.
- Who reads what is still decided only in the database (`can_access_conversation`,
  `can_post_conversation`, `conversation_audience`, `can_manage_conversation`).

## What M4a built (0.24.0)

M4 is split in two: **M4a** connects messages to the rest of AVX; **M4b** (0.25.0, below) adds
conversations with a quote's client and a subrental's supplier, who have no account.

- Two migrations: `20261104000000_context_kind.sql` (**run by hand**: it adds the `context` kind
  and the `context_type`/`context_id` columns, which needs DROP CONSTRAINT) and
  `20261104000001_messaging_m4.sql`. Tests `supabase/tests/messaging_m4.sql`.
- **Availability questions in messages:** asking someone if they're available (Crew tab) also posts
  the question as a card in your direct conversation with them, with Available / Not available
  buttons and an optional note; the answer (or withdrawing the question) is posted under it. The
  question still appears in My work, and either place answers it. A database trigger does this,
  so every way of asking is covered.
- **Crew calls:** a gig's managers offer a place ("Rigger", 2 places, a note) to several people
  from their network at once (Crew tab → Crew call, or the 📣 button on an open position). Each
  person gets it as a card in their direct conversation with the sender, and a notification
  (`crew_call`, shown even when the organisation is muted). The first to accept are added to the
  gig with that function; later ones get "all places taken". The call closes when full, or when a
  manager closes it. Managers see each call's answers on the Crew tab and get a `crew_call_answer`
  notification for each accept or decline. People already on the gig and people you can't message
  are skipped. Tables `crew_calls`, `crew_call_answers`; functions `send_crew_call`,
  `answer_crew_call`, `close_crew_call`.
- **Call sheet to the crew:** "Send to the crew" on the call sheet page (managers) posts an
  announcement with a call sheet card in the gig's chat; everyone confirms they've read it, as with
  M3 announcements (`publish_call_sheet`).
- **Schedule notes:** adding or changing schedule items posts a short note in the gig's chat
  (not for draft gigs, and only once the chat exists). Several changes by the same person within
  15 minutes are gathered into one note.
- **Team conversations on one thing** (`kind = 'context'`): an equipment item, a repair or a
  subrental has a "Team conversation" (on the item page and in the repair and subrental windows),
  for the organisation's admins and members only. It's made the first time someone opens it
  (`context_conversation`) and appears in Messages once it has a message, with a link back to the
  thing. `context_type` already allows `quote` for M4b.
- `private.ensure_direct` opens a direct conversation for AVX itself (questions, crew calls)
  without the "can message" check, because the person asking already passed the rules that allow
  the question.
- Not in M4a: a photo of the damage from site is already a damage report (I5), so it isn't
  repeated in messages; quote and supplier conversations are M4b.

## What M4b built (0.25.0)

- Two migrations: `20261105000000_guest_conversations.sql` (**run by hand**: adds the `supplier`
  conversation type, which replaces a rule, and clean-up triggers) and
  `20261105000001_messaging_m4b.sql`. Tests `supabase/tests/messaging_m4b.sql`.
- **Client conversation on a quote** (`context_type = 'quote'`): the client writes from the quote's
  page (`/q/…`, the link they were sent), under the quote, with the name they type; it works on
  any of the quote's links that hasn't been revoked, also after the quote expired (e.g. to ask for
  an extension). Staff answer from the quote's Summary tab or from Messages.
- **Supplier conversation on a subrental** (`context_type = 'supplier'`): "Make a link for the
  supplier" in the subrental window creates `/s/…`, where the supplier sees the order (reference,
  dates, items and quantities, no prices) and the conversation. Only a hash of the link is stored,
  so it's shown once; a new link turns the old one off, and it can be turned off. The window shows
  when the link was made and last opened. This conversation is separate from the team's own
  conversation about the subrental (M4a), which the supplier never sees.
- Guests have no account: they read and write only through `guest_thread` / `guest_post` with the
  link's token, text only, at most 20 messages an hour per conversation. Their messages have no
  author and keep the name they typed (`messages.guest_name`), shown in the app with a
  "client"/"supplier" label. The page fetches new messages every 20 seconds.
- **Notifications** (kind `guest_message`, grouped per conversation, shown even in a muted
  organisation): to the quote's author and whoever sent the link, or the subrental's author and
  whoever made its link; the organisation's admins if none of them is still there. Opening the
  conversation clears them. In the email summary too.
- Deleting an item, a repair, a subrental or a quote now deletes its conversations (this also
  covers the M4a team conversations).
- Not yet: emailing the client or supplier when you answer (they see it when they open the page
  again; tell them in the quote email). Reply by email is part of M5. Files in guest conversations.

## What M5a built (0.26.0)

- Migration `20261106000000_push.sql` (turns on pg_net if needed). Tests `supabase/tests/push.sql`.
- **Push notifications on this device** (Account → "Notifications on this device"): each phone or
  computer turns them on for itself. On iPhone and iPad, only once AVX is added to the home screen
  (Apple's rule); the setting says so. A "Send a test" button checks it works.
- How it's sent: a trigger on `notifications` (a new one, or a grouped one counting up) asks the
  `send-push` function to deliver it, through pg_net, only if the person has a device turned on.
  `send-push` uses the same wording, mutes and links as the email summary
  (`supabase/functions/_shared/notification-text.ts`, now shared by both). Only notifications from
  the last 10 minutes, at most once every 2 minutes each, so a busy conversation doesn't buzz on
  every message; one notification per conversation on the phone, the newest replacing the last.
  Tapping it opens that page. Devices the push service no longer knows are turned off.
- The push keys (VAPID) are made by `send-push` on first use and kept in `push_keys`, which no
  user can read: nothing to configure. Signing out turns that device off.
- **Offline outbox:** a text message written without a connection waits on the device ("Waiting
  for a connection", with a cross to cancel it) and is sent as soon as the connection is back,
  in order. Each message gets its id on the device, so it can't be posted twice. Files, cards and
  announcements need a connection. If the server refuses one (e.g. you left the gig meanwhile),
  you're told and it's dropped. Signing out removes what's waiting.
- Not yet (M5b): reply by email to the summary, and emailing a client or supplier when you answer
  them. Both need inbound email on your domain (DNS records), so they wait for that decision.
  Quick replies from the notification itself are left for the phone app, if it's built.

## What M6a built (0.27.0)

- Migration `20261107000000_messaging_m6a.sql`. Tests `supabase/tests/messaging_m6a.sql`.
- **Report a message** (message menu → Report, with a reason: spam, abusive or harassing, something
  else, and an optional note). In a gig's or organisation's conversation the people running it
  are told (`message_report` notification, also in muted organisations): the gig's managers (its
  PMs, whoever created it, the organisation's admins) or the organisation's admins. They see the
  message, the reasons, the notes and how many reported it, **never who**; under the message they
  choose Remove or Keep it. Reports from direct conversations, which nobody runs, are kept for
  the AVX team (`message_reports`, read in Supabase for now). One report per person per message,
  at most 20 a day.
- **Moderators remove messages** (menu → Remove as moderator), reported or not, in the
  conversations they run (never direct ones). The message shows "Removed by a moderator"
  (`messages.removed_by`), its text, files and earlier versions are cleared like the author's own
  removal, and the author gets a `message_removed` notification with the start of the text.
- **Block a person** (in a direct conversation: the message menu, or the report window). Neither
  of you can write in your direct conversation; their mentions and replies in shared channels
  don't notify you. Work questions (availability, crew calls) still arrive, since the gig still
  needs an answer. The other person isn't told; they see their messages aren't delivered.
  Unblock in the conversation or in Account → People you blocked (`user_blocks`, with `active`).
- **Rate limits:** at most 20 messages a minute and 300 an hour per person (what they write
  themselves; work messages like crew calls don't count). Messages written offline that hit the
  limit wait for the next try instead of being dropped.
- Not yet (M6b): retention per organisation (delete messages older than…), organisation export
  of its conversations, usage counts per organisation. A place for the AVX team to read reports
  from direct conversations comes with the help centre (docs/PUBLIC_SITE.md).

