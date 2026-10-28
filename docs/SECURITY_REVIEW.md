# Security review (OWASP Top 10)

A whole-app pass on 2026-10-28 (0.62.1), against the production database, the edge functions and
the app's code. Each feature also has its own database checks in `supabase/tests/`; this review
looks at the whole app at once. It was done with automated searches plus reading the risky parts,
not a penetration test. Repeat it before AVX opens beyond invited pilot companies, and after any
large change to sign-in, sharing links or the edge functions.

## Result

No exploitable problem found. One setting to turn on, three dependency updates made, and a few
low-risk items to keep an eye on.

| # | Area | What was checked | Finding |
|---|---|---|---|
| A01 | Broken access control | Row-level security on every table; every function that runs with elevated rights; storage buckets; links that work without signing in | All 83 tables have row-level security; 5 have no rules on purpose (server only: import undo records, job and push keys, maintenance reminders). All 103 elevated functions check the caller: two-step sign-in, then a membership or role check (`private.is_org_member`, `can_manage_gig`…), the caller's own id, an AVX-admin check, or a link token. All 5 storage buckets are private with rules. Guest links (`guest_thread`, `guest_post`) resolve a token on the server, cap the text and allow 20 messages an hour per conversation. **OK** |
| A02 | Cryptographic failures | Tokens and secrets at rest | Quote and supplier link tokens are stored only as SHA-256 hashes. The calendar link key (244 random bits) is stored as is, because the app shows it again; acceptable, since only the server can read that table. Edge-function job secrets are compared in constant time. **OK** |
| A03 | Injection | SQL built from strings; raw HTML; links from user data | No SQL built from text (all through PostgREST or parameters). The only raw HTML is the QR code SVG the app draws itself. Every link from user data (messages, custom fields, crew profile links) is limited to http(s), in the app and in the database. **OK** |
| A04 | Insecure design | Limits on things that can be abused | Daily limits on crew searches, new contacts, job applications, VAT checks; 20 messages a minute per person; the place search waits a second between requests. **OK** |
| A05 | Security misconfiguration | Headers, CORS, buckets | Strict content security policy, no framing, no sniffing, referrer and permissions policies (`vercel.json`). Edge functions only answer the app's own origins. Buckets limit file size; photo buckets limit file types. **OK** |
| A06 | Vulnerable components | `npm audit` | Updated `ws`, `@remix-run/router` and `fflate` (none was reachable: no redirects taken from the address, `ws` runs only in Node, `fflate` could only hang the tab of someone opening a broken spreadsheet). Left: React Router 6's open-redirect advisory (fixed only in v7; not reachable, as nothing navigates to a path taken from the address), and advisories in build and test tools (Vite, Vitest), which never reach users. **Follow-up:** move to React Router 7 and current Vite and Vitest in a separate change |
| A07 | Identification and authentication failures | Sign-in answers, sessions, passwords | Wrong password and unknown email give the same message; password reset and sign-in links answer the same whether or not the email exists; a broken session goes back to sign-in; 8-character minimum; two-step sign-in enforced by the database. All covered by `e2e/auth/failures.spec.js`. **To do (you):** turn on leaked-password protection in Supabase (the only warning in its security check) |
| A08 | Software and data integrity | Imports, service worker | Imports go through the same database rules as typing; the service worker caches only the app's own files. **OK** |
| A09 | Logging and monitoring | What is logged | Error reports carry an internal id, never contents or IP; edge-function logs carry counts only; reports and moderation decisions are kept. **OK** |
| A10 | Server-side request forgery | Edge functions that fetch | The place search calls a fixed host with the text encoded and the language checked; the VAT check calls the EU's VIES only. **OK** |

## Still to do

1. **Leaked-password protection:** Supabase → Authentication → sign-in settings → turn on
   "Prevent use of leaked passwords" (production; it may need a paid plan).
2. **React Router 7, current Vite and Vitest:** one upgrade change, with the browser tests.
3. **Data map open items** (docs/DATA_MAP.md): a processing agreement for organisations; trimming
   the crew-search log and old notifications.
4. **Signing up with an email that already has an account:** with email confirmation on (as
   production should have it), Supabase answers as if it were new, so it doesn't reveal the account. The test project signs people in at once, so the browser tests can't
   cover it; check it by hand once (docs/PENDING.md).
