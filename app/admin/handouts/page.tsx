import type { Metadata } from "next";
import Link from "next/link";
import { TeachingDateLabel } from "@/app/teaching-date-label";
import { requireAdmin } from "@/lib/supabase/admin";
import { loadTeachingChoices } from "../teaching-choice";
import { UploadSection } from "./upload-section";

export const metadata: Metadata = {
  title: "Handouts",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type HandoutRow = {
  id: string;
  title: string;
  gathering_date: string;
  teaching_id: string | null;
  sent_for_review_at: string | null;
  created_at: string;
};

export default async function AdminHandoutsPage() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("teaching_handouts")
    .select("id, title, gathering_date, teaching_id, sent_for_review_at, created_at")
    .order("gathering_date", { ascending: false })
    .order("created_at", { ascending: false });
  const handouts = (data as HandoutRow[] | null) ?? [];
  const teachings = await loadTeachingChoices(supabase);
  const teachingTitles = new Map(teachings.map((teaching) => [teaching.id, teaching.title]));

  return (
    <main className="admin-shell">
      <div className="mx-auto max-w-5xl">
        <Link href="/admin" className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Back to dashboard</Link>
        <header className="mt-4 border-b border-[#284a3b]/10 pb-6">
          <h1 className="text-3xl font-extrabold tracking-tight text-[#243d31]">Handouts</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#607066]">
            Upload the handout text from Word, send it to the Content Managers to proof, and accept or reject their changes. A handout is never published on the site: when the review is done you copy the final text into the Word handout yourself.
          </p>
        </header>

        {error ? (
          <p role="alert" className="mt-6 text-sm font-bold text-[#a2472c]">Handouts could not be loaded. The database update for handouts may not be applied yet.</p>
        ) : (
          <>
            <UploadSection teachings={teachings} />
            <section className="py-7">
              <h2 className="text-xl font-extrabold text-[#243d31]">
                Handouts <span className="text-sm font-bold text-[#607066]">({handouts.length})</span>
              </h2>
              {handouts.length ? (
                <ul className="mt-3 divide-y divide-[#284a3b]/10 rounded-xl border border-[#284a3b]/10 bg-[#fffdf8]">
                  {handouts.map((handout) => (
                    <li key={handout.id}>
                      <Link href={`/admin/handouts/${handout.id}`} className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition hover:bg-[#e7efe9]/60">
                        <span className="min-w-0 flex-1 truncate font-extrabold text-[#243d31]">{handout.title}</span>
                        <TeachingDateLabel date={handout.gathering_date} />
                        <span className={`max-w-56 truncate text-xs font-bold ${handout.teaching_id ? "text-[#326048]" : "text-[#a2472c]"}`}>
                          {handout.teaching_id ? `Teaching: ${teachingTitles.get(handout.teaching_id) ?? "linked"}` : "Needs a teaching"}
                        </span>
                        <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${handout.sent_for_review_at ? "bg-[#e8f0fe] text-[#1a4fb4]" : "bg-[#eee7da] text-[#6b5a3a]"}`}>
                          {handout.sent_for_review_at ? "With Content Managers" : "Not sent"}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-4 text-sm text-[#607066]">No handouts yet. Upload one above.</p>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
