import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Devotionals",
  robots: { index: false, follow: false },
};

type AssociatedTeaching = { id: string; title: string };

type DevotionalRow = {
  id: string;
  teaching_id: string | null;
  title: string;
  status: string;
  published_at: string | null;
  associatedTeachings: AssociatedTeaching[];
};

function formatDate(value: string | null) {
  if (!value) return "Not published";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}

function DevotionalGroup({ heading, id, devotionals, emptyText }: { heading: string; id: string; devotionals: DevotionalRow[]; emptyText: string }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="border-b border-[#284a3b]/10 pb-3 text-2xl font-extrabold text-[#243d31]">
        {heading} <span className="text-sm font-bold text-[#607066]">({devotionals.length})</span>
      </h2>
      {devotionals.length ? (
        <ul className="divide-y divide-[#284a3b]/10">
          {devotionals.map((devotional) => {
            // Falls back to the legacy owner column, which is nullable since
            // 20260923000000. With no teaching at either level the devotional
            // is standalone and is managed through its own route rather than
            // through a teaching that does not exist.
            const managementTeachingId = devotional.associatedTeachings[0]?.id ?? devotional.teaching_id ?? null;
            const manageHref = managementTeachingId
              ? `/admin/teachings/${managementTeachingId}/devotional`
              : `/admin/devotionals/${devotional.id}`;
            const usedBy = devotional.associatedTeachings.length
              ? devotional.associatedTeachings.map((teaching) => teaching.title).join(", ")
              : "No associated teaching";
            return (
              <li key={devotional.id}>
                <Link href={manageHref} className="flex min-h-12 items-center gap-3 px-2 py-2 transition hover:bg-[#e7efe9]/60">
                  <span className="min-w-0 flex-1 truncate font-extrabold text-[#243d31]">{devotional.title}</span>
                  <span className="hidden max-w-[16rem] truncate text-sm text-[#607066] md:inline">{usedBy}</span>
                  <span className="rounded-full bg-[#e7efe9] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#326048]">{devotional.status}</span>
                  <span className="hidden w-28 shrink-0 text-right text-sm text-[#607066] sm:inline">{formatDate(devotional.published_at)}</span>
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

export default async function AdminDevotionalsPage() {
  const { supabase } = await requireAdmin();
  const { data: devotionals, error: devotionalsError } = await supabase
    .from("teaching_devotionals")
    .select("id, teaching_id, slug, title, language, status, published_at, updated_at")
    .order("updated_at", { ascending: false });

  if (devotionalsError) {
    return <main className="admin-shell"><p className="text-sm font-bold text-[#a2472c]">Devotionals could not be loaded.</p></main>;
  }

  const devotionalIds = (devotionals ?? []).map((devotional) => devotional.id);
  const { data: assignments, error: assignmentsError } = devotionalIds.length
    ? await supabase.from("teaching_devotional_assignments").select("teaching_id, devotional_id").in("devotional_id", devotionalIds)
    : { data: [], error: null };

  if (assignmentsError) {
    return <main className="admin-shell"><p className="text-sm font-bold text-[#a2472c]">Devotionals could not be loaded.</p></main>;
  }

  const teachingIds = [...new Set((assignments ?? []).map((assignment) => assignment.teaching_id))];
  const { data: teachings, error: teachingsError } = teachingIds.length
    ? await supabase.from("teachings").select("id, title").in("id", teachingIds)
    : { data: [], error: null };

  if (teachingsError) {
    return <main className="admin-shell"><p className="text-sm font-bold text-[#a2472c]">Devotionals could not be loaded.</p></main>;
  }

  const teachingsById = new Map((teachings ?? []).map((teaching) => [teaching.id, teaching]));
  const teachingAssociationsByDevotionalId = new Map<string, AssociatedTeaching[]>();
  for (const assignment of assignments ?? []) {
    const teaching = teachingsById.get(assignment.teaching_id);
    if (!teaching) continue;
    const current = teachingAssociationsByDevotionalId.get(assignment.devotional_id) ?? [];
    current.push(teaching);
    teachingAssociationsByDevotionalId.set(assignment.devotional_id, current);
  }

  const rows = (devotionals ?? []).map((devotional) => ({
    language: devotional.language,
    row: {
      id: devotional.id,
      teaching_id: devotional.teaching_id,
      title: devotional.title,
      status: devotional.status,
      published_at: devotional.published_at,
      associatedTeachings: teachingAssociationsByDevotionalId.get(devotional.id) ?? [],
    } satisfies DevotionalRow,
  }));

  return (
    <main className="admin-shell">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-5 border-b border-[#284a3b]/10 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/admin" className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Back to dashboard</Link>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#243d31]">Devotionals</h1>
            <p className="mt-3 text-sm text-[#607066]">Create, import, preview, and publish 7-day devotionals for teachings.</p>
          </div>
          <Link href="/admin/devotionals/new" className="admin-primary-button inline-flex items-center justify-center"><span>Create New Devotional</span></Link>
        </header>

        {rows.length ? (
          <div className="space-y-10 py-10">
            <DevotionalGroup heading="English" id="devotionals-en" devotionals={rows.filter((item) => item.language !== "es").map((item) => item.row)} emptyText="No English devotionals yet." />
            <DevotionalGroup heading="Español" id="devotionals-es" devotionals={rows.filter((item) => item.language === "es").map((item) => item.row)} emptyText="Aún no hay devocionales en español." />
          </div>
        ) : (
          <section className="max-w-2xl py-16">
            <h2 className="text-2xl font-extrabold text-[#243d31]">No devotionals yet</h2>
            <p className="mt-4 leading-7 text-[#607066]">Create a 7-day devotional on its own, then attach it to a teaching whenever you are ready.</p>
            <Link href="/admin/devotionals/new" className="admin-primary-button mt-6 inline-flex items-center justify-center"><span>Create New Devotional</span></Link>
          </section>
        )}
      </div>
    </main>
  );
}
