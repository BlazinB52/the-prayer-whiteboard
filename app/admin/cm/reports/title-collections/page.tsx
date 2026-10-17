import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/supabase/admin";
import {
  COLLECTION_PIECES,
  SLOTS_PER_TEACHING,
  buildCollectionReport,
  rowMissingPiece,
  type CollectionEntry,
  type CollectionLanguage,
  type CollectionPiece,
  type CollectionRow,
  type EntryState,
  type PieceInput,
  type TeachingInput,
} from "@/lib/title-collections";

export const metadata: Metadata = {
  title: "Title Collections",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Show = "all" | "incomplete" | "complete" | "spanish" | "drafts";
const SHOWS: Show[] = ["all", "incomplete", "complete", "spanish", "drafts"];
const SHOW_LABELS: Record<Show, string> = {
  all: "All teachings",
  incomplete: "Not finished",
  complete: "Finished",
  spanish: "Missing Español",
  drafts: "Has drafts",
};

const language = (value: string | null | undefined): CollectionLanguage => (value === "es" ? "es" : "en");

function matchesShow(row: CollectionRow, show: Show) {
  if (show === "complete") return row.complete;
  if (show === "incomplete") return !row.complete;
  if (show === "spanish") return row.missingSpanish;
  if (show === "drafts") return row.hasDraft;
  return true;
}

function filterHref(show: Show, missing: CollectionPiece | "") {
  const query = new URLSearchParams();
  if (show !== "all") query.set("show", show);
  if (missing) query.set("missing", missing);
  const text = query.toString();
  return `/admin/cm/reports/title-collections${text ? `?${text}` : ""}`;
}

const STATE_STYLES: Record<EntryState, string> = {
  published: "border-[#326048]/25 bg-[#e7efe9] text-[#244a3a]",
  exists: "border-[#326048]/25 bg-[#e7efe9] text-[#244a3a]",
  draft: "border-[#c49a3a]/50 bg-[#fbf1cf] text-[#6b5013]",
};
const STATE_LABELS: Record<EntryState, string> = { published: "Published", exists: "Done", draft: "Draft" };

function LanguageLine({ lang, entries, missingLabel = "Missing" }: { lang: CollectionLanguage; entries: CollectionEntry[]; missingLabel?: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-1.5 w-6 shrink-0 text-[10px] font-black uppercase tracking-wider text-[#946332]">{lang}</span>
      {entries.length ? (
        <ul className="min-w-0 flex-1 space-y-1">
          {entries.map((entry) => (
            <li key={entry.id}>
              <Link
                href={entry.href}
                title={`${STATE_LABELS[entry.state]}: ${entry.title}`}
                className={`block truncate rounded-md border px-2 py-1 text-xs font-bold hover:underline ${STATE_STYLES[entry.state]}`}
              >
                <span aria-hidden="true">{entry.state === "draft" ? "● " : "✓ "}</span>
                {entry.state === "draft" ? "Draft" : "Done"}
                <span className="sr-only"> {entry.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <span className="min-w-0 flex-1 rounded-md border border-dashed border-[#a2472c]/30 bg-[#fbeeea]/60 px-2 py-1 text-xs font-bold text-[#a2472c]/80">{missingLabel}</span>
      )}
    </div>
  );
}

function ProgressBar({ filled, total }: { filled: number; total: number }) {
  const percent = Math.round((filled / total) * 100);
  return (
    <div className="mt-2 flex items-center gap-2" role="img" aria-label={`${filled} of ${total} done`}>
      <div className="h-2 w-28 overflow-hidden rounded-full bg-[#e6dfd0]">
        <div className={`h-full rounded-full ${filled === total ? "bg-[#326048]" : "bg-[#c49a3a]"}`} style={{ width: `${percent}%` }} />
      </div>
      <span className="text-xs font-bold text-[#607066]">{filled} of {total}</span>
    </div>
  );
}

export default async function TitleCollectionsPage({ searchParams }: { searchParams: Promise<{ show?: string; missing?: string }> }) {
  const params = await searchParams;
  const { supabase } = await requireAdmin();

  const [teachingsResult, devotionalsResult, outlinesResult, handoutsResult, updatesResult, whiteboardsResult, teachingBoardsResult, updateBoardsResult, devotionalAssignmentsResult] = await Promise.all([
    supabase.from("teachings").select("id, title, language, status, gathering_date, translation_of, chalkboard_asset_id"),
    supabase.from("teaching_devotionals").select("id, title, language, status, teaching_id, translation_of"),
    supabase.from("teaching_outlines").select("id, title, language, status, teaching_id"),
    supabase.from("teaching_handouts").select("id, title, language, teaching_id, status, translation_of"),
    supabase.from("weekly_updates").select("id, title, language, status, teaching_id, gathering_date"),
    supabase.from("chalkboard_assets").select("id, title, canonical_name, language, teaching_id").eq("status", "active").eq("is_current_version", true),
    supabase.from("teaching_chalkboard_assignments").select("teaching_id, chalkboard_asset_id"),
    supabase.from("weekly_update_chalkboard_assignments").select("chalkboard_asset_id"),
    supabase.from("teaching_devotional_assignments").select("devotional_id, teaching_id"),
  ]);

  const failed = [teachingsResult, devotionalsResult, outlinesResult, handoutsResult, updatesResult, whiteboardsResult, teachingBoardsResult, devotionalAssignmentsResult].some((result) => result.error);

  // The authoritative devotional-to-teaching link; teaching_devotionals.teaching_id is only a legacy backup.
  const teachingIdsByDevotional = new Map<string, string[]>();
  for (const assignment of (devotionalAssignmentsResult.data as { devotional_id: string; teaching_id: string }[] | null) ?? []) {
    const list = teachingIdsByDevotional.get(assignment.devotional_id) ?? [];
    list.push(assignment.teaching_id);
    teachingIdsByDevotional.set(assignment.devotional_id, list);
  }
  // The teaching link on handouts and weekly updates arrives with a database update; say so rather than showing wrong numbers.
  const teachingRows = (teachingsResult.data as (TeachingInput & { chalkboard_asset_id: string | null })[] | null) ?? [];

  const teachingIdsByBoard = new Map<string, string[]>();
  const addBoard = (boardId: string | null | undefined, teachingId: string | null | undefined) => {
    if (!boardId || !teachingId) return;
    const list = teachingIdsByBoard.get(boardId) ?? [];
    if (!list.includes(teachingId)) list.push(teachingId);
    teachingIdsByBoard.set(boardId, list);
  };
  for (const teaching of teachingRows) addBoard(teaching.chalkboard_asset_id, teaching.id);
  for (const assignment of (teachingBoardsResult.data as { teaching_id: string; chalkboard_asset_id: string }[] | null) ?? []) addBoard(assignment.chalkboard_asset_id, assignment.teaching_id);

  const boardsUsedByUpdates = new Set(((updateBoardsResult.data as { chalkboard_asset_id: string }[] | null) ?? []).map((row) => row.chalkboard_asset_id));

  const link = (teachingId: string | null | undefined) => (teachingId ? [teachingId] : []);
  const pieces: Record<CollectionPiece, PieceInput[]> = {
    whiteboard: ((whiteboardsResult.data as { id: string; title: string | null; canonical_name: string | null; language: string | null; teaching_id: string | null }[] | null) ?? []).map((row) => {
      const teachingIds = [...(teachingIdsByBoard.get(row.id) ?? []), ...link(row.teaching_id)];
      return { id: row.id, title: row.canonical_name ?? row.title ?? "Whiteboard", language: language(row.language), teachingIds, state: "exists" as const, href: `/admin/whiteboards/${row.id}` };
    }),
    // A weekly update is written before its teaching exists, so when it has no teaching of its own it belongs to the
    // English teaching of its gathering date.
    weeklyUpdate: ((updatesResult.data as { id: string; title: string; language: string | null; status: string; teaching_id: string | null; gathering_date: string | null }[] | null) ?? []).map((row) => ({
      id: row.id, title: row.title, language: language(row.language), teachingIds: row.teaching_id || !row.gathering_date ? link(row.teaching_id) : teachingRows.filter((teaching) => teaching.language === "en" && teaching.gathering_date === row.gathering_date).map((teaching) => teaching.id), state: row.status === "draft" ? "draft" as const : "published" as const, href: "/admin/weekly-updates",
    })),
    handout: ((handoutsResult.data as { id: string; title: string; language: string | null; teaching_id: string | null; status: string; translation_of: string | null }[] | null) ?? []).map((row) => ({
      id: row.id, title: row.title, language: language(row.language), teachingIds: link(row.teaching_id), parentId: row.translation_of, state: row.status === "published" ? "published" as const : "draft" as const, href: `/admin/handouts/${row.id}`,
    })),
    devotional: ((devotionalsResult.data as { id: string; title: string; language: string | null; status: string; teaching_id: string | null; translation_of: string | null }[] | null) ?? []).map((row) => ({
      id: row.id, title: row.title || "Devotional", language: language(row.language), teachingIds: [...(teachingIdsByDevotional.get(row.id) ?? []), ...link(row.teaching_id)], parentId: row.translation_of, state: row.status === "published" ? "published" as const : "draft" as const, href: `/admin/devotionals/${row.id}`,
    })),
    outline: ((outlinesResult.data as { id: string; title: string; language: string | null; status: string; teaching_id: string | null }[] | null) ?? []).map((row) => ({
      id: row.id, title: row.title, language: language(row.language), teachingIds: link(row.teaching_id), state: row.status === "published" ? "published" as const : "draft" as const, href: `/admin/outlines/${row.id}`,
    })),
  };

  const report = buildCollectionReport({ teachings: teachingRows, pieces });
  const show: Show = SHOWS.includes(params.show as Show) ? (params.show as Show) : "all";
  const missing: CollectionPiece | "" = COLLECTION_PIECES.some((piece) => piece.key === params.missing) ? (params.missing as CollectionPiece) : "";

  const total = report.rows.length;
  const finishedCount = report.rows.filter((row) => row.complete).length;
  const draftCount = report.rows.filter((row) => row.hasDraft).length;
  const spanishGapCount = report.rows.filter((row) => row.missingSpanish).length;
  const unlinkedGroups = COLLECTION_PIECES.map((piece) => ({ ...piece, items: report.unlinked[piece.key] })).filter((group) => group.items.length);
  const unlinkedTotal = unlinkedGroups.reduce((sum, group) => sum + group.items.length, 0);

  const visible = report.rows.filter((row) => matchesShow(row, show) && (!missing || rowMissingPiece(row, missing)));

  const coverage = COLLECTION_PIECES.map((piece) => ({
    ...piece,
    en: report.rows.filter((row) => row.pieces[piece.key].en.length).length,
    es: report.rows.filter((row) => row.pieces[piece.key].es.length).length,
  }));

  return (
    <main className="admin-shell">
      <div className="mx-auto max-w-[96rem]">
        <Link href="/admin/cm/reports" className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Back to Reports</Link>
        <header className="mt-4 border-b border-[#284a3b]/10 pb-6">
          <h1 className="text-3xl font-extrabold tracking-tight text-[#243d31]">Title Collections</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#607066]">
            Every teaching with the whiteboard, weekly update, handout, devotional and outline that go with it, in English (EN) and Español (ES). A teaching is finished when all {SLOTS_PER_TEACHING} spots are filled and none is still a draft. Click any green or yellow box to open that item.
          </p>
        </header>

        {failed ? (
          <p role="alert" className="mt-6 rounded-xl border border-[#a2472c]/30 bg-[#f7e6e1] px-4 py-3 text-sm font-bold text-[#a2472c]">
            Some of the report could not be loaded. The database update that links handouts and weekly updates to teachings may not be applied yet, so those columns may be wrong.
          </p>
        ) : null}

        <section className="grid gap-3 py-6 sm:grid-cols-2 lg:grid-cols-4" aria-label="Summary">
          {[
            { label: "Teachings", value: total, tone: "text-[#243d31]", hint: report.hiddenArchived ? `${report.hiddenArchived} archived hidden` : "English with its Español" },
            { label: "Finished", value: finishedCount, tone: "text-[#326048]", hint: `${total - finishedCount} not finished` },
            { label: "Missing Español", value: spanishGapCount, tone: spanishGapCount ? "text-[#a2472c]" : "text-[#326048]", hint: "at least one Español spot empty" },
            { label: "Not linked to a teaching", value: unlinkedTotal, tone: unlinkedTotal ? "text-[#a2472c]" : "text-[#326048]", hint: unlinkedTotal ? "see the list at the bottom" : "everything is linked" },
          ].map((tile) => (
            <div key={tile.label} className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5 shadow-lg shadow-[#4d5f52]/8">
              <p className="text-xs font-black uppercase tracking-wider text-[#946332]">{tile.label}</p>
              <p className={`mt-2 text-4xl font-extrabold ${tile.tone}`}>{tile.value}</p>
              <p className="mt-1 text-xs text-[#607066]">{tile.hint}</p>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5" aria-label="Coverage by piece">
          <h2 className="text-lg font-extrabold text-[#243d31]">How many teachings have each piece</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {coverage.map((piece) => (
              <div key={piece.key}>
                <p className="text-sm font-extrabold text-[#385245]">{piece.label}</p>
                {(["en", "es"] as const).map((lang) => (
                  <div key={lang} className="mt-2 flex items-center gap-2" role="img" aria-label={`${piece.label} ${lang.toUpperCase()}: ${piece[lang]} of ${total}`}>
                    <span className="w-5 text-[10px] font-black uppercase text-[#946332]">{lang}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#e6dfd0]">
                      <div className={`h-full rounded-full ${piece[lang] === total && total > 0 ? "bg-[#326048]" : "bg-[#c49a3a]"}`} style={{ width: `${total ? Math.round((piece[lang] / total) * 100) : 0}%` }} />
                    </div>
                    <span className="w-14 text-right text-xs font-bold text-[#607066]">{piece[lang]}/{total}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section className="py-6" aria-label="Filters">
          <div className="flex flex-wrap gap-2">
            {SHOWS.map((option) => (
              <Link key={option} href={filterHref(option, missing)} className={`rounded-full border px-4 py-2 text-sm font-extrabold ${show === option ? "border-[#284a3b] bg-[#284a3b] text-white" : "border-[#284a3b]/15 bg-white text-[#244a3a] hover:border-[#a85e32]/40"}`}>
                {SHOW_LABELS[option]}
                {option === "complete" ? ` (${finishedCount})` : option === "incomplete" ? ` (${total - finishedCount})` : option === "spanish" ? ` (${spanishGapCount})` : option === "drafts" ? ` (${draftCount})` : ` (${total})`}
              </Link>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-[#385245]">Missing a:</span>
            {COLLECTION_PIECES.map((piece) => (
              <Link key={piece.key} href={filterHref(show, missing === piece.key ? "" : piece.key)} className={`rounded-full border px-3 py-1.5 text-sm font-extrabold ${missing === piece.key ? "border-[#a2472c] bg-[#a2472c] text-white" : "border-[#284a3b]/15 bg-white text-[#244a3a] hover:border-[#a85e32]/40"}`}>
                {piece.label}
              </Link>
            ))}
            {missing ? <Link href={filterHref(show, "")} className="text-sm font-bold text-[#946332] underline">Clear</Link> : null}
          </div>
          <p className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-bold text-[#607066]">
            <span className="rounded-md border border-[#326048]/25 bg-[#e7efe9] px-2 py-1 text-[#244a3a]">✓ Done</span>
            <span className="rounded-md border border-[#c49a3a]/50 bg-[#fbf1cf] px-2 py-1 text-[#6b5013]">● Draft, not published yet</span>
            <span className="rounded-md border border-dashed border-[#a2472c]/30 bg-[#fbeeea]/60 px-2 py-1 text-[#a2472c]/80">Missing</span>
            <span>Showing {visible.length} of {total}. Whiteboards are never published, so they show as Done once they exist.</span>
          </p>
        </section>

        <div className="overflow-x-auto rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] shadow-lg shadow-[#4d5f52]/8">
          <table className="w-full min-w-[64rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#284a3b]/10 bg-[#f1ebdd] text-xs font-black uppercase tracking-wider text-[#946332]">
                <th className="w-72 px-4 py-3">Teaching</th>
                {COLLECTION_PIECES.map((piece) => <th key={piece.key} className="px-3 py-3">{piece.label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#284a3b]/10">
              {visible.map((row) => (
                <tr key={row.teaching.id} className={`align-top ${row.complete ? "bg-[#f3f8f4]" : ""}`}>
                  <td className="px-4 py-3">
                    <p className="font-extrabold leading-snug text-[#243d31]">{row.teaching.title}</p>
                    {row.teaching.gathering_date ? <p className="mt-1 text-xs text-[#607066]">{row.teaching.gathering_date}</p> : null}
                    <div className="mt-2 space-y-1">
                      <LanguageLine lang="en" entries={row.teachings.en} missingLabel="No English teaching" />
                      <LanguageLine lang="es" entries={row.teachings.es} missingLabel="No Español teaching" />
                    </div>
                    <ProgressBar filled={row.filled} total={row.total} />
                  </td>
                  {COLLECTION_PIECES.map((piece) => (
                    <td key={piece.key} className="space-y-1 px-3 py-3">
                      <LanguageLine lang="en" entries={row.pieces[piece.key].en} />
                      <LanguageLine lang="es" entries={row.pieces[piece.key].es} />
                    </td>
                  ))}
                </tr>
              ))}
              {!visible.length ? (
                <tr><td colSpan={COLLECTION_PIECES.length + 1} className="px-4 py-8 text-center text-sm font-bold text-[#607066]">Nothing matches these filters.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <section className="py-10" aria-label="Not linked to a teaching">
          <h2 className="text-xl font-extrabold text-[#243d31]">Not linked to a teaching <span className="text-sm font-bold text-[#607066]">({unlinkedTotal})</span></h2>
          <p className="mt-1 max-w-3xl text-sm text-[#607066]">These exist but do not belong to any teaching yet. The goal is to link every one so this list is empty.</p>
          {unlinkedGroups.length ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {unlinkedGroups.map((group) => (
                <div key={group.key} className="rounded-2xl border border-[#a2472c]/20 bg-[#fffdf8] p-5">
                  <h3 className="text-sm font-black uppercase tracking-wider text-[#a2472c]">{group.label} ({group.items.length})</h3>
                  <ul className="mt-3 divide-y divide-[#284a3b]/10">
                    {group.items.map((item) => (
                      <li key={item.id} className="flex items-center gap-3 py-2 text-sm">
                        <span className="w-6 shrink-0 text-[10px] font-black uppercase tracking-wider text-[#946332]">{item.language}</span>
                        <Link href={item.href} className="min-w-0 flex-1 truncate font-bold text-[#244a3a] hover:text-[#a85e32] hover:underline">{item.title}</Link>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${item.state === "draft" ? "bg-[#fbf1cf] text-[#6b5013]" : "bg-[#e7efe9] text-[#326048]"}`}>{item.state === "draft" ? "Draft" : "Done"}</span>
                        {group.key === "whiteboard" && boardsUsedByUpdates.has(item.id) ? <span className="shrink-0 text-[10px] font-bold text-[#607066]">Used by a weekly update</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">Everything is linked to a teaching.</p>
          )}
        </section>
      </div>
    </main>
  );
}
