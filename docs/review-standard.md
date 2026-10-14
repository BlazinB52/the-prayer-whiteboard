# The review standard

Teachings, 7-day devotionals, weekly updates, teaching outlines and handouts all go through the same Content Manager
review cycle. This page is the one description of it, and the checklist for putting another kind of content
through it.

## The cycle

1. **The Administrator creates a draft.** Content Managers cannot see it.
2. **The gate.** The Administrator presses **Send to Content Managers for review** on the item's page.
   Every active Content Manager is emailed a link. The Administrator can **Take back from review** at any
   time. (Weekly updates are the one exception: they are sent to chosen people, from the Weekly Updates
   page, and a Content Manager's single submit is also their OK to publish.)
3. **Proposals.** A Content Manager opens the item under `/admin/cm/<kind>-review`, edits the wording, and
   presses **Save Draft** and then **Submit for Admin Review**. Nothing they do touches the item itself.
   They can take a submitted proposal back until the Administrator opens it, or start a new one.
4. **Decisions.** The Administrator opens the proposal under **Revisions** (`/admin/teaching-revisions`),
   sees every change as tracked changes, and accepts or rejects each one. An accepted change is written to
   the item in the same database transaction that records the decision. If the wording moved since the
   proposal was written, Accept is turned off and the Administrator can reject it or **Accept anyway**.
5. **Direct edits.** The Administrator can also edit a draft's text directly (weekly updates and outlines),
   with a panel showing what changed since the Word file was uploaded.
6. **Publishing** closes the gate and closes any review still open. A proposal that was submitted is kept
   in the history until the Administrator clears it.

Only drafts go through the cycle. To change a published item, unpublish it first.

**Handouts** follow the same cycle, with a different way to publish. "Create new handout" at
`/admin/handouts` makes a blank draft; on its page the Administrator enters the title, the teaching date
(`gathering_date`) and the teaching, and uploads the Word draft (styles from `docs/handout-template.docx`:
Heading 1 section title, Subtitle, Heading 2 paragraph title, Normal, List Bullet, Quote; a file name such as
`en_20261010_...docx` fills in the date). From the same page the draft is sent for review (it needs a date and a
draft) and the Administrator can copy the finished text from **Final text to copy** into the Word handout.
**Publishing a handout is uploading its final PDF**: it is added to Printable PDF Links
(`printable_pdf_links`), which is the public PDF library, and `printable_pdf_id` points at that row. Removing
the PDF there, or **Unpublish**, puts the handout back to a draft. The date is shown with
`app/teaching-date-label.tsx` (formatting in `lib/teaching-date.ts`); the other publications should use the
same label when they get their date.

An English handout with a draft has **Translate to Español** (`/api/admin/handout/translate`, `lib/handout-translate.ts`),
which uses the teachings' translator and the Spanish Translation Rules and saves a new Español handout linked to it
(`translation_of`), with the same teaching and date. An Español handout has its own footer, chosen from the existing
footers of its language (`footer_id`); it is written for the handout and is not a translation of the English one.

## Where things live

| Piece | File |
|---|---|
| The list of reviewed kinds (names, folders, database functions) | `lib/review-subjects.ts` |
| Send / take back actions | `app/admin/review-gate-actions.ts`, `app/admin/review-gate-section.tsx` |
| The "ready for your review" email | `lib/review-ready-email.ts`, `lib/review-ready-send.ts` |
| The Content Manager's list and review page | `app/admin/cm/<kind>-review/` |
| The edit form (shared) | `app/admin/cm/teaching-review/[id]/review-edit-form.tsx` |
| Take-back button | `app/admin/cm/recall-*.ts(x)` |
| The Administrator's Revisions screens (shared) | `app/admin/teaching-revisions/` |
| The Administrator's direct text editor (shared) | `app/admin/text-editor.tsx` |
| The database: tables | `content_revisions`, `content_revision_changes` |
| The database: the gate | `sent_for_review_at` on the item, `review_is_open(...)`, RLS policies |
| The database: per kind | `create_/save_/submit_<kind>_revision`, `review_<kind>_revision_change`, `review_all_<kind>_revision_changes`, `close_<kind>_revisions_on_publish` |

Two things are the same for every kind and are never copied: `discard_teaching_revision`,
`cancel_teaching_revision`, `purge_revision_history`, `mark_revision_opened` and `recall_revision` work on any
kind, and the Revisions screens read the kind from `content_revisions.subject_type`.

## Adding another kind of content

1. **Database** (a new migration, see `20261011030000_outline_review.sql` for a complete example):
   - an id column on `content_revisions` and the two `check` constraints that list the kinds; the same for
     `content_revision_changes.target_kind`;
   - `sent_for_review_at` on the item's table, the `clear_review_gate_when_published` trigger, and a
     `to authenticated` read policy that shows a Content Manager only drafts that were sent;
   - a branch for the new kind in `review_is_open` and in `recall_revision`;
   - the per-kind functions listed above, plus a way to list the editable fields and write one back;
   - take away any Content Manager write policy on the item. Content Managers propose; they never write.
2. **`lib/review-subjects.ts`**: add the kind. Everything that has to know "which kind is this?" reads it.
3. **Pages**: the Content Manager list, review page and action under `app/admin/cm/<kind>-review/` (copy
   `outline-review`), the gate section on the Administrator's page for the item, and a tile on
   `app/admin/cm/page.tsx`.
4. **Revisions screens**: add the branch that loads the item's fields in
   `app/admin/teaching-revisions/[revisionId]/page.tsx`.
5. **Tests**: a pgTAP file under `supabase/tests/` (copy `outline_review_test.sql`) and a source test under
   `tests/` (copy `outline-review.test.mjs`).

## Running the database tests on this machine

`npx supabase test db --local supabase/tests` needs the local database. Windows reserves ports 54320-54419
here, so `npx supabase start` fails with "ports are not available". Temporarily change the ports in
`supabase/config.toml` (for example 15420-15429), start, run the tests, stop, and restore the file with
`git checkout supabase/config.toml`.

Every migration needs its own timestamp: `supabase migration up` records the timestamp as the version and
stops on a second file that reuses one.
