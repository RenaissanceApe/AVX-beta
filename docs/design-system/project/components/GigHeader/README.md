# GigHeader

Top of every gig (`GigHeader.jsx`): a `PageHeader` with the name as the page title (28px, 22px on a phone), status and label chips, the viewer's call as a plain CallChip (no green fill) and the ⓘ; one line with venue · dates · your role; **Edit gig** as the secondary action (in ⋯ on a phone); then the **gig tabs** (Overview, Schedule, Assets/Files, Equipment, Crew, Tools, Chat, Updates, Tasks, Hours — only those the role can see). Tabs scroll horizontally on phones; the active tab has a 2px `accent` underline that slides in 250ms. Counts beside tab names are plain `muted` numbers, no boxes. Each tab's sections sit on the page ground with 16px headings, 40/48px apart; lists are hairline rows.

Remove the tint gradient behind the header: the label colour is the chip's square, never a wash.
