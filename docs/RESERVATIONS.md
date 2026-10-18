# Reservations: one engine for "is it free?"

AVX keeps a single table of **reservations**: "this resource is taken for this time range".
People use it now; equipment, vehicles and rooms will use the same table and the same clash
check later, so double-booking warnings work the same way for everything.

Migration: `20261024000000_reservations_people.sql` (and `20261024000001_requests_unread.sql`).
Tests: `supabase/tests/reservations_people.sql`.

## The table

| Column | Meaning |
|---|---|
| `resource_type`, `resource_id` | What is booked: `person` + user id today; later `equipment`, `unit` (one serial-numbered item), `vehicle`, `space`… |
| `quantity` | How many (for bulk equipment later; always 1 for people) |
| `period` | A real time range (`tstzrange`, start included, end excluded) |
| `status` | `hold` (draft gig, provisional), `confirmed`, `cancelled` |
| `org_id`, `gig_id` | Who owns it and what it's for (both optional) |
| `source_type`, `source_id` | What created it, so it can be kept in step: `gig_member` (`gig:user`), `unavailable` (the unavailable-dates row) |
| `label` | Short text shown in clash warnings, e.g. the function on the gig |

Rows are **written only by the database** (triggers), never by the app. They are cancelled, not
removed, when their source goes away, and they disappear with their gig or organisation.

## How people get reservations

- **On a gig**: one reservation per person per gig, whatever roles they hold. Without booking
  times it covers the gig's whole days in the organisation's time zone (`organisations.time_zone`,
  default Europe/Lisbon); with **booking times** (`gig_members.booked_from/until`, set by managers
  in the Crew tab) it covers just that shift, so two short jobs on one day don't clash.
- Draft gigs give a **hold**, archived gigs **cancel** it, other statuses **confirm** it.
- Changing a gig's dates or status, or someone's booking times, updates the reservation at once.
- **Unavailable dates** (Account) are personal reservations with no organisation.

## The clash check

`private.clashes(type, resource, period, exclude_gig)` returns everything else booked for a
resource in a time range. **Privacy**: the gig name, company and function are filled in only when
the person asking may see that gig; otherwise the row just says "booked" with its times.

Public functions (all require two-step sign-in when it's on):

| Function | Who | Used for |
|---|---|---|
| `gig_clashes(gig)` | the gig's managers | ⚠ next to crew booked elsewhere, in the Crew tab |
| `email_clashes(gig, email)` | the gig's managers | the warning while inviting someone by email |
| `my_clashes(from, until, exclude_gig)` | anyone, about themselves | the warning in the new/edit gig form |

My work reads your own reservations directly and marks gigs that overlap another booking or
your unavailable dates ("Double booking" on the card and an amber outline in the calendar).

## Asking first

When someone is already booked, managers can **ask availability** (`availability_requests`):
the person gets a notification and answers "available" / "not available" with an optional note
from My work (`my_availability_requests()`), which notifies whoever asked. Only one open question
per person per gig; managers can withdraw it. Nothing is booked by asking.

## Adding equipment later (Inventory, see docs/INVENTORY.md)

1. Planning equipment on a gig writes reservations with `resource_type = 'equipment'` (bulk, with
   `quantity`) or `'unit'` (a serial-numbered item), `source_type = 'gig_equipment'`.
2. Availability = stock minus the sum of overlapping, non-cancelled reservations; the same GiST
   index (`resource_type, resource_id, period`) makes that fast.
3. Prep/return buffers (e.g. a day before and after) are just a wider `period`.
4. The visibility rule for non-person resources is already in place: members of the owning
   organisation see them.
