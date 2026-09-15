-- Supabase-owned email subscribers, preferences, consent history, and access tokens.

create table if not exists public.email_subscribers (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  email text not null,
  normalized_email text not null,
  status text not null default 'pending',
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  suppressed_at timestamptz,
  sender_contact_id text,
  sender_sync_status text not null default 'not_configured',
  sender_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_subscribers_first_name_check check (length(trim(first_name)) between 1 and 120),
  constraint email_subscribers_email_check check (length(trim(email)) between 3 and 320),
  constraint email_subscribers_normalized_email_check check (normalized_email = lower(trim(email)) and normalized_email like '%@%'),
  constraint email_subscribers_status_check check (status in ('pending', 'confirmed', 'unsubscribed', 'suppressed')),
  constraint email_subscribers_sender_sync_status_check check (sender_sync_status in ('not_configured', 'pending', 'synced', 'failed')),
  constraint email_subscribers_confirmed_status_check check (status <> 'confirmed' or confirmed_at is not null),
  constraint email_subscribers_unsubscribed_status_check check (status <> 'unsubscribed' or unsubscribed_at is not null),
  constraint email_subscribers_suppressed_status_check check (status <> 'suppressed' or suppressed_at is not null)
);

create unique index if not exists email_subscribers_normalized_email_idx
  on public.email_subscribers (normalized_email);

drop trigger if exists email_subscribers_set_updated_at on public.email_subscribers;
create trigger email_subscribers_set_updated_at
before update on public.email_subscribers
for each row execute function public.set_updated_at();

create table if not exists public.email_subscription_preferences (
  subscriber_id uuid not null references public.email_subscribers(id) on delete cascade,
  category text not null,
  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  confirmed_at timestamptz,
  disabled_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (subscriber_id, category),
  constraint email_subscription_preferences_category_check check (category in ('weekly_updates', 'teachings', 'devotionals')),
  constraint email_subscription_preferences_status_check check (status in ('pending', 'active', 'disabled')),
  constraint email_subscription_preferences_active_check check (status <> 'active' or confirmed_at is not null),
  constraint email_subscription_preferences_disabled_check check (status <> 'disabled' or disabled_at is not null)
);

create index if not exists email_subscription_preferences_category_status_idx
  on public.email_subscription_preferences (category, status);

drop trigger if exists email_subscription_preferences_set_updated_at on public.email_subscription_preferences;
create trigger email_subscription_preferences_set_updated_at
before update on public.email_subscription_preferences
for each row execute function public.set_updated_at();

create table if not exists public.email_consent_events (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.email_subscribers(id) on delete cascade,
  event_type text not null,
  categories text[] not null default '{}',
  first_name text,
  normalized_email text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint email_consent_events_type_check check (event_type in ('subscription_requested', 'double_opt_in_confirmed', 'preference_management_requested', 'preference_changed', 'unsubscribed', 'resubscribed'))
);

create index if not exists email_consent_events_subscriber_created_idx
  on public.email_consent_events (subscriber_id, created_at desc);

create table if not exists public.email_access_tokens (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.email_subscribers(id) on delete cascade,
  token_type text not null,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint email_access_tokens_type_check check (token_type in ('confirmation', 'management')),
  constraint email_access_tokens_hash_check check (length(token_hash) = 64 and token_hash ~ '^[0-9a-f]+$'),
  constraint email_access_tokens_expires_check check (expires_at > created_at)
);

create unique index if not exists email_access_tokens_token_hash_idx
  on public.email_access_tokens (token_hash);
create index if not exists email_access_tokens_subscriber_type_idx
  on public.email_access_tokens (subscriber_id, token_type, expires_at desc);

create table if not exists public.email_delivery_events (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.email_subscribers(id) on delete cascade,
  provider text not null default 'sender',
  message_type text not null,
  status text not null default 'pending_configuration',
  provider_message_id text,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint email_delivery_events_provider_check check (provider in ('sender')),
  constraint email_delivery_events_message_type_check check (message_type in ('confirmation', 'management', 'preference_sync')),
  constraint email_delivery_events_status_check check (status in ('pending_configuration', 'queued', 'sent', 'failed'))
);

create index if not exists email_delivery_events_subscriber_created_idx
  on public.email_delivery_events (subscriber_id, created_at desc);

alter table public.email_subscribers enable row level security;
alter table public.email_subscription_preferences enable row level security;
alter table public.email_consent_events enable row level security;
alter table public.email_access_tokens enable row level security;
alter table public.email_delivery_events enable row level security;

drop policy if exists "Admins manage email subscribers" on public.email_subscribers;
create policy "Admins manage email subscribers"
on public.email_subscribers
for all
using (public.is_authenticated_admin())
with check (public.is_authenticated_admin());

drop policy if exists "Admins manage email subscription preferences" on public.email_subscription_preferences;
create policy "Admins manage email subscription preferences"
on public.email_subscription_preferences
for all
using (public.is_authenticated_admin())
with check (public.is_authenticated_admin());

drop policy if exists "Admins read email consent events" on public.email_consent_events;
create policy "Admins read email consent events"
on public.email_consent_events
for select
using (public.is_authenticated_admin());

drop policy if exists "Admins read email access tokens" on public.email_access_tokens;
create policy "Admins read email access tokens"
on public.email_access_tokens
for select
using (public.is_authenticated_admin());

drop policy if exists "Admins read email delivery events" on public.email_delivery_events;
create policy "Admins read email delivery events"
on public.email_delivery_events
for select
using (public.is_authenticated_admin());

grant select, insert, update, delete on public.email_subscribers to authenticated;
grant select, insert, update, delete on public.email_subscription_preferences to authenticated;
grant select on public.email_consent_events to authenticated;
grant select on public.email_access_tokens to authenticated;
grant select on public.email_delivery_events to authenticated;
