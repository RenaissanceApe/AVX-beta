# Messaging: plan

Status: **M1 (0.21.0) and M2 (0.22.0) built**; M3–M6 planned. A project of
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
| **M5** | Push notifications, reply by email, offline outbox |
| **M6** | Moderation, retention, export, rate limits |

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

