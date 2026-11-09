# DR5 notes for the Dispatcher

What this worker would add to the files only the Dispatcher edits (docs/PARALLEL.md, "Worker rules").

## CHANGELOG (under the feature set's version, heading "DR5: Field and crew screens")

#### Changed
- **On-site mode:** today's schedule and your tasks are no longer in boxes; your call time is a highlighted band. Every
  button and schedule row is at least 44 px, easy to hit with gloves on. The note that on-site mode came on by itself
  has a plain line above and below it instead of a green border.
- **Simple home:** the next gig's buttons sit in a tidy grid (Call sheet across the top, then Chat, Open the gig,
  Report damage and Read aloud), and the gigs after it are a plain list.
- **Scan out and in (Dispatch):** a clearer header. Sound and Scan mode stay in view; Packing list and the warehouse
  numbers are next to them on a computer and under ⋯ on a phone. Record is now the only green button. The step
  buttons no longer spill their text on a small phone.
- **Messages:** the conversation list is a plain list with lines between conversations, no box around it. Search and
  Saved show which one is open with a green bar. The buttons at the top of a conversation are bigger.
- **My tasks** and **My numbers:** the usual page header; My numbers' sections are no longer boxes.
- **Help:** the guides and the glossary are plain lists with more space between them; the word you came to see is
  highlighted. In a guide the step numbers are no longer green squares.
- **Field tools and Pocket tools:** text sizes and spacing are the same as everywhere else.

## Version
Part of the design refresh feature set's version. On its own it would be a patch bump.

## ROADMAP
Mark the DR5 row built (done in docs/DESIGN_REFRESH.md, which is not a shared file).

## docs/PENDING.md
- Section 2 (to test): "Field and crew screens (DR5): on a phone, open a gig on its day (On-site mode), a Simple-mode
  home, Scan out and in (step buttons at a narrow width), Messages (list, Search, Saved, a conversation) and Help
  (/help#call-time). Everything fits, buttons are easy to hit, there's one green button per screen."
- Section 3 (new questions):
  - The Simple home card shows five buttons (Call sheet, Chat, Open the gig, Report damage, Read aloud); the rule is
    two per card. All kept because they're used on the day. Move any into ⋯?
  - On-site's call time is 28 px and the timecode clock 28 px (the type table says 24 for a call time and 20 for clocks);
    kept bigger for reading at arm's length. Keep, or go to the table's sizes?

## SESSION_PROMPTS.md
The "DR5 · Field and crew" prompt was carried out: remove its section and update the "built" line.
