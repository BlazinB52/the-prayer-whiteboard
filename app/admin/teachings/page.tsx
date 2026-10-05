import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Teachings",
  robots: { index: false, follow: false },
};

function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

type TeachingRow = {
  id: string;
  title: string;
  teaching_type: string | null;
  gathering_date: string | null;
  status: string;
  is_featured: boolean;
  updated_at: string;
};

function TeachingGroup({ heading, teachings, emptyText }: { heading: string; teachings: TeachingRow[]; emptyText: string }) {
  return (
    <section aria-labelledby={`teachings-${heading}`}>
      <h2 id={`teachings-${heading}`} className="border-b border-[#284a3b]/10 pb-3 text-2xl font-extrabold text-[#243d31]">
        {heading} <span className="text-sm font-bold text-[#607066]">({teachings.length})</span>
      </h2>
      {teachings.length ? (
        <ul className="divide-y divide-[#284a3b]/10">
          {teachings.map((teaching) => {
            const row = (
              <>
                <span className="min-w-0 flex-1 truncate font-extrabold text-[#243d31]">{teaching.title}</span>
                {teaching.is_featured ? <span className="rounded-full bg-[#f0cb83] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#20382e]">Featured</span> : null}
                {teaching.teaching_type === "deep_dive" ? <span className="rounded-full bg-[#20382e] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#f0cb83]">Deep Dive</span> : null}
                <span className="rounded-full bg-[#e7efe9] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#326048]">{teaching.status}</span>
                <span className="hidden w-28 shrink-0 text-right text-sm text-[#607066] sm:inline">{formatDate(teaching.gathering_date)}</span>
              </>
            );
            return (
              <li key={teaching.id}>
                {["draft", "published"].includes(teaching.status) ? (
                  <Link href={`/admin/teachings/${teaching.id}/edit`} className="flex min-h-12 items-center gap-3 px-2 py-2 transition hover:bg-[#e7efe9]/60">{row}</Link>
                ) : (
                  <div className="flex min-h-12 items-center gap-3 px-2 py-2">{row}</div>
                )}
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

export default async function TeachingsPage({ searchParams }: { searchParams: Promise<{ espanolPublished?: string; published?: string; deepDivePublished?: string; saved?: string; unpublished?: string; deleted?: string }> }) {
  const params = await searchParams;
  const { supabase } = await requireAdmin();
  const { data: teachings, error } = await supabase
    .from("teachings")
    .select("id, title, teaching_type, language, gathering_date, status, is_featured, updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    return <main className="admin-shell"><p className="text-sm font-bold text-[#a2472c]">Teachings could not be loaded.</p></main>;
  }

  return (
    <main className="admin-shell">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-5 border-b border-[#284a3b]/10 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/admin" className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Back to dashboard</Link>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#243d31]">Teachings</h1>
            <p className="mt-3 text-sm text-[#607066]">Manage draft and published teachings.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/admin/teachings/import" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#244a3a] px-5 font-extrabold text-[#244a3a] transition hover:bg-[#e7efe9]">Import from Word</Link>
            <Link href="/admin/teachings/new" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#244a3a] px-5 font-extrabold text-white transition hover:bg-[#1d3d30] hover:text-white"><span className="!text-white">New Teaching</span></Link>
          </div>
        </header>

        {params.saved === "1" ? <p role="status" className="mt-6 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">Teaching saved successfully.</p> : null}
        {params.published === "1" ? <p role="status" className="mt-6 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">Teaching published and featured on the homepage.</p> : null}
        {params.espanolPublished === "1" ? <p role="status" className="mt-6 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">Teaching published to the Español homepage (/espanol). The English homepage was not changed and no email was sent.</p> : null}
        {params.deepDivePublished === "1" ? <p role="status" className="mt-6 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">Deep Dive published to the Deep Dives collection.</p> : null}
        {params.unpublished === "1" ? <p role="status" className="mt-6 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">Teaching unpublished and returned to draft.</p> : null}
        {params.deleted === "1" ? <p role="status" className="mt-6 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">Teaching permanently deleted.</p> : null}

        {teachings?.length ? (
          <div className="space-y-10 py-10">
            <TeachingGroup heading="English" teachings={teachings.filter((teaching) => teaching.language !== "es")} emptyText="No English teachings yet." />
            <TeachingGroup heading="Español" teachings={teachings.filter((teaching) => teaching.language === "es")} emptyText="Aún no hay enseñanzas en español." />
          </div>
        ) : (
          <section className="max-w-2xl py-16">
            <h2 className="text-2xl font-extrabold text-[#243d31]">No database teachings yet</h2>
            <p className="mt-4 leading-7 text-[#607066]">The existing Aliyah teaching page is still hard-coded and has not yet been moved into the database. Create a draft here when you are ready to begin metadata management.</p>
          </section>
        )}

      </div>
    </main>
  );
}
