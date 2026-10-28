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
  - `docs/*.md` and `ROADMAP.md`: open one only when the task is about that area
    (e.g. `docs/QUOTES.md` for quotes); use grep to find the relevant section
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
docs/               design notes per feature area; docs/PENDING.md = things waiting on the owner
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
- You can't apply migrations or deploy functions from here. List them for the owner and add the
  step to `docs/PENDING.md` if it's waiting on them.

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

## Working style for the owner

- Keep each session to one feature or fix. Big plans live in `docs/` and `ROADMAP.md`. Read the
  relevant one, don't summarise all of them.
- Explain results in plain language; the owner is not a full-time developer.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for RenaissanceApe/AVX-beta. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
