# BF5: Two people changing the same checklist or field tool no longer overwrite each other

## Changelog
#### Fixed
- **Task checklists** (BF5): ticking or unticking an item now saves only that item, on the server.
  Two crew ticking items on the same task from two phones a moment apart used to lose one of the
  ticks; now both are kept, and the list then shows everyone's ticks (#236).
- **Field tools** (BF5): the patch, light plot (and MVR import), stage plot, power plan, sound
  system calculator, rigging and line arrays no longer save over someone else's change. If another
  person changed the gig's show model since this screen loaded it, nothing is written and the app
  says "Someone else changed this — reload to see their changes", with a **Reload** button. Quick
  changes on one device still save in order without tripping over each other (#236).

## Roadmap
Bug fix, no roadmap row. Fixes #236 (found by BF1).

## Docs: how it works (for docs/FIELD_TOOLS.md, "Saving when two people edit")
- **Checklist ticks** go through `public.set_task_checklist_item(task, item id, done)`
  (migration `20270125000000_task_checklist_item.sql`): one statement sets that item's `done`
  inside `tasks.checklist` and returns the new list and `updated_at`. Who may tick is the same as
  the tasks policy (`private.task_can_tick`), plus the two-step sign-in check. In the app,
  `tickChecklistItem` (`src/lib/queuedSaves.js`) queues ticks per item, and `tickTaskItem`
  (`src/components/tasks/TaskParts.jsx`) shows the tick at once and takes the server's list when
  the task's last tick is back. Adding, removing and renaming items still saves the whole list
  from the edit form, with the `updated_at` guard (`updateIfUnchanged`).
- Items are identified by the `id` the app gives them when the checklist is written
  (`checklistFromText`); it now also gives an id to an old item without one, and never reuses an
  id for two items.
- **Field tools** save through `saveShow(gigId, values)`. Each tool reads `updated_at` with
  `gig_show` and reports it with `noteShowLoaded`. A save is an update that only matches if
  `updated_at` is unchanged (`updateIfUnchanged`, keyed by `gig_id`), or the first insert when the
  gig has no row yet (refused if someone else made it first). After each save of its own, the
  device moves its copy of `updated_at` on. Saves for one gig go out one at a time (one queue per
  gig, BF1's queue), so a device's own quick changes never conflict with each other. On a
  conflict the tool shows the stale-save toast with Reload and leaves the screen as it is.

## Pending: test lines (section 2)
- Tasks: on two phones, open the same task's checklist; tick a different item on each within a
  second. Both stay ticked after a reload on either phone.
- Tasks: the person the task is for (crew) can still tick items; a viewer on the gig can't.
- Field tools: open the patch (or light plot, stage plot, power plan…) on two devices. Change it
  on one, then on the other: the second shows "Someone else changed this — reload…" with Reload,
  and the first device's change is still there. After Reload, the second device can save again.
- Field tools: on one device, make several quick changes (drag a bar, add a stage box twice):
  all are saved, with no "Someone else changed this" message.

## Pending: new questions (section 3)
- **The guard is per gig, not per tool.** `gig_show` has one `updated_at` for all its parts, so if
  person A changes the patch while person B has the light plot open, B's next light-plot save is
  refused (B reloads and carries on). Assumed this false alarm is better than a lost change; a
  per-part stamp would need a new column. Change it?
- **`set_task_checklist_item` returns the list and the task's `updated_at`** (the prompt said the
  list): without the new `updated_at`, opening the task's edit form right after ticking would wrongly
  say someone else changed it.

## Session prompt
none (worker prompt from the Dispatcher for issue #236)
