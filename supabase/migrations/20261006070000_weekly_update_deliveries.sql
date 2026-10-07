-- Per-recipient delivery record for weekly update broadcasts.
--
-- A broadcast can no longer assume it finishes inside one serverless request. Each recipient is
-- claimed here before the email is handed to Sender, so a send that is cut off can be resumed and
-- only the subscribers without a 'sent' row are mailed. The primary key is the double-send guard.

create table if not exists public.email_broadcast_deliveries (
  weekly_update_id uuid not null references public.weekly_updates(id) on delete cascade,
  subscriber_id uuid not null references public.email_subscribers(id) on delete cascade,
  status text not null default 'sending',
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (weekly_update_id, subscriber_id),
  constraint email_broadcast_deliveries_status_check check (status in ('sending', 'sent', 'failed'))
);

alter table public.email_broadcast_deliveries enable row level security;

drop policy if exists "Admins read email broadcast deliveries" on public.email_broadcast_deliveries;
create policy "Admins read email broadcast deliveries"
on public.email_broadcast_deliveries
for select
using (public.is_authenticated_admin());

grant select on public.email_broadcast_deliveries to authenticated;
grant select, insert, update on public.email_broadcast_deliveries to service_role;
