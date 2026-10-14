# Backups

The **Database backup** workflow (`.github/workflows/backup.yml`) runs daily and keeps 30 days
of encrypted dumps as GitHub Actions artifacts. It covers the database: organisations, gigs,
members, feed, file metadata and user accounts. **Uploaded files themselves are not included**.
Copy those from Supabase Storage if you need them (Phase 2: automate).

## Turn it on (once)

1. Supabase → **Connect** → *Session pooler* → copy the URI and put your database password in it.
2. GitHub → repo **Settings → Secrets and variables → Actions → New repository secret**:
   - `SUPABASE_DB_URL` = that URI
   - `BACKUP_PASSPHRASE` = a long random passphrase (also save it in your password manager —
     without it the backups can't be opened)
3. Actions → *Database backup* → **Run workflow** to check it works.

## Restore

1. Actions → *Database backup* → pick a run → download the artifact (a zip containing `avx-db-….dump.gpg`).
2. Decrypt: `gpg --decrypt avx-db-….dump.gpg > avx.dump` (asks for the passphrase).
3. Restore into a **new** Supabase project (never over the live one without a plan):
   `pg_restore --no-owner --no-privileges --clean --if-exists -d "<new project connection string>" avx.dump`

Restoring the `auth` and `storage` schemas into a fresh project can clash with what Supabase
creates there. If it does, restore app data first with `--schema=public --schema=private`
and have users reset their passwords.
