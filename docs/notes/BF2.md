# BF2: UI and accessibility fixes from the automated tests

## Changelog
### Fixed
- The notification bell: from ten unread it shows "9+", and a screen reader now hears "9+ unread notifications" (it said "10 unread notifications", which didn't match what's on screen). (#209)
- Messages: the ⋯ menu of a message near the top of a short conversation opens downwards when there's no room above, so Pin, React, Reply and Copy link can be tapped. (#211)
- Messages: while a photo is loading (or if it can't load) it shows a labelled placeholder instead of a link with no address, which screen readers couldn't use. (#212)
- Labels on a phone: switching a sheet from a roll to A4 sheets fits the whole sheet on screen straight away (it was cut off on the left until a reload). (#223)
- The client's quote page and the supplier page are easier to read: the organisation's name on the brand-coloured header is now dark or white, whichever reads better on that colour, and the small grey text in the conversation with the company is darker. (#146)

## Roadmap
None (bug fixes; no roadmap step).

## Pending: test lines (section 2)
- On a phone, open a new channel with one message and tap its ⋯: the whole menu shows below the message and Pin/React/Copy link work.
- Open a client quote link of an organisation with a light brand colour and one with a dark brand colour: the name on the header is readable on both (dark text on light colours, white on dark ones).

## Pending: new questions (section 3)
- The header text on quotes now follows the brand colour (dark on light colours, white on dark ones). This also applies to the printed/PDF quote when the organisation has no header image. Assumed that's wanted (it's the readable choice); say if you'd rather keep white always and pick a darker default green instead.

## Session prompt
none
