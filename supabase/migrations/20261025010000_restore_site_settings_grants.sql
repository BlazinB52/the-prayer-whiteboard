-- public.site_settings already existed (initial schema: id uuid primary key, key text unique, value jsonb, is_public,
-- status ...), so 20261025000000_site_settings.sql created nothing and only its revoke took effect, removing the
-- initial schema's grants. Put them back exactly as the initial schema had them. RLS and its policies were never
-- changed. The whiteboard card colors use this table as it is: key = whiteboard_card_front_color /
-- whiteboard_card_back_color, value = the "#rrggbb" string.

grant select on public.site_settings to anon, authenticated;
grant select, insert, update, delete on public.site_settings to authenticated;
