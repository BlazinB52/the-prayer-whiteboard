import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Devotionals",
  robots: { index: false, follow: false },
};

type AssociatedTeaching = { id: string; title: string };

function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}

export default async function AdminDevotionalsPage() {
  const { supabase } = await requireAdmin();
  const { data: devotionals, error: devotionalsError } = await supabase
    .from("teaching_devotionals")
    .select("id, teaching_id, slug, title, status, published_at, updated_at")
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

  return (
    <main className="admin-shell">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-5 border-b border-[#284a3b]/10 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/admin" className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Back to dashboard</Link>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#243d31]">Devotionals</h1>
            <p className="mt-3 text-sm text-[#607066]">Create, import, preview, and publish 7-day devotionals for teachings.</p>
          </div>
          <Link href="/admin/teachings" className="admin-primary-button inline-flex items-center justify-center"><span>Create New Devotional</span></Link>
        </header>

        {devotionals?.length ? (
          <section className="grid gap-5 py-10 sm:grid-cols-2">
            {devotionals.map((devotional) => {
              const associatedTeachings = teachingAssociationsByDevotionalId.get(devotional.id) ?? [];
              const managementTeachingId = associatedTeachings[0]?.id ?? devotional.teaching_id;
              return (
                <article key={devotional.id} className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-6 shadow-lg shadow-[#4d5f52]/8">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h2 className="text-2xl font-extrabold text-[#243d31]">{devotional.title}</h2>
                    <span className="rounded-full bg-[#e7efe9] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#326048]">{devotional.status}</span>
                  </div>
                  <p className="mt-5 text-sm text-[#607066]">Published: <span className="font-bold text-[#385245]">{devotional.published_at ? formatDate(devotional.published_at) : "Not published"}</span></p>
                  <div className="mt-5 border-t border-[#284a3b]/10 pt-4">
                    <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#607066]">Used by</p>
                    {associatedTeachings.length ? (
                      <ul className="mt-2 grid gap-1 text-sm font-bold text-[#385245]">
                        {associatedTeachings.map((teaching) => <li key={teaching.id}>{teaching.title}</li>)}
                      </ul>
                    ) : <p className="mt-2 text-sm text-[#607066]">No associated teaching</p>}
                  </div>
                  <div className="mt-6 flex flex-wrap items-center gap-4">
                    <Link href={`/admin/teachings/${managementTeachingId}/devotional`} className="inline-flex font-extrabold text-[#9d5a2f] hover:text-[#a85e32]">Manage devotional</Link>
                    <Link href={`/admin/teachings/${managementTeachingId}/devotional/preview`} className="inline-flex font-extrabold text-[#9d5a2f] hover:text-[#a85e32]">Preview devotional</Link>
                    {devotional.status === "published" && devotional.slug ? <Link href={`/devotionals/${devotional.slug}`} className="inline-flex font-extrabold text-[#9d5a2f] hover:text-[#a85e32]">View public devotional</Link> : null}
                  </div>
                </article>
              );
            })}
          </section>
        ) : (
          <section className="max-w-2xl py-16">
            <h2 className="text-2xl font-extrabold text-[#243d31]">No devotionals yet</h2>
            <p className="mt-4 leading-7 text-[#607066]">Choose a teaching to create its first 7-day devotional.</p>
            <Link href="/admin/teachings" className="admin-primary-button mt-6 inline-flex items-center justify-center"><span>Create New Devotional</span></Link>
          </section>
        )}
      </div>
    </main>
  );
}
