-- Homepage teaser 2 must have both a heading and a text, or neither. That rule now applies once a
-- teaching leaves draft (published or archived) instead of at every save.
--
-- Why: a draft changes one field at a time. When a co-editor proposes both a new teaser 2 heading
-- and a new teaser 2 text, the Administrator accepts them one after the other, and the first accept
-- briefly leaves the pair half filled. The old rule rejected that, so neither could be accepted.
-- A teaching still cannot be published with a half-filled pair.

alter table public.teachings
  drop constraint if exists teachings_teaser_2_completeness_check,
  add constraint teachings_teaser_2_completeness_check
    check (
      status = 'draft'
      or (nullif(trim(coalesce(teaser_2_heading, '')), '') is null and nullif(trim(coalesce(teaser_2_text, '')), '') is null)
      or (nullif(trim(coalesce(teaser_2_heading, '')), '') is not null and nullif(trim(coalesce(teaser_2_text, '')), '') is not null)
    );
