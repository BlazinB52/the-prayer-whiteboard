import type { Metadata } from "next";
import Link from "next/link";
import { createTeaching } from "../actions";
import { TeachingForm } from "../teaching-form";
import { requireAdmin } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "New Teaching",
  robots: { index: false, follow: false },
};

export default async function NewTeachingPage() {
  await requireAdmin();

  return (
    <main className="admin-shell">
      <div className="mx-auto max-w-3xl">
        <Link href="/admin/teachings" className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Back to Teachings</Link>
        <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#243d31]">New Teaching</h1>
        <p className="mt-3 text-sm text-[#607066]">Start with private draft metadata. Publishing and content structure will come later.</p>
        <TeachingForm action={createTeaching} values={{ title: "", gatheringDate: "", centralTheme: "", introduction: "", summary: "" }} />
      </div>
    </main>
  );
}
