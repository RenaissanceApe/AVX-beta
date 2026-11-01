# Backups and restore

Contents:
[What is backed up](#what-is-backed-up) ·
[Turn it on](#turn-it-on-once) ·
[Before your first drill](#before-your-first-drill) ·
[Restore drill](#restore-drill) ·
[Doing it for real](#doing-it-for-real) ·
[If the live site is down](#if-the-live-site-is-down) ·
[Drill log](#drill-log)

The **Database backup** workflow (`.github/workflows/backup.yml`) runs every night at 03:23 UTC
and keeps 30 days of encrypted backups as GitHub Actions artifacts (GitHub → Actions →
*Database backup* → a run → *Artifacts*). Each one is encrypted with your `BACKUP_PASSPHRASE`;
the repository is public, so anyone can download the file, but only that passphrase opens it.

## What is backed up

| Thing | Backed up? | Where it comes back from |
|---|---|---|
| Database: organisations, gigs, crew, schedules, quotes, inventory, messages, tasks… (`public` and `private` schemas) | ✅ every night | The backup |
| User accounts: email, password, two-step sign-in (`auth` schema) | ✅ every night | The backup. Passwords and authenticator codes keep working; everyone has to sign in again |
| File records (which file belongs to which gig) | ✅ every night | The backup |
| Uploaded gig files (`gig-assets`) | ⚠️ **only once you add the `SUPABASE_SERVICE_ROLE_KEY` secret**, which isn't set today | The `avx-files-….tar.gz.gpg` in the same artifact |
| Message attachments, repair photos, certificate proofs, rehearsal photos (the other 4 storage buckets) | ❌ never | Lost. They're empty or near-empty today; see "Gaps" below |
| Database structure (tables, access rules, scheduled jobs, storage buckets) | ✅ in git (`supabase/migrations/`) | Re-run the migrations |
| Edge Function code | ✅ in git (`supabase/functions/`) | Redeploy |
| Edge Function secrets (`BREVO_API_KEY`, `DIGEST_FROM`, `DIGEST_SECRET`, `LOCATIONIQ_KEY`, `APP_URL`) | ❌ | Your password manager (see "Before your first drill") |
| Push notification keys, nightly job key | ✅ in the database backup (`push_keys`, `job_keys`) | The backup |
| Supabase settings: sign-in URLs, SMTP sender, email templates, two-step sign-in switch | ❌ (templates ✅ in `supabase/templates/`) | Set again by hand, following [SETUP.md](../SETUP.md) step 3 |
| Vercel settings: environment variables, domain | ❌ | Vercel keeps them; nothing is lost unless the Vercel project is deleted |
| GitHub secrets (`SUPABASE_DB_URL`, `BACKUP_PASSPHRASE`, `DIGEST_SECRET`, …) | ❌ GitHub never shows them again | Your password manager |

### Things that would stop a restore working

These were found when this page was rewritten (2026-11-01). The steps below already work around
the ones marked *handled*.

1. **The old restore command didn't work on Supabase.** It restored everything, including the
   `auth` and `storage` schemas, over what a new Supabase project already has, and without the
   access grants (the dump is made with `--no-privileges`). *Handled:* the drill builds the
   structure from the migrations and loads only the data from the backup.
2. **Turning on file backups would have deleted the database backup.** The workflow fetched the
   code (`actions/checkout`) after making the database dump, and that step empties the folder
   first. With the files secret set, each night's artifact would have held only the files.
   *Fixed* in 0.63.11 by fetching the code first. It never affected the backups made so far,
   because the files secret has never been set.
3. **Free plan: two projects only.** You already have production and the test project, so a
   third (the drill project) can't be created until you pause one. *Handled* in step 1.
4. **The backup holds links back to production.** `job_keys` and `push_keys` store the
   production Edge Function addresses, so a restored copy could call production at night.
   *Handled* in step 7 (drill) and step 4 of "Doing it for real".
5. **Two tables get a starter row from the migrations** (`job_keys`, `send_settings`), which
   clashes with the backup's own row. *Handled* in step 5.
6. **The code and the backup must match.** Restore a backup with the migrations from the same
   day (the commit shown on the backup run). If a migration was merged after the backup, the
   data may not fit. *Handled* in step 2.
7. **Tools.** You need Postgres tools version **17 or newer** (production runs Postgres 17.6),
   `gpg`, `git` and Node 22. See "Before your first drill".
8. **Database passwords with symbols** (`@`, `#`, `/`, `?`, `%`) break the connection string.
   Use only letters and numbers for the drill project's password.

### Gaps (not fixed here)

- Only the `gig-assets` bucket is in the file backup. Message attachments, repair photos,
  certificate proofs and rehearsal photos are not. Extending `scripts/backup-storage.mjs` to all
  five buckets is a small follow-up.
- Backups live only in GitHub, for 30 days. Download one a month and keep it somewhere else (an
  external drive, your own cloud storage): it's already encrypted.
- GitHub turns off scheduled workflows in a public repository after 60 days without a commit.
  If you take a long break, check Actions → *Database backup* still runs (GitHub emails you
  before it switches it off; one click turns it back on).

## Turn it on (once)

1. Supabase → **Connect** → *Session pooler* → copy the URI and put your database password in it.
2. GitHub → repo **Settings → Secrets and variables → Actions → New repository secret**:
   - `SUPABASE_DB_URL` = that URI
   - `BACKUP_PASSPHRASE` = a long random passphrase (also save it in your password manager:
     without it the backups can't be opened)
   - `SUPABASE_SERVICE_ROLE_KEY` (for uploaded files) = Supabase → Settings → API keys → `service_role`.
     This key bypasses all access rules: only ever store it as a GitHub secret.
3. Actions → *Database backup* → **Run workflow** to check it works. With the files secret set,
   the artifact holds **two** files: `avx-db-….dump.gpg` and `avx-files-….tar.gz.gpg`.

## Before your first drill

Do these once. Tick them off in [PENDING.md](PENDING.md) (F9, F10).

1. **Passphrase in your password manager.** Open your password manager and check
   `BACKUP_PASSPHRASE` is there. If it isn't, make a new one, save it there first, then replace
   the GitHub secret (older backups stay locked with the old passphrase).
2. **Edge Function secrets in your password manager.** Supabase → Edge Functions → Secrets shows
   the names but not the values. Save `BREVO_API_KEY` (Brevo → SMTP & API → API keys; make a new
   one if you can't see the old), `DIGEST_FROM`, `DIGEST_SECRET` (also a GitHub secret),
   `LOCATIONIQ_KEY` (LocationIQ dashboard) and `APP_URL` if you set it.
3. **Turn on file backups:** add the `SUPABASE_SERVICE_ROLE_KEY` GitHub secret (see "Turn it on"),
   then Run workflow and check the artifact holds two files. Do this only after the 0.63.11 fix
   is merged.
4. **Install the tools on your computer** (Mac, in Terminal; with [Homebrew](https://brew.sh)):
   ```sh
   brew install libpq gnupg git node@22
   brew link --force libpq
   echo 'export PATH="$(brew --prefix node@22)/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
   pg_restore --version     # must say 17 or higher
   gpg --version
   node --version           # must say v22
   ```
   On Windows, do the drill inside WSL (Ubuntu) and install `postgresql-client-17`, `gnupg`,
   `git` and Node 22 there.
5. **Know which gig has a file.** Note one gig in production that has an uploaded file (Files
   tab), so you can check it after the restore.
6. **Set aside about 1½ hours** the first time.

## Restore drill

This restores last night's backup into a new, throwaway Supabase project and checks it. Nothing
here touches production. Commands go in Terminal; lines starting with `#` are notes. Replace
anything in `<angle brackets>`.

### 1. Make room and create the drill project

1. Supabase dashboard → the **test project** (`idvebeadnrxudfgortzg`) → Settings → General →
   **Pause project** (free plan allows two active projects). You'll restore it at the end.
2. **New project**: name `avx-restore-drill`, same region as production, and a database password
   of **letters and numbers only**. Save the password in your password manager for now.
3. When it's ready: **Connect** → *Session pooler* → copy the URI. Put your password in place of
   `[YOUR-PASSWORD]`. In Terminal:
   ```sh
   export DRILL_DB='<the URI with your password>'
   psql "$DRILL_DB" -c 'select version();'     # should print PostgreSQL 17…
   ```
4. Note the project's **reference** (the `xxxx` in `https://xxxx.supabase.co`, under Settings →
   General) and its **anon key** (Settings → API keys → `anon` / publishable).

### 2. Download the backup and matching code

1. GitHub → **Actions → Database backup**. Optional but best: **Run workflow** now, so the backup
   is minutes old (then the row counts in step 9 match exactly).
2. Open the newest green run. Note the **commit** it ran on (the short code next to the branch
   name, e.g. `0b3a691`). Under **Artifacts**, download the zip.
3. In Terminal:
   ```sh
   mkdir -p ~/avx-drill && cd ~/avx-drill
   mv ~/Downloads/avx-db-*.zip . && unzip avx-db-*.zip
   ls                                   # avx-db-….dump.gpg (and avx-files-….tar.gz.gpg if files are on)
   git clone https://github.com/RenaissanceApe/AVX-beta.git code
   git -C code checkout <commit from the run>
   ```

### 3. Decrypt

```sh
gpg --decrypt avx-db-*.dump.gpg > avx.dump          # asks for BACKUP_PASSPHRASE
pg_restore --list avx.dump | head -5                # prints a header: the file is readable
```

If gpg says "bad session key", the passphrase is wrong. If `pg_restore` says "unsupported version",
your Postgres tools are older than 17 (see "Before your first drill", step 4).

### 4. Build the empty structure from the migrations

```sh
for f in code/supabase/migrations/*.sql; do
  echo "== $f"
  psql "$DRILL_DB" -q -v ON_ERROR_STOP=1 -f "$f" || break
done
```

This runs every migration in filename order (a couple of minutes). It must reach the last file
with no `ERROR`. If it stops, copy the last `==` line and the error into a new Claude session
with "restore drill: migration fails on a fresh project" and stop here: that's a real finding.

### 5. Clear the two starter rows

The migrations put one starter row in two tables; the backup has its own. In Terminal:

```sh
psql "$DRILL_DB" -c 'delete from public.job_keys; delete from public.send_settings;'
```

(This is the throwaway project, so deleting here is fine.)

### 6. Load the data

Pick the data out of the backup (your app's tables, user accounts and two-step sign-in), turn it
into one SQL file, and load it in one go:

```sh
pg_restore --list avx.dump > everything.txt
grep -E ' TABLE DATA (public|private) | TABLE DATA auth (users|identities|mfa_factors) | SEQUENCE SET (public|private) ' everything.txt > pick.txt
wc -l pick.txt                                      # about 90–100 lines: one per table
pg_restore --data-only --use-list=pick.txt --file=data.sql avx.dump

psql "$DRILL_DB" -v ON_ERROR_STOP=1 --single-transaction \
  -c 'set session_replication_role = replica' -f data.sql
```

`session_replication_role = replica` stops the app's own triggers (notifications, activity log)
from firing while old rows go back in. `--single-transaction` means it either all loads or
nothing does: if you see `ERROR`, nothing was changed, so copy the error into a Claude session.

### 7. Cut the links back to production

The backup remembers production's Edge Function addresses. Point them at the drill project
(where no functions are deployed, so the calls go nowhere) and stop its nightly jobs:

```sh
psql "$DRILL_DB" <<'SQL'
update public.job_keys set function_url = null;
update public.push_keys set function_url = 'https://<drill ref>.supabase.co/functions/v1/send-push';
select cron.unschedule(jobid) from cron.job;
SQL
```

### 8. Put the files back (if the backup has them)

Skip this if there's no `avx-files-….tar.gz.gpg` (file backups not on yet). Then opening a file
in step 9 will fail: that's expected, and it's the reason to turn file backups on.

```sh
gpg --decrypt avx-files-*.tar.gz.gpg > files.tar.gz
mkdir files && tar -xzf files.tar.gz -C files
ls files                                            # one folder per gig id
```

Supabase (drill project) → **Storage → gig-assets** → drag each folder from `~/avx-drill/files`
into the bucket, keeping the folder names. The bucket must end up with `<gig-id>/<file>`, the same
as production.

### 9. Check it worked

**a. Row counts.** Run this in the SQL editor of **production** and of the **drill project**
(Supabase → SQL Editor → New query → paste → Run). It only reads.

```sql
select table_schema || '.' || table_name as "table",
       (xpath('/row/n/text()', query_to_xml(
          format('select count(*) as n from %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint as "rows"
from information_schema.tables
where table_type = 'BASE TABLE'
  and (table_schema in ('public', 'private')
       or (table_schema = 'auth' and table_name in ('users', 'identities', 'mfa_factors')))
order by 1;
```

Use **Export → CSV** (or copy) for both and compare. Pass: every table has the same number, or a
few more in production for things people did since the backup (`notifications`, `messages`,
`private.usage_daily`). Fail: a table that has rows in production and 0 in the drill.

**b. Run the app against the drill project** (on your computer, production untouched):

```sh
cd ~/avx-drill/code
npm ci
cat > .env.local <<EOF
VITE_SUPABASE_URL=https://<drill ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<drill anon key>
EOF
npm run dev
```

`.env.local` overrides `.env` and is never committed. Open http://localhost:5173.

**c. Sign in** with your own email and **password** (not the magic link: the drill project has
no email sender). If you have two-step sign-in on, your authenticator app's code must work too.
Pass: you land on your dashboard and see your organisation.

**d. Open a gig.** Open the gig you noted in "Before your first drill" step 5. Check its date,
crew, schedule and equipment look like production. Open the **Files** tab and open the file.
Pass: it opens. (Without file backups, the file is listed but won't open.)

**e. Spot checks.** Quotes list, Inventory → Catalogue, Messages: same items as production.

Things that will **not** work in the drill, and that's fine: sending invites or quotes by email,
push notifications, address lookup, the daily summary (no Edge Functions or secrets there).

### 10. Clean up

1. Stop the app (Ctrl+C in Terminal).
2. Delete the decrypted copies (they hold everyone's data and password hashes):
   ```sh
   cd ~ && rm -rf ~/avx-drill
   ```
3. Supabase → `avx-restore-drill` → Settings → General → **Delete project**.
4. Supabase → test project → **Restore project** (un-pause).
5. Add a line to the [Drill log](#drill-log) below: date, backup used, time taken, what failed.

Repeat the drill every 3 months, and after any big change to the database.

## Doing it for real

Only when production's data is gone or damaged and Supabase can't recover it (see
[If the live site is down](#if-the-live-site-is-down) first). It's the drill, plus re-connecting
everything. Expect about 2–3 hours; the app is down meanwhile.

1. Tell your users the app is down and you're restoring (and from which day: anything after the
   backup is lost).
2. Do drill steps 1–6 with a project named `avx-production-2` (pause or delete the broken one
   if you're out of free projects; on Pro there's no limit). Use the newest good backup.
3. Do drill step 8 (files). Skip step 7's `cron.unschedule`: the nightly jobs should run.
4. Point the jobs at the **new** project:
   ```sh
   psql "$NEW_DB" <<'SQL'
   update public.job_keys set function_url = 'https://<new ref>.supabase.co/functions/v1/message-retention' where name = 'message_retention';
   update public.push_keys set function_url = 'https://<new ref>.supabase.co/functions/v1/send-push';
   SQL
   ```
5. **Supabase settings** on the new project, from [SETUP.md](../SETUP.md) step 3: Site URL and
   redirect URLs, SMTP sender (Brevo), the four email templates in `supabase/templates/`,
   two-step sign-in on.
6. **Edge Functions:** deploy all of them from `supabase/functions/` (SETUP.md step 3b lists
   which have "Verify JWT" off) and set the secrets from your password manager
   (Edge Functions → Secrets).
7. **Point the app at it:** in the repo, change `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   in `.env` (and in Vercel → Settings → Environment Variables if they're set there), open a PR,
   merge. Vercel redeploys.
8. **GitHub secrets:** update `SUPABASE_DB_URL` (and `SUPABASE_SERVICE_ROLE_KEY`) to the new
   project, then Run workflow on *Database backup* to check backups work again.
9. Run the checks from drill step 9 against the live site, and send a test invite to yourself.

## If the live site is down

Work down the list; stop as soon as it's fixed. **Restoring a backup is the last step, not the
first**: it loses everything since last night.

1. **Is it just you?** Open the site on your phone with Wi-Fi off. Try a private window.
2. **Did a deploy just go out?** Vercel → the project → **Deployments**. If the newest
   production deployment is from just before it broke, open the previous one (marked *Ready*) →
   **⋯ → Instant Rollback** (or *Promote to Production*). It takes seconds and touches no data.
   While rolled back, Vercel stops putting new merges live; once the bad PR is reverted on
   GitHub and the new deployment is *Ready*, click **Undo Rollback** (or promote it).
3. **Is Supabase down?** Check [status.supabase.com](https://status.supabase.com) and your
   project's dashboard. If the project shows **Paused**, click **Restore project** (free projects
   pause after a week with no activity; the keep-alive workflow normally prevents this). If
   Supabase has an incident, wait: your data is safe, nothing to do.
4. **Is Vercel down?** Check [vercel-status.com](https://www.vercel-status.com). Wait it out.
5. **Is it a database change?** If a migration was applied just before, the error usually says
   `permission denied` or `column … does not exist`. Don't restore: open a Claude session with the
   error and the migration's name; the fix is a new migration.
6. **Signing in fails for everyone, but the site loads?** Supabase → Authentication → check the
   SMTP sender and URL settings weren't changed; Supabase → Logs → Auth for the error.
7. **Data is gone or wrong** (deleted by mistake, damaged): only now go to
   [Doing it for real](#doing-it-for-real). Restore into a **new** project, never over the live
   one. If only a few records are wrong, a Claude session can copy just those back from a drill
   project instead.

Write down what happened and when, for the users you tell and for next time.

## Drill log

| Date | Backup used | Time taken | Result / problems |
|---|---|---|---|
| | | | |
