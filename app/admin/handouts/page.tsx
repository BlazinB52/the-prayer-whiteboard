import type { Metadata } from "next";
import Link from "next/link";
import { TeachingDateLabel } from "@/app/teaching-date-label";
import { requireAdmin } from "@/lib/supabase/admin";
import { loadTeachingChoices, teachingChoiceLabel } from "../teaching-choice";
import { createHandout } from "./actions";

export const metadata: Metadata = {
  title: "Handouts",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type HandoutRow = {
  id: string;
  title: string;
  gathering_date: string | null;
  teaching_id: string | null;
  language: "en" | "es";
  status: "draft" | "published";
  sent_for_review_at: string | null;
  content: unknown;
  created_at: string;
};

function HandoutList({ heading, items, emptyText, teachingTitles }: { heading: string; items: HandoutRow[]; emptyText: string; teachingTitles: Map<string, string> }) {
  return (
    <section className="py-7">
      <h2 className="text-xl font-extrabold text-[#243d31]">
        {heading} <span className="text-sm font-bold text-[#607066]">({items.length})</span>
      </h2>
      {items.length ? (
        <ul className="mt-3 divide-y divide-[#284a3b]/10 rounded-xl border border-[#284a3b]/10 bg-[#fffdf8]">
          {items.map((handout) => {
            const hasDraft = Array.isArray(handout.content) && handout.content.length > 0;
            const state =
              handout.status === "published"
                ? { label: "Published", style: "bg-[#e7efe9] text-[#326048]" }
                : handout.sent_for_review_at
                  ? { label: "With Content Managers", style: "bg-[#e8f0fe] text-[#1a4fb4]" }
                  : hasDraft
                    ? { label: "Draft", style: "bg-[#eee7da] text-[#6b5a3a]" }
                    : { label: "Needs a draft", style: "bg-[#fbf4e1] text-[#6b5013]" };
            return (
              <li key={handout.id}>
                <Link href={`/admin/handouts/${handout.id}`} className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition hover:bg-[#e7efe9]/60">
                  <span className="min-w-0 flex-1 truncate font-extrabold text-[#243d31]">{handout.title}{handout.language === "es" ? <span className="ml-2 rounded-full bg-[#eee7da] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#6b5a3a]">Español</span> : null}</span>
                  {handout.gathering_date ? <TeachingDateLabel date={handout.gathering_date} /> : <span className="text-xs font-bold text-[#a2472c]">Needs a date</span>}
                  <span className={`max-w-56 truncate text-xs font-bold ${handout.teaching_id ? "text-[#326048]" : "text-[#a2472c]"}`}>
                    {handout.teaching_id ? `Teaching: ${teachingTitles.get(handout.teaching_id) ?? "linked"}` : "Needs a teaching"}
                  </span>
                  <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${state.style}`}>{state.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-4 text-sm text-[#607066]">{emptyText}</p>
      )}
    </section>
  );
}

export default async function AdminHandoutsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const flags = await searchParams;
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("teaching_handouts")
    .select("id, title, gathering_date, teaching_id, language, status, sent_for_review_at, content, created_at")
    .order("gathering_date", { ascending: false, nullsFirst: true })
    .order("created_at", { ascending: false });
  const handouts = (data as HandoutRow[] | null) ?? [];
  const teachings = await loadTeachingChoices(supabase);
  const teachingTitles = new Map(teachings.map((teaching) => [teaching.id, teachingChoiceLabel(teaching)]));

  return (
    <main className="admin-shell">
      <div className="mx-auto max-w-5xl">
        <Link href="/admin" className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Back to dashboard</Link>
        <header className="mt-4 flex flex-col gap-4 border-b border-[#284a3b]/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-[#243d31]">Handouts</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#607066]">
              Create a handout, enter its title and teaching date, and upload the Word draft. Then send it to the Content Managers to proof, and publish it by uploading the final PDF. An English handout can be translated into an Español handout from its own page. Published handouts appear in the public PDF library (Printable PDF Links).
            </p>
          </div>
          <form action={createHandout} className="flex flex-wrap items-center gap-3">
            <select name="language" defaultValue="en" aria-label="Language" className="admin-input !w-auto">
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
            <button type="submit" className="admin-primary-button"><span>Create new handout</span></button>
          </form>
        </header>

        {flags.error ? <p role="alert" className="mt-6 text-sm font-bold text-[#a2472c]">The handout could not be created. Try again.</p> : null}

        {error ? (
          <p role="alert" className="mt-6 text-sm font-bold text-[#a2472c]">Handouts could not be loaded. The database update for handouts may not be applied yet.</p>
        ) : (
          <>
            <HandoutList heading="English" items={handouts.filter((handout) => handout.language !== "es")} emptyText="No English handouts yet. Press Create new handout." teachingTitles={teachingTitles} />
            <HandoutList heading="Español" items={handouts.filter((handout) => handout.language === "es")} emptyText="No Español handouts yet. Translate an English handout, or create one in Español." teachingTitles={teachingTitles} />
          </>
        )}
      </div>
    </main>
  );
}
