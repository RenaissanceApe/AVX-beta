# DR2: The gig page

What this worker would add to the files only the Dispatcher edits (docs/PARALLEL.md, "Worker rules").

## Changelog (heading "DR2: The gig page")

#### Changed
- **Gig page:** calmer. The header shows the gig's name, its labels and your call time, one line with the venue,
  dates and your role, and **Edit gig** (in ⋯ on a phone); Refresh is a small icon next to Back. Your call no
  longer has a green fill.
- **Overview** is a column of sections with plain headings and space between them, no boxes: what's coming up
  first, then the description, details, crew, files, the latest posts and the gig's finances. The wrap-up link is
  one quiet line.
- **Every tab** starts the same way: its name, a count where useful, the ⓘ (the explanation that used to sit under
  the name), one main button and at most one more. The rest is in ⋯: on Crew, **Find crew** and **Post a job**; on
  Equipment, **Dispatch** and **Report damage** (crew who can't add gear still see Report damage).
- **Lists are rows**, not a box each: the running order, crew, positions, crew calls, pending invites, labour cost,
  equipment, files, posts and history. A booking clash or gear that's short keeps its coloured row with a bar on
  the left.
- Chat channels, the Updates switch (posts / history) and the Tasks filters mark the chosen one with a green bar
  under it instead of a green fill.

#### Fixed
- The labour cost panel spread the rate card's data into its own style by mistake (a name clash); it is a plain
  section now.
- The gig finance panel's "Invoiced (incl. VAT)" row no longer has a glossary button whose name didn't match its
  text (axe).

## Version
Part of the design refresh feature set's version (D50 d).

## Roadmap
DR2 built: the gig page on the layout pieces (docs/DESIGN_REFRESH.md, "How the gig page works").

## Pending: test lines (section 2)
- Open a gig on a phone as a PM: Edit gig is in ⋯; on Crew, Find crew and Post a job are in the tab's ⋯; on
  Equipment, Dispatch and Report damage are in ⋯. As crew, Report damage is in view on Equipment.
- Check a gig with a booking clash (Crew tab) and gear that's short (Equipment): the rows still stand out.

## Pending: new questions (section 3)
- **Next-event card (Simple home):** two actions in view, picked by DR2 and built by DR5: **Call sheet** and
  **Chat** (the two things crew open most before a gig: where and when, and the team); Open gig, Report damage and
  Read aloud go in ⋯. Say if you want a different pair.
- **Help guides that name moved buttons:** "Post a job" and "Find crew" (Crew tab) and "Edit gig" (phone) now sit
  in ⋯. The guide steps still say "tap Post a job" etc. Proposed: "tap ⋯ → Post a job", "tap ⋯ → Find crew",
  "open ⋯ → Edit gig". Not changed (rewriting help text needs your yes); the screenshots already show the menu.
