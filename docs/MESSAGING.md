# Messaging: plan

Status: **planned**, after the inventory phases ([INVENTORY.md](INVENTORY.md)). A project of
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

## Questions to settle before M1

- Should the gig **feed** become the gig channel, or stay as the "official updates" board next to it?
- Can crew start direct conversations with anyone they've worked with, or only within shared gigs?
- Read receipts: on, off, or per organisation?
- External threads: clients only, or suppliers too from day one?
