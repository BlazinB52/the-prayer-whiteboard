begin;

select plan(15);

create temp table email_subscription_test_ids (
  key text primary key,
  id uuid not null
) on commit drop;

insert into email_subscription_test_ids (key, id)
values
  ('admin_user', '00000000-0000-4000-a000-000000000501'),
  ('regular_user', '00000000-0000-4000-a000-000000000503'),
  ('admin_auth', '00000000-0000-4000-a000-000000000502'),
  ('subscriber', '00000000-0000-4000-a000-000000000511'),
  ('legacy_subscriber', '00000000-0000-4000-a000-000000000512'),
  ('service_subscriber', '00000000-0000-4000-a000-000000000513');

grant select on email_subscription_test_ids to anon, authenticated, service_role;

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at
)
select
  '00000000-0000-0000-0000-000000000000',
  id,
  'authenticated',
  'authenticated',
  key || '@email-subscriptions.local',
  'local-regression-placeholder',
  now(),
  now(),
  now()
from email_subscription_test_ids
where key in ('admin_user', 'regular_user');

insert into public.admin_authorizations (id, user_id, role, is_active)
values (
  (select id from email_subscription_test_ids where key = 'admin_auth'),
  (select id from email_subscription_test_ids where key = 'admin_user'),
  'admin',
  true
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select is(
  (select count(*) from public.email_subscribers),
  0::bigint,
  'anonymous users cannot read subscriber rows'
);

select throws_ok(
  $$ insert into public.email_subscribers (first_name, email, normalized_email, status) values ('Public', 'public@example.test', 'public@example.test', 'pending') $$,
  '42501',
  null,
  'anonymous users cannot create subscribers directly'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from email_subscription_test_ids where key = 'admin_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.email_subscribers (id, first_name, email, normalized_email, status)
values ((select id from email_subscription_test_ids where key = 'subscriber'), 'Ada', 'Ada@Example.test', 'ada@example.test', 'pending');

select is(
  (select count(*) from public.email_subscribers),
  1::bigint,
  'authorized administrators can read subscribers'
);

insert into public.email_subscription_preferences (subscriber_id, category, status, disabled_at)
values
  ((select id from email_subscription_test_ids where key = 'subscriber'), 'weekly_updates', 'pending', null),
  ((select id from email_subscription_test_ids where key = 'subscriber'), 'teachings', 'disabled', now());

select is(
  (select count(*) from public.email_subscription_preferences where subscriber_id = (select id from email_subscription_test_ids where key = 'subscriber')),
  2::bigint,
  'subscriber preferences store separate category choices'
);

insert into public.email_subscribers (id, first_name, email, normalized_email, status, sender_sync_status)
values ((select id from email_subscription_test_ids where key = 'legacy_subscriber'), 'Legacy', 'legacy@example.test', 'legacy@example.test', 'confirmed', 'synced');

insert into public.email_subscription_preferences (subscriber_id, category, status, confirmed_at, disabled_at)
values
  ((select id from email_subscription_test_ids where key = 'legacy_subscriber'), 'weekly_updates', 'disabled', null, now()),
  ((select id from email_subscription_test_ids where key = 'legacy_subscriber'), 'teachings', 'disabled', null, now()),
  ((select id from email_subscription_test_ids where key = 'legacy_subscriber'), 'devotionals', 'active', null, null);

select ok(
  exists (
    select 1
    from public.email_subscribers subscriber
    join public.email_subscription_preferences preference on preference.subscriber_id = subscriber.id
    where subscriber.id = (select id from email_subscription_test_ids where key = 'legacy_subscriber')
      and subscriber.status = 'confirmed'
      and subscriber.confirmed_at is null
      and preference.category = 'devotionals'
      and preference.status = 'active'
      and preference.confirmed_at is null
  ),
  'legacy confirmed devotional subscribers may be preserved without inventing a confirmation timestamp'
);

reset role;

insert into public.email_consent_events (subscriber_id, event_type, categories, first_name, normalized_email, metadata)
values (
  (select id from email_subscription_test_ids where key = 'legacy_subscriber'),
  'legacy_devotional_imported',
  array['devotionals']::text[],
  'Legacy',
  'legacy@example.test',
  '{"source":"sender.net","source_form":"existing devotional double opt-in form","confirmation_timestamp_available":false}'::jsonb
);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from email_subscription_test_ids where key = 'admin_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select metadata->>'source_form' from public.email_consent_events where subscriber_id = (select id from email_subscription_test_ids where key = 'legacy_subscriber') and event_type = 'legacy_devotional_imported'),
  'existing devotional double opt-in form',
  'legacy import records consent source'
);

select throws_ok(
  $$ insert into public.email_subscription_preferences (subscriber_id, category, status) values ((select id from email_subscription_test_ids where key = 'subscriber'), 'events', 'pending') $$,
  '23514',
  null,
  'preference categories are constrained'
);

select throws_ok(
  $$ insert into public.email_subscribers (first_name, email, normalized_email, status) values ('Duplicate', 'ADA@example.test', 'ada@example.test', 'pending') $$,
  '23505',
  null,
  'normalized email addresses are unique'
);

reset role;

insert into public.email_access_tokens (subscriber_id, token_type, token_hash, expires_at)
values ((select id from email_subscription_test_ids where key = 'subscriber'), 'confirmation', repeat('a', 64), now() + interval '1 hour');

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from email_subscription_test_ids where key = 'admin_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select length(token_hash) from public.email_access_tokens where subscriber_id = (select id from email_subscription_test_ids where key = 'subscriber')),
  64,
  'access tokens store hashes instead of raw tokens'
);

reset role;

insert into public.email_consent_events (subscriber_id, event_type, categories, first_name, normalized_email)
values ((select id from email_subscription_test_ids where key = 'subscriber'), 'subscription_requested', array['weekly_updates']::text[], 'Ada', 'ada@example.test');

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from email_subscription_test_ids where key = 'admin_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

update public.email_consent_events
set event_type = 'preference_changed';

select is(
  (select event_type from public.email_consent_events where subscriber_id = (select id from email_subscription_test_ids where key = 'subscriber')),
  'subscription_requested',
  'application users cannot update consent events through RLS'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select is(
  (select count(*) from public.email_subscribers),
  0::bigint,
  'anonymous users cannot read existing subscriber rows'
);

set local role service_role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'service_role', true);

insert into public.email_subscribers (id, first_name, email, normalized_email, status)
values ((select id from email_subscription_test_ids where key = 'service_subscriber'), 'Server', 'server-subscription@example.test', 'server-subscription@example.test', 'pending');

insert into public.email_subscription_preferences (subscriber_id, category, status)
values ((select id from email_subscription_test_ids where key = 'service_subscriber'), 'weekly_updates', 'pending');

insert into public.email_access_tokens (subscriber_id, token_type, token_hash, expires_at)
values ((select id from email_subscription_test_ids where key = 'service_subscriber'), 'confirmation', repeat('b', 64), now() + interval '1 hour');

insert into public.email_delivery_events (subscriber_id, provider, message_type, status)
values ((select id from email_subscription_test_ids where key = 'service_subscriber'), 'sender', 'confirmation', 'queued');

insert into public.email_consent_events (subscriber_id, event_type, categories, first_name, normalized_email)
values ((select id from email_subscription_test_ids where key = 'service_subscriber'), 'subscription_requested', array['weekly_updates']::text[], 'Server', 'server-subscription@example.test');

select ok(
  exists (
    select 1
    from public.email_subscribers subscriber
    join public.email_subscription_preferences preference on preference.subscriber_id = subscriber.id
    join public.email_access_tokens token on token.subscriber_id = subscriber.id
    join public.email_delivery_events delivery on delivery.subscriber_id = subscriber.id
    join public.email_consent_events consent on consent.subscriber_id = subscriber.id
    where subscriber.id = (select id from email_subscription_test_ids where key = 'service_subscriber')
      and preference.category = 'weekly_updates'
      and token.token_type = 'confirmation'
      and delivery.status = 'queued'
      and consent.event_type = 'subscription_requested'
  ),
  'service_role can create server-side subscription records'
);

update public.email_access_tokens
set used_at = now()
where subscriber_id = (select id from email_subscription_test_ids where key = 'service_subscriber');

update public.email_delivery_events
set status = 'sent', provider_message_id = 'local-test-message'
where subscriber_id = (select id from email_subscription_test_ids where key = 'service_subscriber');

update public.email_subscribers
set status = 'confirmed', confirmed_at = now()
where id = (select id from email_subscription_test_ids where key = 'service_subscriber');

update public.email_subscription_preferences
set status = 'active', confirmed_at = now()
where subscriber_id = (select id from email_subscription_test_ids where key = 'service_subscriber');

select ok(
  exists (
    select 1
    from public.email_subscribers subscriber
    join public.email_subscription_preferences preference on preference.subscriber_id = subscriber.id
    join public.email_access_tokens token on token.subscriber_id = subscriber.id
    join public.email_delivery_events delivery on delivery.subscriber_id = subscriber.id
    where subscriber.id = (select id from email_subscription_test_ids where key = 'service_subscriber')
      and subscriber.status = 'confirmed'
      and preference.status = 'active'
      and token.used_at is not null
      and delivery.status = 'sent'
  ),
  'service_role can update subscription workflow records'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select is(
  (select count(*) from public.email_subscribers where id = (select id from email_subscription_test_ids where key = 'service_subscriber')),
  0::bigint,
  'anonymous users cannot read service_role-created subscriber rows'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from email_subscription_test_ids where key = 'regular_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*) from public.email_subscribers),
  0::bigint,
  'non-admin authenticated users cannot read subscriber rows'
);

select * from finish();

rollback;
