begin;

select * from no_plan();

-- H1 an Español handout, translated from E1; V1 and V2 are versions made from H1.

insert into public.teaching_handouts (id, title, gathering_date, language, status, content, original_content)
values
  ('00000000-0000-4000-9a00-0000000000e1', 'English handout', '2026-09-19', 'en', 'draft', '[{"type":"paragraph","inlines":[{"text":"x"}]}]'::jsonb, '[]'::jsonb);
insert into public.teaching_handouts (id, title, gathering_date, language, status, content, original_content, translation_of)
values
  ('00000000-0000-4000-9a00-0000000000b1', 'Manos', '2026-09-19', 'es', 'draft', '[{"type":"paragraph","inlines":[{"text":"x"}]}]'::jsonb, '[]'::jsonb, '00000000-0000-4000-9a00-0000000000e1');

select lives_ok($$
  insert into public.teaching_handouts (id, title, gathering_date, language, status, content, original_content, version_label, version_of)
  values ('00000000-0000-4000-9a00-0000000000c1', 'Manos (Honduras)', '2026-09-19', 'es', 'draft', '[]'::jsonb, '[]'::jsonb, 'Honduras', '00000000-0000-4000-9a00-0000000000b1')
$$, 'a version of the Español handout can be added');

select lives_ok($$
  insert into public.teaching_handouts (id, title, gathering_date, language, status, content, original_content, version_label, version_of)
  values ('00000000-0000-4000-9a00-0000000000c2', 'Manos (US)', '2026-09-19', 'es', 'draft', '[]'::jsonb, '[]'::jsonb, 'US', '00000000-0000-4000-9a00-0000000000b1')
$$, 'and a second one for the same gathering and language');

select is((select count(*)::int from public.teaching_handouts where version_of = '00000000-0000-4000-9a00-0000000000b1'), 2, 'both versions point at the handout they were made from');
select is((select count(*)::int from public.teaching_handouts where translation_of = '00000000-0000-4000-9a00-0000000000e1'), 1, 'the English handout still has exactly one translation');

select throws_ok($$ update public.teaching_handouts set version_label = '   ' where id = '00000000-0000-4000-9a00-0000000000c1' $$, '23514', null, 'a blank version name is refused');
select throws_ok($$ update public.teaching_handouts set version_label = repeat('x', 61) where id = '00000000-0000-4000-9a00-0000000000c1' $$, '23514', null, 'a version name over 60 characters is refused');
select throws_ok($$ update public.teaching_handouts set version_of = id where id = '00000000-0000-4000-9a00-0000000000c1' $$, '23514', null, 'a version cannot be made from itself');

delete from public.teaching_handouts where id = '00000000-0000-4000-9a00-0000000000b1';
select is((select count(*)::int from public.teaching_handouts where id in ('00000000-0000-4000-9a00-0000000000c1', '00000000-0000-4000-9a00-0000000000c2') and version_of is null), 2, 'deleting the original only clears the link; the versions stay');
delete from public.teaching_handouts where id = '00000000-0000-4000-9a00-0000000000c1';
select is((select count(*)::int from public.teaching_handouts where id = '00000000-0000-4000-9a00-0000000000c2'), 1, 'deleting one version leaves the other');

select * from finish();
rollback;
