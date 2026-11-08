# Parallel feature sets

How several Claude Code sessions build one **feature set** (a group of ROADMAP steps that don't
depend on each other) at the same time, and how you get one report and one PR to merge at the end.
The usual way, one session per step that you watch yourself, still works and is unchanged
(CLAUDE.md, "A session, start to finish").

Decided 2026-11-08 (D50 in docs/PENDING.md): workers use the test project without asking, the
Dispatcher merges into `test` by itself, DR2–DR5 may run together, and a feature set ships as one
version.

## Who does what

| Role | What it does | What it never does |
|---|---|---|
| **You** | Answer the set's questions once at the start, say yes to production migrations, merge `test` → `main` | — |
| **Dispatcher** (one cloud session, started from the prompt at the end of this file) | Picks the set, asks your questions in one go, starts one worker session per step, watches their PRs, sends failures back to the worker responsible, merges green worker PRs into `test`, opens the `test` → `main` PR with the summary, tells you | Read or write app code; merge into `main` |
| **Worker** (one cloud session per step) | Builds its step from its prompt, opens a PR into `test`, writes its report, fixes what the Dispatcher sends back | Touch another worker's area; edit the shared files listed below; touch production |
| **Release worker** (one short session at the end of a set) | Folds the workers' notes into CHANGELOG, ROADMAP, PENDING and SESSION_PROMPTS, bumps the version | App code |

QA is part of the Dispatcher's job: it reads CI results and PR reports, which is light work. If
the Dispatcher gets crowded, QA can become its own session later.

## Branches

```
main  ← merge commit (you) ←  test  ← squash (Dispatcher) ←  one branch per worker
```

- `main` is live; nothing changes there.
- `test` collects one feature set. At the start of each set the Dispatcher moves `test` to match
  `main` (it only does this when `test` has nothing that `main` lacks).
- Workers branch from `origin/test` and open their PR **into `test`**.
- `test` → `main` is merged with a **merge commit**, not a squash, so `test` and `main` stay in
  line and `test` can simply be moved forward for the next set. Worker PRs into `test` are squashed.
- CI runs on every PR, whatever branch it targets, so each worker PR and the final PR are checked.

## Feature sets

A proposal from the ROADMAP's "Needs" column. Steps in one line run at the same time; the next
line starts when the line above is merged into `test`. At most **4 workers** at once. The
Dispatcher shows you the set it plans to run before starting it.

| Set | Runs | Why this split |
|---|---|---|
| **Money reports** | K4, K5, K7, K8 together → K6 → K9 alone (your picks) | K6 needs K5; the others only need what's built. K9 needs K2–K8 |
| **Design refresh** | DR1 alone → DR2, DR3, DR4, DR5 together → DR6 alone | DR1 makes the shared layout pieces; DR2–DR5 are different screens (D50) |
| **Tools, part 1** | S07 (13), S08 (14), S11 (16) together | None needs another |
| **Tools, part 2** | S09 (15a P1), S12 (17a RG1) together → S10 (15b P2), S14 (18 RG3) together | P1 needs 13 and 14; RG1 needs the light plot; P2 needs P1; RG3 needs 13 and RG1 |
| **Tools, later** | S13 (needs U4's truss check), S15 onwards | Mostly a chain; plan it when part 2 is merged |
| **Upkeep** | U1, U3, U5, U6 together; U2 alone; U4 when the manufacturers answer | U2 upgrades packages used everywhere |
| **Import overhaul** | IM1 → IM2 → IM3 → IM4, one at a time | Each builds on the one before |
| **QA bot** | QA1 → QA2 → QA3 → QA4, one at a time | Each needs the one before; QA1 needs setup from you |

Conditional steps (K10, K11, S22) only join a set once you've said yes to their decision.

## Worker rules

What a worker does differently from a solo session. Everything else in CLAUDE.md still applies.

1. **Branch from `origin/test` and open the PR into `test`.**
2. **Don't wait for answers.** Your questions were answered before you started; the answers are in
   the message that started you. If a new question comes up, take the safest reading, write it
   under *Needs your decision* in the PR, and carry on. If you truly can't continue, message the
   Dispatcher (its session id is in your first message) and stop.
3. **Stay in your area.** The first message lists the other workers and what they own. If you
   must change something another worker owns (a shared component, a shared SQL function), message
   the Dispatcher first.
4. **Don't edit the shared files:** `package.json` version, `CHANGELOG.md`, `ROADMAP.md`,
   `docs/PENDING.md`, `docs/SESSION_PROMPTS.md`. Write what you would have added to them in
   **`docs/notes/<step>.md`** (format below). The release worker folds the notes in.
5. **Translations and help text:** add your keys next to the keys for the same area in
   `src/i18n/en.js`, `pt.js` and `src/help/*.js`, never at the end of the file. Changes in
   different places merge cleanly; changes at the same spot conflict.
6. **Database:** use the migration date the Dispatcher gave you (`YYYYMMDD` + your own time
   part). Migrations must only add (`create or replace`, `if not exists`). Apply them to the
   **test** project only, run the `supabase/tests/` file there, and don't wait for a yes: the test
   project is for this. Put the outline in the PR under *For the owner*. **Never touch
   production**; the Dispatcher applies to production at the end, after your yes. Edge Functions:
   same, deploy to test only.
7. **Report** in the PR description, using every section of the PR template, and file an issue for
   each *should fix* or *urgent* finding (see "Reports" below).
8. **When done**, message the Dispatcher: `Done: <step>, PR #<n>`. Then stay available: the
   Dispatcher may send fixes back. When it does, fix them on the same branch and push.
9. If your PR can't be merged because `test` moved on, merge `origin/test` into your branch,
   resolve the conflicts, run `npm run check` and push.

## Reports

Nothing a worker found may live only in its chat, because you may never open that session.

**1. Each worker's PR description** uses `.github/pull_request_template.md`:
*Changed*, *Found, not changed* (each with where, why it matters and a severity: **urgent**,
**should fix**, **nice to have**), *Needs your decision*, *Tests run*, *For the owner*.

**2. GitHub issues** for every *should fix* or *urgent* finding: one issue each, label
`needs-triage`, a link back to the PR and step. Search open issues first so the same finding isn't
filed twice. *Nice to have* stays in the PR only.

**3. Urgent findings don't wait.** A security hole, a risk of losing data or something broken in
the live app: the worker messages the Dispatcher at once, and the Dispatcher tells you at once.

**4. The Dispatcher's summary** sits at the top of the `test` → `main` PR, in this order:

1. **Needs your action before merging:** production migrations and Edge Functions waiting for
   your yes, decisions, anything urgent
2. **Needs your decision:** from all workers, each with what the worker assumed meanwhile
3. **What changed:** one line per step, linking to its PR
4. **New findings:** the issues filed, grouped by severity
5. **Tests:** each worker's result and the full run on `test`

## Notes file (`docs/notes/<step>.md`)

```md
# <step>: <title>

## Changelog
<the lines you would have added under ### Added / ### Connected / ### Changed>

## Roadmap
<the "Built" row: area, how it works (doc link)>

## Pending: test lines (section 2)
- <one line per thing you should try by hand>

## Pending: new questions (section 3)
- <question, the options, what you assumed>

## Session prompt
<the prompt section this session carried out, e.g. "K4", or "none">
```

## The Dispatcher's cycle

1. **Start or resume.** Read `ROADMAP.md`, this file's "Feature sets" and the open PRs. Find the
   next set whose steps' "Needs" are all built. If a set is half done (a tracking issue is open),
   pick up from it.
2. **Prepare.** Make sure `test` matches `main`; if `test` has commits `main` lacks, stop and tell
   the owner. Open a **tracking issue** "Feature set: <name>" listing the steps, and later each
   worker's session and PR. This is where the set's progress lives, so a new Dispatcher can carry
   on.
3. **Ask once.** Grep `docs/SESSION_PROMPTS.md` for the set's prompt sections and read only those,
   plus `docs/PENDING.md` section 3. Gather every open question and ask the owner in one message.
   Also show the steps to run together and which have database changes. Wait for the answers.
4. **Dispatch.** Start one worker session per step that can run now (no more than 4). Give each a
   migration date: the day after the newest file in `supabase/migrations/`, one day per worker.
   The first message is:

   ```
   You are a worker in the feature set "<set>", started by the Dispatcher (session <id>).
   Follow CLAUDE.md, "In a parallel feature set", and docs/PARALLEL.md, "Worker rules".
   Base branch: test. Your migration date: <YYYYMMDD>.
   Other workers and what they own: <step: area, …>.
   The owner's answers to your step's questions: <answers>.
   Your prompt:
   <the prompt section, as it is>
   ```

5. **Watch.** Subscribe to each worker's PR when it opens. On a red check, send the worker the
   failing check's name and the first error lines, nothing more. On an urgent finding, tell the
   owner at once. As a fallback, check each worker every hour.
6. **Integrate.** Merge each green worker PR into `test` (squash), one at a time. If the next one
   now conflicts, ask its worker to merge `origin/test` and push. When a line of the set is merged,
   dispatch the next line.
7. **Release.** When every step is in `test`, start a release worker from `test`:
   *"Fold every file in `docs/notes/` into CHANGELOG.md (one section for this version, a heading
   per step), ROADMAP.md, docs/PENDING.md sections 2 and 3, and docs/SESSION_PROMPTS.md (remove
   the prompts carried out, update the 'built' line). Bump the minor version in package.json.
   Delete the notes files. Run `npm run check`. Open the PR into `test`."* Merge it when green.
8. **Promote.** Open the PR `test` → `main` with the summary above. When its checks are green,
   tell the owner it's ready.
9. **Production.** If the set has migrations or Edge Functions, wait for the owner's yes, then
   apply them to production as CLAUDE.md "Database" says (compare `md5(prosrc)` with the test
   project) **right before** the owner merges. They only add, so the live app keeps working.
   Without the Supabase connector, list the steps for the owner instead.
10. **Next.** When the PR is merged, close the tracking issue, move `test` to `main`, and go
    back to 1.

If the Dispatcher's conversation gets long, start a new one with the same prompt: everything it
needs is in GitHub (tracking issue, PRs, issues).

## What you set up once

- GitHub → Settings → General → Pull Requests: allow **merge commits** (needed for `test` → `main`).
- Optional: a branch rule on `test` requiring CI to pass.
- The Claude app's notifications on, so the Dispatcher's messages reach your phone.

## The Dispatcher prompt

Paste this into a new Claude Code session on this repository:

```
You are the Dispatcher for AVX-beta. Read docs/PARALLEL.md and follow "The Dispatcher's cycle".
You don't read or write app code: you plan, start worker sessions, watch their PRs, merge green
worker PRs into test, and open the test → main PR. Never merge into main.
Start with the next feature set (or the one I name here: <optional>).
```
