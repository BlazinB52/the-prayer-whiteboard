import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/supabase/admin";
import { TeachingImportForm } from "./import-form";

export const metadata: Metadata = {
  title: "Import Teaching from Word",
  robots: { index: false, follow: false },
};

export default async function ImportTeachingPage() {
  await requireAdmin();

  return (
    <main className="admin-shell">
      <div className="mx-auto max-w-3xl">
        <Link href="/admin/teachings" className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Back to Teachings</Link>
        <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#243d31]">Import Teaching from Word</h1>
        <p className="mt-3 text-sm text-[#607066]">Upload a Word document prepared to the Teaching DOCX Import Format Rules. The whole document is checked and previewed before anything is saved, and the result is a private draft you finish on the edit page.</p>
        <div className="mt-8">
          <TeachingImportForm />
        </div>
      </div>
    </main>
  );
}
