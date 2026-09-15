-- Allows confirmed legacy devotional imports when Sender.net does not provide
-- the original double-opt-in confirmation timestamp.

alter table public.email_subscribers
  drop constraint if exists email_subscribers_confirmed_status_check;

alter table public.email_subscription_preferences
  drop constraint if exists email_subscription_preferences_active_check;

alter table public.email_consent_events
  drop constraint if exists email_consent_events_type_check;

alter table public.email_consent_events
  add constraint email_consent_events_type_check
  check (event_type in (
    'subscription_requested',
    'double_opt_in_confirmed',
    'preference_management_requested',
    'preference_changed',
    'unsubscribed',
    'resubscribed',
    'legacy_devotional_imported'
  ));
