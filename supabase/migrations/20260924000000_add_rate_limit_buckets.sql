-- Replaces the app's in-memory rate limiter (lib/rate-limit.ts) with a
-- Postgres-backed one.
--
-- Serverless functions on Vercel don't share process memory across
-- invocations/cold starts, so the old in-memory Map provided no real
-- protection in production: a distributed or slowly-paced script could
-- bypass the subscribe-form and management-link rate limits entirely and
-- mass-trigger transactional emails to arbitrary addresses. This table plus
-- the check_rate_limit() function give every serverless invocation a shared,
-- atomic counter to check against instead.

create table if not exists public.rate_limit_buckets (
  key text primary key,
  count integer not null default 0,
  reset_at timestamptz not null
);

alter table public.rate_limit_buckets enable row level security;
-- No policies: only the service-role client (used server-side by
-- lib/rate-limit.ts) touches this table, and service-role bypasses RLS.
-- Leaving RLS enabled with zero policies still blocks anon/authenticated
-- access outright, in case a key is ever misused client-side.

-- This project's default privileges grant anon/authenticated table access
-- on new public tables regardless of RLS status (RLS still blocks their
-- actual reads/writes here, since no policies exist) — revoke explicitly so
-- the table is service-role only in both layers, not just via RLS.
revoke all on public.rate_limit_buckets from anon, authenticated;

-- Atomically checks and increments a rate-limit bucket in one statement, so
-- concurrent requests can't race past the limit. Returns true if the request
-- is allowed, false if the caller is over the limit for the current window.
create or replace function public.check_rate_limit(p_key text, p_limit integer, p_window_ms integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_new_reset timestamptz := v_now + (p_window_ms || ' milliseconds')::interval;
  v_count integer;
begin
  insert into public.rate_limit_buckets (key, count, reset_at)
  values (p_key, 1, v_new_reset)
  on conflict (key) do update
    set count = case
                  when rate_limit_buckets.reset_at <= v_now then 1
                  else rate_limit_buckets.count + 1
                end,
        reset_at = case
                  when rate_limit_buckets.reset_at <= v_now then v_new_reset
                  else rate_limit_buckets.reset_at
                end
  returning count into v_count;

  return v_count <= p_limit;
end;
$$;

-- SECURITY DEFINER means this function runs with the privileges of its
-- owner regardless of caller, so an anon/authenticated grant here would let
-- any unauthenticated caller invoke it directly with arbitrary key/limit/
-- window arguments, poisoning or resetting rate-limit buckets for anyone.
-- Only the server-side service-role client (lib/rate-limit.ts) should ever
-- call it, and default privileges grant execute broadly, so revoke from
-- both PUBLIC and the specific client roles explicitly.
revoke all on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
