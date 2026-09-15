-- Allow public footer RLS policies to verify the current published Weekly Update.
-- Row Level Security on weekly_updates still restricts anon reads to status='published'
-- and is_current=true.
grant select on public.weekly_updates to anon;
