# Supabase Backup & Restore

Protects against Supabase and/or Vercel becoming unavailable — a full copy
of all site content (teachings, devotionals, everything), the login accounts,
the file-access rules and every Storage file, saved to your D: drive.

A copy of this file also lives at `D:\SupabaseBackups\README.md`, so the
instructions are physically next to the backups themselves.

## Prerequisites (one-time)

- This repo checked out at `C:\Users\bwill\Projects\PrayerWhiteboard`
- `npm install` run at least once inside that folder
- `.env.local` present in that folder with `NEXT_PUBLIC_SUPABASE_URL` and
  `SUPABASE_SECRET_KEY` (already there if you've used the site's admin
  tools/scripts before)
- Logged into the Supabase CLI (already true if `npx supabase` commands
  work from that folder — this is how the CLI authenticates as you, no
  separate login step needed)

## Running a backup

From `C:\Users\bwill\Projects\PrayerWhiteboard`, in PowerShell:

```powershell
node --env-file=.env.local scripts/backup-supabase.mjs
```

This creates a new dated folder under `D:\SupabaseBackups\` (e.g.
`20261018_supabase`), or `20261018_supabase_2`, `_3`, etc. if you run it
again the same day — nothing is ever overwritten. Pass a different
destination as an argument if you'd rather save elsewhere:

```powershell
node --env-file=.env.local scripts/backup-supabase.mjs "D:\SomewhereElse"
```

Each backup folder contains:

- `schema.sql` / `data.sql` — everything in the database's `public` schema:
  every teaching, devotional, weekly update, subscriber, etc. — both
  structure and actual data
- `auth-data.sql` — the login accounts (emails, password hashes, user ids).
  **Keep this folder private.**
- `storage-policies.sql` — the rules on `storage.objects` that let a signed-in
  admin or content manager upload, replace and delete files. They live outside
  the `public` schema, so `schema.sql` does not hold them.
- `buckets.json` — Storage bucket configuration (public/private, size
  limits, allowed file types)
- `storage-content-types.json` — each file's real content type, so a
  restored PDF/image comes back correctly typed
- `storage/` — every actual file from every Storage bucket (chalkboards,
  printable-pdfs, weekly-update-documents, authority-photos, teaching-outlines)
- `manifest.json` — a summary of what was captured and when
- `RESTORE.md` — these restore steps, kept next to the files

## Restoring (only if Supabase and/or Vercel are gone for good)

1. Create a brand new Supabase project.
2. From its dashboard, get: the Postgres connection string, the project API
   URL, and the service-role/secret key.
3. From `C:\Users\bwill\Projects\PrayerWhiteboard`, in PowerShell:

```powershell
$env:RESTORE_DB_URL = "<new project's connection string>"
$env:RESTORE_SUPABASE_URL = "<new project's API URL>"
$env:RESTORE_SUPABASE_KEY = "<new project's service-role key>"
$env:RESTORE_AUTH = "1"     # also bring back the login accounts
node scripts/restore-supabase.mjs "D:\SupabaseBackups\20261018_supabase"
```

(Use the actual dated folder you want to restore from.)

What the script does, in order: sets the new project's default table access to
what the backup says it was (a fresh project is far more open than this site),
loads `schema.sql`, resets each table's access to match the live site exactly,
loads `storage-policies.sql`, loads `auth-data.sql` (only with `RESTORE_AUTH=1`),
loads `data.sql`, then recreates the buckets and uploads every file.

4. Without `RESTORE_AUTH=1` the logins are not restored: sign the admin up again
   in the new project and re-grant access. With it, the same accounts, passwords
   and user ids come back, so every admin permission still matches its login.
5. Point the deployed site (Vercel environment variables) at the new
   project's URL and keys, and redeploy. The keys are in `.env.local`, which the
   file backup (`PrayerWhiteboard_Backup.bat`) also copies.

A backup made before 2026-10-18 has no `storage-policies.sql`. Restoring one still
works and prints a warning: files show, but admin uploads and deletes are refused
until the storage rules (defined in `supabase/migrations`) are recreated.

## Proof that it works (rehearsal on 2026-10-18)

The restore was rehearsed into a throwaway local Supabase that had been emptied to
look like a brand-new project, from a backup of the live site made that morning:

- all 44 tables came back with identical row counts, and Day 7 of the current
  devotional matched live on every field
- tables, functions, triggers, constraints, indexes and the 87 table security
  policies matched live; so did all 650 table access grants, one for one
- all 8 storage rules came back, and a restored admin could upload and delete in each
  bucket while a stranger was refused
- all 90 files came back byte for byte identical, with the right content types
- the 4 login accounts came back with their password hashes, and every admin
  permission row matched a login

That rehearsal found and fixed three gaps in the older restore script: it never
loaded the login accounts, it left tables more open than the live site, and the
backup did not contain the storage rules. Repeat the rehearsal after any big change
to the database.

## Rehearsing a restore (local, nothing live is touched)

1. Temporarily change the ports in `supabase/config.toml` (Windows reserves
   54320–54419; use 15420–15429), then `npx supabase start`.
2. Empty the local copy so it looks like a new project: drop and recreate the
   `public` schema, delete the rows in `auth.*`, and delete the local buckets.
3. Point the three `RESTORE_*` variables at `127.0.0.1` (database port 15422, API
   `http://127.0.0.1:15421`, the local service-role key from `npx supabase status`)
   and run the restore as above.
4. Compare with the live site, then `npx supabase stop` and `git checkout supabase/config.toml`.

## Automating it (optional)

This can be added as a Windows Task Scheduler task to run automatically
(e.g. daily), the same way your existing local backup routine works. Ask
Claude to set this up if you want it — it wasn't done automatically since
you may want to control exactly when/how often it runs. Backups on D: protect
against Supabase failing, not against losing the computer: copy a recent one
somewhere else too, and encrypt it first because `auth-data.sql` holds password hashes.
