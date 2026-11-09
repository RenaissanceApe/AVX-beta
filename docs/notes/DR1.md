# DR1 notes for the Dispatcher

What this worker would add to the files only the Dispatcher edits (docs/PARALLEL.md, "Worker rules").

## CHANGELOG (under the feature set's version, heading "DR1: Foundations and the home")

#### Changed
- **Home:** calmer and arranged your way. Sections sit further apart with a plain heading each, no boxes
  around them. **Arrange home** (at the bottom) moves the availability questions, the numbers and the gigs
  up or down, hides any of them, or puts them back as they were; it is remembered on this device for each
  workspace.
- **Key numbers** (and My numbers) are bigger and, on a phone, a row you swipe sideways (arrow keys work
  too); on a computer three in a row. They no longer fold from their heading: hide them in Arrange home.
- **First steps** is now one quiet line ("First steps · 2 of 4 done · next: Add your equipment") that opens
  the steps still to do; finished steps are no longer listed and it has no green border.
- **On a phone** the home no longer repeats the organisation's name (the top bar shows it): the greeting is
  the title. What your role allows moved behind the ⓘ next to the role chip. The "Every gig you're on…"
  line under My work is gone (the ? explains it).
- The gig filters on the home mark the chosen one with a green bar instead of a green fill.

#### For developers
- Layout pieces in `ui.jsx`: `Section`, `Stack`, `PageHeader`, `SwipeRow`, `MoreMenu`, `usePhone`, `space`;
  spacing steps as CSS variables in `index.html`. A test stops new off-scale text sizes and gaps.

## Version
Part of the design refresh feature set's version (D50 d). On its own it would be a minor bump (0.78.0).

## ROADMAP
Mark the DR1 row built.

## docs/PENDING.md
- Section 2 (to test): "Home (DR1): on a phone, open Arrange home, move Gigs to the top and hide Key numbers;
  reload: it stays. Open another workspace: it has the standard order. Back to the standard restores it.
  First steps shows one line and opens the steps left."
- Section 3 (new questions):
  - The home's My work intro line ("Every gig you're on, at any company…") was dropped under rule 4; its
    string `home.myWorkIntro` is now unused. Remove it, or bring it back under ⓘ?
  - `firstSteps.left`, `firstSteps.done` are unused now; remove in DR6?

## SESSION_PROMPTS.md
The "DR1 · Foundations and the home" prompt was carried out: remove its section and update the "built" line.
