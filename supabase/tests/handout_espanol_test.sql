begin;

select * from no_plan();

-- Español handouts and handout footers (20261015020000_handout_espanol.sql).

insert into public.content_footers (id, internal_title, content, language)
values ('00000000-0000-4000-9940-0000000000f1', 'Español handout footer', 'Las citas bíblicas pertenecen a la RVR1960.', 'es');

insert into public.teaching_handouts (id, title, gathering_date, language, content, original_content, footer_id)
values
  ('00000000-0000-4000-9940-0000000000a1', 'English handout', '2026-10-10', 'en', '[{"type":"paragraph","inlines":[{"text":"x"}]}]'::jsonb, '[]'::jsonb, null);

select lives_ok(
  $$ insert into public.teaching_handouts (id, title, gathering_date, language, content, original_content, translation_of, footer_id)
     values ('00000000-0000-4000-9940-0000000000a2', 'Handout en español', '2026-10-10', 'es', '[{"type":"paragraph","inlines":[{"text":"x"}]}]'::jsonb, '[]'::jsonb,
             '00000000-0000-4000-9940-0000000000a1', '00000000-0000-4000-9940-0000000000f1') $$,
  'an Español handout can point at its English handout and have a footer'
);
select throws_ok(
  $$ insert into public.teaching_handouts (title, gathering_date, language, content, original_content, translation_of)
     values ('A second Español handout', '2026-10-10', 'es', '[{"type":"paragraph","inlines":[{"text":"x"}]}]'::jsonb, '[]'::jsonb, '00000000-0000-4000-9940-0000000000a1') $$,
  '23505', null, 'one English handout has at most one Español version'
);
select throws_ok(
  $$ update public.teaching_handouts set translation_of = id where id = '00000000-0000-4000-9940-0000000000a1' $$,
  '23514', null, 'a handout cannot be the translation of itself'
);

delete from public.content_footers where id = '00000000-0000-4000-9940-0000000000f1';
select is((select footer_id from public.teaching_handouts where id = '00000000-0000-4000-9940-0000000000a2'), null, 'removing a footer clears the choice instead of blocking or deleting the handout');
select is((select count(*)::int from public.teaching_handouts where id = '00000000-0000-4000-9940-0000000000a2'), 1, 'and the handout stays');

delete from public.teaching_handouts where id = '00000000-0000-4000-9940-0000000000a1';
select is((select translation_of from public.teaching_handouts where id = '00000000-0000-4000-9940-0000000000a2'), null, 'deleting the English handout leaves the Español one in place, no longer linked');

select * from finish();
rollback;
