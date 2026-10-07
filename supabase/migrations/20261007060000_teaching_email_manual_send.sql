-- Publishing a teaching no longer emails subscribers.
--
-- Until now, publishing a teaching called the website's /api/webhooks/teaching endpoint, which mailed
-- every subscriber who chose New Teachings. The email is now sent only when an Administrator presses
-- "Send email" on the teaching's edit page (POST /api/admin/teaching/send-email). That send uses the
-- same one-per-teaching ledger and per-subscriber delivery records as before, so it can never go out
-- twice, and a send that is cut short can be resumed.
--
-- The trigger and its function are kept (so nothing else that refers to them breaks) but the function
-- no longer makes the web call.

create or replace function public.notify_teaching_published() returns trigger
    language plpgsql security definer
    set search_path to 'public', 'extensions', 'vault'
    as $$
begin
  -- Intentionally does nothing: publishing a teaching never sends email.
  return new;
end;
$$;
