import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Devotionals",
  robots: { index: false, follow: false },
};

function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

export default async function AdminDevotionalsPage() {
  const { supabase } = await requireAdmin();
  const [{ data: teachings, error: teachingsError }, { data: devotionals, error: devotionalsError }] = await Promise.all([
    supabase
      .from("teachings")
      .select("id, slug, title, status, gathering_date, updated_at")
      .in("status", ["draft", "published"])
      .order("gathering_date", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false }),
    supabase
      .from("teaching_devotionals")
      .select("id, teaching_id, slug, title, status, published_at, updated_at"),
  ]);

  if (teachingsError || devotionalsError) {
    return <main className="admin-shell"><p className="text-sm font-bold text-[#a2472c]">Devotionals could not be loaded.</p></main>;
  }

  const devotionalsByTeachingId = new Map((devotionals ?? []).map((devotional) => [devotional.teaching_id, devotional]));

  return (
    <main className="admin-shell">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-5 border-b border-[#284a3b]/10 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/admin" className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Back to dashboard</Link>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#243d31]">Devotionals</h1>
            <p className="mt-3 text-sm text-[#607066]">Create, import, preview, and publish 7-day devotionals for teachings.</p>
          </div>
          <Link href="/admin/teachings" className="admin-secondary-button inline-flex items-center justify-center">All Teachings</Link>
        </header>

        {teachings?.length ? (
          <section className="grid gap-5 py-10 sm:grid-cols-2">
            {teachings.map((teaching) => {
              const devotional = devotionalsByTeachingId.get(teaching.id);
              return (
                <article key={teaching.id} className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-6 shadow-lg shadow-[#4d5f52]/8">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h2 className="text-2xl font-extrabold text-[#243d31]">{teaching.title}</h2>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-[#e7efe9] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#326048]">{teaching.status}</span>
                      <span className="rounded-full bg-[#eee7da] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#5d4d32]">{devotional?.status ?? "no devotional"}</span>
                    </div>
                  </div>
                  <dl className="mt-6 grid gap-3 text-sm text-[#607066]">
                    <div className="flex justify-between gap-4"><dt>Gathering date</dt><dd className="font-bold text-[#385245]">{formatDate(teaching.gathering_date)}</dd></div>
                    <div className="flex justify-between gap-4"><dt>Devotional title</dt><dd className="text-right font-bold text-[#385245]">{devotional?.title ?? "Not created"}</dd></div>
                    <div className="flex justify-between gap-4"><dt>Published</dt><dd className="font-bold text-[#385245]">{devotional?.published_at ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(devotional.published_at)) : "Not published"}</dd></div>
                  </dl>
                  <div className="mt-6 flex flex-wrap items-center gap-4">
                    <Link href={`/admin/teachings/${teaching.id}/devotional`} className="inline-flex font-extrabold text-[#9d5a2f] hover:text-[#a85e32]">Manage devotional</Link>
                    <Link href={`/admin/teachings/${teaching.id}/edit`} className="inline-flex font-extrabold text-[#9d5a2f] hover:text-[#a85e32]">Edit teaching</Link>
                    {teaching.status === "published" && devotional?.status === "published" && devotional.slug ? <Link href={`/devotionals/${devotional.slug}`} className="inline-flex font-extrabold text-[#9d5a2f] hover:text-[#a85e32]">View public devotional</Link> : null}
                  </div>
                </article>
              );
            })}
          </section>
        ) : (
          <section className="max-w-2xl py-16">
            <h2 className="text-2xl font-extrabold text-[#243d31]">No teachings yet</h2>
            <p className="mt-4 leading-7 text-[#607066]">Create a teaching before adding a 7-day devotional.</p>
          </section>
        )}
      </div>
    </main>
  );
}
