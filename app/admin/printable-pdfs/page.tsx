import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/supabase/admin";
import { PrintablePdfManager } from "./printable-pdf-form";

export const metadata: Metadata = {
  title: "Teaching PDF Links",
  robots: { index: false, follow: false },
};

type TeachingRow = {
  id: string;
  title: string;
  gathering_date: string | null;
};

type PrintablePdfLinkRow = {
  teaching_id: string;
  printable_pdf_url: string;
  updated_at: string;
};

export default async function AdminPrintablePdfsPage() {
  const { supabase } = await requireAdmin();

  const [{ data: teachings, error: teachingsError }, { data: links, error: linksError }] = await Promise.all([
    supabase
      .from("teachings")
      .select("id, title, gathering_date")
      .order("gathering_date", { ascending: false, nullsFirst: false })
      .order("title", { ascending: true }),
    supabase
      .from("teaching_printable_pdf_links")
      .select("teaching_id, printable_pdf_url, updated_at")
      .order("updated_at", { ascending: false }),
  ]);

  return (
    <main className="admin-shell">
      <div className="mx-auto max-w-6xl">
        <Link href="/admin" className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Back to dashboard</Link>
        <header className="mt-4 border-b border-[#284a3b]/10 pb-6">
          <h1 className="text-3xl font-extrabold tracking-tight text-[#243d31]">Teaching Printable PDF Link</h1>
          <p className="mt-2 text-sm text-[#607066]">Assign and maintain printable PDF links for existing teachings.</p>
        </header>

        {teachingsError || linksError ? (
          <p className="mt-6 text-sm font-bold text-[#a2472c]">Printable PDF links could not be loaded.</p>
        ) : (
          <PrintablePdfManager
            teachings={(teachings as TeachingRow[] | null) ?? []}
            assignments={(links as PrintablePdfLinkRow[] | null) ?? []}
          />
        )}
      </div>
    </main>
  );
}
