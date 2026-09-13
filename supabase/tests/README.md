# Supabase database tests

Run these tests only against the local Supabase database:

```bash
npx.cmd supabase test db --local supabase/tests
```

The Points of Agreement guide test uses disposable local UUIDs and rows, then
cleans up its own data. It must not be run against the linked/remote project.
