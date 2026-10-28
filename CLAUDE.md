# CLAUDE.md

AVX: an AV production copilot for gigs, crew, documents, quotes, inventory and field tools.
React 18 + Vite (JavaScript/JSX, no TypeScript), Supabase (Postgres + RLS, auth, storage, Edge
Functions in Deno/TS) and Vercel. UI in English and Portuguese. Node 22 (`.nvmrc`).

The house rules are in `CONTRIBUTING.md`; the essentials are repeated below so you don't need to
open it. When a rule here and the code disagree, trust the code and say so.

## Reading budget: this repo is large, so read narrowly

- **Search before you open.** Use Grep or Glob to find the symbol, route or i18n key, then
  read only the lines you need (Read with `offset`/`limit`). Don't open whole folders.
- **Never read these files whole** (each one is 40–200 KB):
  - `src/i18n/en.js`, `src/i18n/pt.js`: grep for the key, e.g. `grep -n "'quotes\." src/i18n/en.js`
  - `src/help/en.js`, `src/help/pt.js`: grep for the id
  - `src/data/truss/*.json`, `package-lock.json`, `public/help/shots/*`
  - `CHANGELOG.md`: read only the top section (`head -40`) to copy its format
  - `docs/*.md`: open one only when the task is about that area (e.g. `docs/QUOTES.md` for
    quotes; the ROADMAP row names it); use grep to find the relevant section. `ROADMAP.md` is
    short: read it at the start of a session
- Big components (`Conversation.jsx`, `ImportPage.jsx`, `RehearsalTool.jsx`, `lib/importer.js`)
  are 40–60 KB. Read them in ranges around what you're changing.
- Don't re-read a file you've already read in this session unless it changed.
- Avoid running `npm run build` or the e2e tests just to look around; run them to verify.

## Where things live

```
src/
  App.jsx           routes (start here to find the page for a URL)
  pages/            one file per screen (GigPage, QuotesPage, InventoryPage, …)
  components/       shared UI; ui.jsx = Modal + style tokens; subfolders per area
                    (gig/, quotes/, inventory/, messages/, tools/, tasks/, jobs/, help/, …)
  lib/              logic + Supabase calls; pure helpers have *.test.js beside them
                    supabase.js (client), AuthContext, ToastContext, logger.js
  i18n/             index.jsx (t, useI18n, fmt, ago) + en.js / pt.js dictionaries
  help/             index.js (GUIDES) + en.js / pt.js (terms, hints, pages, guides)
  theme/tokens.js   colours
  data/truss/       manufacturer load tables (JSON)
supabase/
  migrations/       schema + RLS, applied in filename order
  functions/<name>/ Edge Functions (index.ts); shared code in functions/_shared/
  tests/*.sql       RLS/behaviour tests per feature (run in Supabase SQL editor)
scripts/help-screens/  generates help screenshots (sample data only)
e2e/                Playwright tests (e2e/auth/ = signed-in)
docs/               design notes per feature area; docs/PENDING.md = things waiting on the owner;
                    docs/SESSION_PROMPTS.md = the prompt for each remaining feature session
ROADMAP.md          what is built and the build order (the only list of what comes next)
```

## Commands

- `npm run dev`: local server on :5173 (needs `.env` with Supabase URL + anon key)
- `npm run lint` / `npm test` (Vitest) / `npm run build`
- `npm run check`: lint + test + build. **Run before every commit you push.**
- `npm run build && npm run test:e2e`: when screens or routes change
- `npm run help:screens -- <guide-id>,…`: regenerate help screenshots

To test a single file: `npx vitest run src/lib/<file>.test.js`.

## Rules that tests or lint enforce

- **No hard-coded UI text.** Add each key to **both** `src/i18n/en.js` and `pt.js` and use
  `t('key', { vars })` (`useI18n()` in components). Plurals: `key.one` / `key.other` + `{ count }`.
  Dates: `fmt(date, pattern)`, `ago(date)`. `npm test` fails on missing/mismatched keys.
- **No raw colours in screens.** Use `colors.*` from `components/ui.jsx`, CSS vars like
  `var(--text)`, or `tint(colour, percent)`. Green text is `colors.accentText`, text on green
  fills is `colors.onAccent`, and small grey text uses `colors.muted` / `colors.soft`.
- **No `console.*` or `alert()`.** Use `logger` (`lib/logger.js`) and
  `useToast().notify(userMessage(error))`. Log ids and step names only, never emails, tokens,
  file contents or signed URLs.
- **Accessibility:** axe runs in e2e; serious/critical findings fail CI. A button's accessible
  name must include its visible text. Never use colour or hover as the only signal.

## Database

- Every change is a **new** migration `supabase/migrations/YYYYMMDDHHMMSS_description.sql`.
  Never edit an applied one. Prefer `create or replace` / `if not exists` over `drop`.
- RLS on every table; policies use the `private` schema helpers (`can_access_gig`,
  `can_manage_gig`, …) and never query their own table.
- Add or extend a test in `supabase/tests/` for new access rules.
- Edge Functions check permissions by calling the RPC as the user before using the service role.
- Outline the migration and get the owner's yes first (see "How to work"). Then, if the Supabase
  connector is available: apply it to the **test** project (`idvebeadnrxudfgortzg`), run its
  `supabase/tests/` file there until it ends with "ALL … CHECKS PASSED", apply the same SQL to
  **production** (`otmulrlslecgyezpcqxy`), and compare function bodies on both (`md5(prosrc)`).
  Without the connector, list the steps for the owner and add them to `docs/PENDING.md`.
- Through the connector, never run `delete`, `drop` or `truncate` statements (not even in a comment
  or a test message; foreign keys' `on delete` clauses are fine): remove rows by marking them (`removed_at`), and put anything destructive in a file the
  owner runs by hand. Edge Functions: deploy with the connector after the same yes, or list them.

## Help and features

A feature is done only when it ships in both languages, with help entries in `src/help/en.js` +
`pt.js` (terms, ⓘ hints, guide steps), `<EmptyState>` for empty lists, and refreshed screenshots
if a guide's screen changed (see `GUIDES` in `src/help/index.js`). Help components:
`<HintLabel>`, `<Hint id>`, `<Term id>`, `<PageHelp page>`.

## Releases and git

- `main` deploys to production on merge. Work on a branch, open a PR, merge with squash.
- A shipping PR bumps `version` in `package.json` and adds a section at the top of
  `CHANGELOG.md` (plain language, same style as the previous entry).
- Commit message style: `<What changed> (<step>) — <version>`, with `(WIP)` for partial commits.
- Never commit `.env`, the `service_role` key or SMTP passwords.

## How to work

- **Stay in scope:** change only the lines the task needs. List other improvements you spot in
  the final summary instead of making them.
- **Simplest thing that works:** add abstractions, options or new packages only when the task
  asks for them. Propose a new dependency and wait for a yes before installing it.
- **Ask when a request has two reasonable readings**; otherwise proceed and state your
  assumption. Say plainly when you're unsure of a technical detail.
- **Get an explicit yes in the current message before:** merging to `main` (it deploys), changing
  the database schema (outline the migration first), deleting files or data, or rewriting
  existing user-facing text.
- One feature or fix per session. Big plans live in `docs/` and `ROADMAP.md`; read only the one
  the task needs.
- **Finish with a short summary:** files changed, what changed in each, and anything left for
  the owner. Use plain language; the owner is not a full-time developer.

## A session, start to finish

Each feature set is built in its own session, from its prompt in `docs/SESSION_PROMPTS.md`.
1. **Start:** `git fetch origin main` and branch from it (one branch per session). Read the
   step's row in `ROADMAP.md` and the doc section it names; grep the code it touches. Check
   `docs/PENDING.md` section 3 for decisions about it.
2. **Before building:** ask the owner the prompt's open questions and outline the migration; wait
   for a yes.
3. **Build** in small commits (`(WIP)`), pushing as you go: the container can reset.
4. **Connect** what the ROADMAP row lists under "Connect"; say in the PR what was connected (or
   why nothing was).
5. **Finish:** `npm run check` (and the e2e tests if screens changed); a browser check at 320 and
   390 px in both languages for new screens; help guide and screenshots; CHANGELOG section and
   version bump; mark the step built in `ROADMAP.md` and replace its plan with a "How … works"
   section in its doc; a test line in `docs/PENDING.md` section 2 and new questions in section 3.
   Open the PR (never merge it: the owner does) and give the short summary below.

## Standing rules from the owner

- **No Rentman integration:** file import only. The mock Rentman account holds the owner's real
  email and phone; never copy them into the repo. Don't hard-code the owner's email anywhere.
- **Hard deletions** go behind the serious two-step warning (`DangerConfirm`); everything else is
  removed by marking it.
- No model names in commits, PRs or code.
- Truss load tables are only ever the manufacturers' published data; a table is used only after a
  second person has checked it (docs/TRUSS_DATA.md). Rigging and power results are labelled as aids
  that a competent person must check.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for RenaissanceApe/AVX-beta. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
