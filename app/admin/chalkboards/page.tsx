import type { Metadata } from "next";
import Link from "next/link";
import { ChalkboardForm } from "./chalkboard-form";
import { getChalkboardPreviewUrl } from "./actions";
import { loadChalkboardAssignments } from "./assignments";
import { requireAdmin } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Chalkboard Library",
  robots: { index: false, follow: false },
};

type ChalkboardRow = {
  id: string;
  name: string;
  date: string | null;
  assignmentCount: number;
  includeInPrint: boolean;
  previewUrl: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}

function ChalkboardGroup({ heading, id, rows, emptyText }: { heading: string; id: string; rows: ChalkboardRow[]; emptyText: string }) {
  return (
    <section aria-labelledby={id} className="mt-8">
      <h3 id={id} className="border-b border-[#284a3b]/10 pb-3 text-xl font-extrabold text-[#243d31]">
        {heading} <span className="text-sm font-bold text-[#607066]">({rows.length})</span>
      </h3>
      {rows.length ? (
        <ul className="divide-y divide-[#284a3b]/10">
          {rows.map((row) => (
            <li key={row.id}>
              <Link href={`/admin/chalkboards/${row.id}`} className="flex min-h-14 items-center gap-3 px-2 py-2 transition hover:bg-[#e7efe9]/60">
                <span className="flex h-12 w-9 shrink-0 items-center justify-center overflow-hidden rounded bg-[#eee7da]">
                  {row.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.previewUrl} alt="" className="block h-full w-full object-contain" />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1 truncate font-extrabold text-[#243d31]">{row.name}</span>
                <span className="rounded-full bg-[#e7efe9] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#326048]">
                  {row.assignmentCount ? `${row.assignmentCount} assigned` : "Unassigned"}
                </span>
                {row.includeInPrint ? null : <span className="hidden rounded-full bg-[#f3e4dc] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#a2472c] sm:inline">No print</span>}
                <span className="hidden w-28 shrink-0 text-right text-sm text-[#607066] sm:inline">{formatDate(row.date)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-4 text-sm text-[#607066]">{emptyText}</p>
      )}
    </section>
  );
}

export default async function AdminChalkboardsPage() {
  const { supabase } = await requireAdmin();
  const [assignmentsByAsset, { data: assets, error }] = await Promise.all([
    loadChalkboardAssignments(supabase),
    supabase
      .from("chalkboard_assets")
      .select("id, title, canonical_name, language, chalkboard_date, website_storage_path, include_in_print")
      .eq("is_current_version", true)
      .eq("status", "active")
      .order("chalkboard_date", { ascending: false })
      .order("canonical_name", { ascending: true }),
  ]);

  const rows = await Promise.all((assets ?? []).map(async (asset) => ({
    language: asset.language,
    row: {
      id: asset.id,
      name: asset.canonical_name ?? asset.title,
      date: asset.chalkboard_date,
      assignmentCount: (assignmentsByAsset.get(asset.id) ?? []).length,
      includeInPrint: asset.include_in_print,
      previewUrl: asset.website_storage_path ? await getChalkboardPreviewUrl(asset.website_storage_path) : null,
    } satisfies ChalkboardRow,
  })));

  return (
    <main className="admin-shell">
      <div className="mx-auto max-w-6xl">
        <Link href="/admin" className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Back to Dashboard</Link>
        <div className="mt-4 max-w-3xl">
          <h1 className="text-4xl font-extrabold tracking-tight text-[#243d31]">Chalkboard Library</h1>
          <p className="mt-3 text-sm text-[#607066]">Upload reusable chalkboards independently, then attach one optional chalkboard to each teaching.</p>
        </div>
        <section className="py-8"><ChalkboardForm /></section>
        <section className="border-t border-[#284a3b]/10 py-8">
          <h2 className="text-2xl font-extrabold text-[#243d31]">Existing chalkboards</h2>
          {error ? <p className="mt-4 text-sm font-bold text-[#a2472c]">Chalkboards could not be loaded.</p> : null}
          {rows.length ? (
            <>
              <ChalkboardGroup heading="English" id="chalkboards-en" rows={rows.filter((item) => item.language !== "es").map((item) => item.row)} emptyText="No English chalkboards yet." />
              <ChalkboardGroup heading="Español (El Salvador)" id="chalkboards-es" rows={rows.filter((item) => item.language === "es").map((item) => item.row)} emptyText="Aún no hay pizarras en español." />
            </>
          ) : <p className="mt-4 text-sm text-[#607066]">No chalkboards have been uploaded yet.</p>}
        </section>
      </div>
    </main>
  );
}
