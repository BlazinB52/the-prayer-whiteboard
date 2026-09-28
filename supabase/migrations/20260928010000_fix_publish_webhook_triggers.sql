-- Fixes notify_weekly_update_published and notify_teaching_published, which
-- were never captured in a migration to begin with (found by dumping the
-- live schema directly). Both had two bugs since whenever they were created
-- directly against production:
--
--   1. url pointed at the site root ('https://theprayerwhiteboard.com')
--      instead of the actual webhook route, so the request never reached
--      the app's broadcast logic at all.
--   2. The x-webhook-secret header was the literal placeholder string
--      'YOUR_ACTUAL_SECRET_STRING_HERE', never replaced with a real value.
--
-- The secret itself is read from Vault (stored separately via
-- `supabase db query --linked`, never committed to a file) rather than
-- hardcoded here, so the real value never lands in git history.

create or replace function public.notify_weekly_update_published() returns trigger
    language plpgsql security definer
    set search_path to 'public', 'extensions', 'vault'
    as $$
declare
  v_secret text;
begin
  if new.status = 'published' and new.is_current = true then
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'webhook_shared_secret';
    perform net.http_post(
      url := 'https://theprayerwhiteboard.com/api/webhooks/weekly-update',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', v_secret
      ),
      body := jsonb_build_object(
        'type', tg_op,
        'schema', 'public',
        'table', 'weekly_updates',
        'record', to_jsonb(new)
      )
    );
  end if;
  return new;
end;
$$;

create or replace function public.notify_teaching_published() returns trigger
    language plpgsql security definer
    set search_path to 'public', 'extensions', 'vault'
    as $$
declare
  v_secret text;
begin
  if new.status = 'published' then
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'webhook_shared_secret';
    perform net.http_post(
      url := 'https://theprayerwhiteboard.com/api/webhooks/teaching',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', v_secret
      ),
      body := jsonb_build_object(
        'type', tg_op,
        'schema', 'public',
        'table', 'teachings',
        'record', to_jsonb(new)
      )
    );
  end if;
  return new;
end;
$$;
