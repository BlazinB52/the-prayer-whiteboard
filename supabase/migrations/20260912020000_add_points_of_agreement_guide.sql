-- Adds a database-driven Prayer & Intercession Guide for Points of Agreement.
-- Existing prayer_needs and praise_reports records are preserved unchanged.

create table if not exists public.points_of_agreement_guide_settings (
  id boolean primary key default true,
  title text not null,
  subtitle text not null,
  opening_scripture text not null,
  opening_scripture_reference text not null,
  footer_quotation text not null,
  footer_scripture_reference text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint points_of_agreement_guide_settings_singleton_check check (id = true),
  constraint points_of_agreement_guide_settings_title_check check (length(trim(title)) > 0),
  constraint points_of_agreement_guide_settings_subtitle_check check (length(trim(subtitle)) > 0),
  constraint points_of_agreement_guide_settings_opening_scripture_check check (length(trim(opening_scripture)) > 0),
  constraint points_of_agreement_guide_settings_opening_reference_check check (length(trim(opening_scripture_reference)) > 0),
  constraint points_of_agreement_guide_settings_footer_quotation_check check (length(trim(footer_quotation)) > 0),
  constraint points_of_agreement_guide_settings_footer_reference_check check (length(trim(footer_scripture_reference)) > 0)
);

insert into public.points_of_agreement_guide_settings (
  id,
  title,
  subtitle,
  opening_scripture,
  opening_scripture_reference,
  footer_quotation,
  footer_scripture_reference
)
values (
  true,
  'PRAYER & INTERCESSION GUIDE',
  'Hebrew Year 5787: The Year of Spoken Word & Divine Rest',
  '“Take the helmet of salvation and the sword of the Spirit, which is the word of God. Praying in the Spirit always...”',
  'EPHESIANS 6:17–18',
  '“Again I say to you, if two of you agree on earth about anything they ask, it will be done for them by my Father in heaven.”',
  'MATTHEW 18:19'
)
on conflict (id) do nothing;

create table if not exists public.points_of_agreement (
  id uuid primary key default gen_random_uuid(),
  point_of_agreement text not null,
  scripture text not null,
  target text not null,
  decree text not null,
  additional_direction text,
  expires_on date not null,
  display_order integer not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint points_of_agreement_point_check check (length(trim(point_of_agreement)) > 0),
  constraint points_of_agreement_scripture_check check (length(trim(scripture)) > 0),
  constraint points_of_agreement_target_check check (length(trim(target)) > 0),
  constraint points_of_agreement_decree_check check (length(trim(decree)) > 0),
  constraint points_of_agreement_additional_direction_check
    check (additional_direction is null or length(trim(additional_direction)) > 0),
  constraint points_of_agreement_display_order_check check (display_order > 0),
  constraint points_of_agreement_archived_at_check check (status <> 'archived' or archived_at is not null)
);

create index if not exists points_of_agreement_status_order_idx
  on public.points_of_agreement (status, display_order, id);

create index if not exists points_of_agreement_expiration_idx
  on public.points_of_agreement (expires_on)
  where status = 'active';

create trigger points_of_agreement_guide_settings_set_updated_at
before update on public.points_of_agreement_guide_settings
for each row execute function public.set_updated_at();

create trigger points_of_agreement_set_updated_at
before update on public.points_of_agreement
for each row execute function public.set_updated_at();

alter table public.points_of_agreement_guide_settings enable row level security;
alter table public.points_of_agreement enable row level security;

create policy "Admins manage points of agreement guide settings"
on public.points_of_agreement_guide_settings
for all
using (public.is_authenticated_admin())
with check (public.is_authenticated_admin());

create policy "Admins manage points of agreement"
on public.points_of_agreement
for all
using (public.is_authenticated_admin())
with check (public.is_authenticated_admin());

create or replace view public.public_points_of_agreement
as
select
  point_of_agreement,
  scripture,
  target,
  decree,
  additional_direction,
  display_order
from public.points_of_agreement
where status = 'active';

create or replace view public.public_points_of_agreement_guide_settings
as
select
  title,
  subtitle,
  opening_scripture,
  opening_scripture_reference,
  footer_quotation,
  footer_scripture_reference
from public.points_of_agreement_guide_settings
where id = true;

grant select on public.public_points_of_agreement_guide_settings to anon, authenticated;
grant select on public.public_points_of_agreement to anon, authenticated;
grant select, insert, update, delete on public.points_of_agreement_guide_settings to authenticated;
grant select, insert, update, delete on public.points_of_agreement to authenticated;

-- No anonymous grant or policy exposes public.points_of_agreement directly,
-- because expires_on is an administrator-only management field.
