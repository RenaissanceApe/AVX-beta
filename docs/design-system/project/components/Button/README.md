# Button

`ui.jsx` exports `btnPrimary`, `btn`, `btnDanger`. One primary per view.

- **Primary** (`btnPrimary`): flat `accent` fill, `on-accent` text, weight 600; hover `accent2`. Lime in Show/Contrast, navy in Daylight. No gradient, no glow, no shadow.
- **Secondary** (`btn`): transparent, 1px `line-strong` edge, `text`. Hover: edge goes `text`.
- **Ghost**: no edge; hover `hover` fill. Toolbars, "Add line", "Add day".
- **Danger** (`btnDanger`): `danger` edge, `text` label; hover `danger-soft`. Fill-red buttons don't exist: the destructive step is the confirmation dialog.
- **Busy**: label becomes the verb in progress ("Saving", "Sending") with a blinking square; never a spinner circle.

One accent fill per screen: the primary. A page header shows the primary and at most two secondary buttons; a card or row at most two; the rest go in the ⋯ menu (`MoreMenu`). Label 14px (body), weight 600. Sizes: 36px desktop, 44px (`control-lg`) on phone forms and anything used with gloves on. Labels sentence case, a verb + object ("Send quote", not "Submit"). Press: 1px down, 100ms.
