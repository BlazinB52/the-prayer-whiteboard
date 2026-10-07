-- Per-recipient delivery record for teaching and devotional email sends.
--
-- Same idea as email_broadcast_deliveries (weekly updates): a send must not assume it finishes inside
-- one serverless request. Each recipient is claimed here before the email is handed to Sender, so a
-- cut-off send can be resumed and only subscribers without a 'sent' row are mailed.
--
-- ledger_id is the id of the row in email_teaching_broadcast_events (kind 'teaching') or
-- email_devotional_broadcast_ledger (kind 'devotional'), so it has no foreign key of its own.

create table if not exists public.email_send_deliveries (
  kind text not null,
  ledger_id uuid not null,
  subscriber_id uuid not null references public.email_subscribers(id) on delete cascade,
  status text not null default 'sending',
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (kind, ledger_id, subscriber_id),
  constraint email_send_deliveries_kind_check check (kind in ('teaching', 'devotional')),
  constraint email_send_deliveries_status_check check (status in ('sending', 'sent', 'failed'))
);

alter table public.email_send_deliveries enable row level security;

drop policy if exists "Admins read email send deliveries" on public.email_send_deliveries;
create policy "Admins read email send deliveries"
on public.email_send_deliveries
for select
using (public.is_authenticated_admin());

grant select on public.email_send_deliveries to authenticated;
grant select, insert, update on public.email_send_deliveries to service_role;
