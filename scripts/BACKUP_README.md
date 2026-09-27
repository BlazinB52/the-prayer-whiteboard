# Supabase Backup & Restore

Protects against Supabase and/or Vercel becoming unavailable — a full copy
of all site content (teachings, devotionals, everything) and every Storage
file, saved to your D: drive.

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
`20260927_supabase`), or `20260927_supabase_2`, `_3`, etc. if you run it
again the same day — nothing is ever overwritten. Pass a different
destination as an argument if you'd rather save elsewhere:

```powershell
node --env-file=.env.local scripts/backup-supabase.mjs "D:\SomewhereElse"
```

Each backup folder contains:

- `schema.sql` / `data.sql` — everything in the database's `public` schema:
  every teaching, devotional, weekly update, subscriber, etc. — both
  structure and actual data
- `buckets.json` — Storage bucket configuration (public/private, size
  limits, allowed file types)
- `storage-content-types.json` — each file's real content type, so a
  restored PDF/image comes back correctly typed
- `storage/` — every actual file from every Storage bucket
  (chalkboards, printable-pdfs, weekly-update-documents)
- `manifest.json` — a summary of what was captured and when

**Admin login (Supabase Auth) is deliberately NOT included.** Restoring it
needs internal Supabase roles that only a real Supabase project sets up
correctly — see the comment at the top of `backup-supabase.mjs` for the
full reasoning. There are only 1-2 admin accounts, so recreating one via
normal sign-up after a disaster is trivial.

## Restoring (only if Supabase and/or Vercel are gone for good)

1. Create a brand new Supabase project.
2. From its dashboard, get: the Postgres connection string, the project API
   URL, and the service-role/secret key.
3. From `C:\Users\bwill\Projects\PrayerWhiteboard`, in PowerShell:

```powershell
$env:RESTORE_DB_URL = "<new project's connection string>"
$env:RESTORE_SUPABASE_URL = "<new project's API URL>"
$env:RESTORE_SUPABASE_KEY = "<new project's service-role key>"
node scripts/restore-supabase.mjs "D:\SupabaseBackups\20260927_supabase"
```

(Use the actual dated folder you want to restore from.)

4. Recreate your admin login on the new project via its normal sign-up
   flow.
5. Point the deployed site (Vercel environment variables) at the new
   project's URL and keys, and redeploy.

This whole process was tested end-to-end before being put in place: a test
teaching and test files were backed up, the database was wiped down to
empty, and everything was restored successfully with byte-identical
content and correct file types.

## Automating it (optional)

This can be added as a Windows Task Scheduler task to run automatically
(e.g. daily), the same way your existing local backup routine works. Ask
Claude to set this up if you want it — it wasn't done automatically since
you may want to control exactly when/how often it runs.
