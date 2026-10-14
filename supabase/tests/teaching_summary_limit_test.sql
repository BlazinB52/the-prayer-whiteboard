begin;

select * from no_plan();

-- The Short summary limit is 800 characters (20261015010000_teaching_summary_limit_800.sql). The database
-- enforces it in the function that lets a co-editor propose summary wording; every other field keeps its limit.

insert into public.teachings (id, slug, title, central_theme, introduction, summary, teaser_1_heading, teaser_1_text, status, published_at)
values ('00000000-0000-4000-9930-0000000000a1', 'summary-limit-t1', 'Summary Limit', 'Theme', 'Intro.', 'Summary.', 'Heading', 'Text', 'draft', null);

select is(
  (select max_length from public.revision_field_info('00000000-0000-4000-9930-0000000000a1', 'teaching', null, 'summary')),
  800,
  'a summary may be up to 800 characters'
);
select is(
  (select valid from public.revision_field_info('00000000-0000-4000-9930-0000000000a1', 'teaching', null, 'summary')),
  true,
  'and is still a field that can be proposed'
);
select is(
  (select max_length from public.revision_field_info('00000000-0000-4000-9930-0000000000a1', 'teaching', null, 'introduction')),
  5000,
  'the introduction keeps its 5,000'
);
select is(
  (select max_length from public.revision_field_info('00000000-0000-4000-9930-0000000000a1', 'teaching', null, 'teaser_1_text')),
  350,
  'and the teaser text keeps its 350'
);
select is(
  (select max_length from public.revision_field_info('00000000-0000-4000-9930-0000000000a1', 'teaching', null, 'teaser_1_heading')),
  100,
  'and the teaser heading its 100'
);

select * from finish();
rollback;
