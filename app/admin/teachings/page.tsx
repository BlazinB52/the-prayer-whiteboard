import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/supabase/admin";
import { unpublishTeaching } from "./actions";
import { UnpublishButton } from "./unpublish-button";

export const metadata: Metadata = {
  title: "Teachings",
  robots: { index: false, follow: false },
};

function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

export default async function TeachingsPage({ searchParams }: { searchParams: Promise<{ published?: string; saved?: string; unpublished?: string }> }) {
  const params = await searchParams;
  const { supabase } = await requireAdmin();
  const { data: teachings, error } = await supabase
    .from("teachings")
    .select("id, slug, title, gathering_date, status, is_featured, updated_at")
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
            <p className="mt-3 text-sm text-[#607066]">Draft metadata for future published teachings.</p>
          </div>
          <Link href="/admin/teachings/new" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#244a3a] px-5 font-extrabold text-white transition hover:bg-[#1d3d30] hover:text-white"><span className="!text-white">New Teaching</span></Link>
        </header>

        {params.saved === "1" ? <p role="status" className="mt-6 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">Draft saved successfully.</p> : null}
        {params.published === "1" ? <p role="status" className="mt-6 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">Teaching published and featured on the homepage.</p> : null}
        {params.unpublished === "1" ? <p role="status" className="mt-6 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">Teaching unpublished and returned to draft.</p> : null}

        {teachings?.length ? (
          <section className="grid gap-5 py-10 sm:grid-cols-2">
            {teachings.map((teaching) => (
              <article key={teaching.id} className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-6 shadow-lg shadow-[#4d5f52]/8">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h2 className="text-2xl font-extrabold text-[#243d31]">{teaching.title}</h2>
                  <span className="rounded-full bg-[#e7efe9] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#326048]">{teaching.status}</span>
                </div>
                <dl className="mt-6 grid gap-3 text-sm text-[#607066]">
                  <div className="flex justify-between gap-4"><dt>Gathering date</dt><dd className="font-bold text-[#385245]">{formatDate(teaching.gathering_date)}</dd></div>
                  <div className="flex justify-between gap-4"><dt>Featured</dt><dd className="font-bold text-[#385245]">{teaching.is_featured ? "Yes" : "No"}</dd></div>
                  <div className="flex justify-between gap-4"><dt>Last updated</dt><dd className="font-bold text-[#385245]">{new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(teaching.updated_at))}</dd></div>
                </dl>
                <div className="mt-6 flex flex-wrap items-center gap-4">
                  {teaching.status === "draft" ? <Link href={`/admin/teachings/${teaching.id}/edit`} className="inline-flex font-extrabold text-[#9d5a2f] hover:text-[#a85e32]">Edit draft</Link> : null}
                  {teaching.status === "published" ? <Link href={`/admin/teachings/${teaching.id}/edit`} className="inline-flex font-extrabold text-[#9d5a2f] hover:text-[#a85e32]">Edit teaching</Link> : null}
                  {teaching.status === "published" ? <Link href={`/teachings/${teaching.slug}`} className="inline-flex font-extrabold text-[#9d5a2f] hover:text-[#a85e32]">View public teaching</Link> : null}
                </div>
                {teaching.status === "published" ? <UnpublishButton action={unpublishTeaching.bind(null, teaching.id)} /> : null}
              </article>
            ))}
          </section>
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
