-- Small key/value store for site-wide look-and-feel choices the administrator makes from /admin.
-- First use: the colors of the two cards behind the homepage whiteboard (keys whiteboard_card_front_color and
-- whiteboard_card_back_color, each a #rrggbb value). A missing key means "use the built-in default".

create table if not exists public.site_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- Service role only (the admin page's server code and the public pages' server code): RLS on with no policies, and
-- this project's default grants to anon/authenticated revoked explicitly.
alter table public.site_settings enable row level security;
revoke all on public.site_settings from anon, authenticated;
grant select, insert, update, delete on public.site_settings to service_role;
