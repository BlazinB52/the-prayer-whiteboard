import type { Metadata } from "next";
import Link from "next/link";
import { createStandaloneDevotional } from "@/app/admin/teachings/devotional-actions";
import { requireAdmin } from "@/lib/supabase/admin";
import { CreateStandaloneDevotionalForm } from "./create-standalone-devotional-form";

export const metadata: Metadata = {
  title: "New Devotional",
  robots: { index: false, follow: false },
};

export default async function NewDevotionalPage() {
  await requireAdmin();

  return (
    <main className="admin-shell">
      <div className="mx-auto max-w-2xl">
        <Link href="/admin/devotionals" className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Back to devotionals</Link>
        <header className="mt-4 border-b border-[#284a3b]/10 pb-8">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">New Devotional</p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-[#243d31]">Create a 7-Day Devotional</h1>
          <p className="mt-3 text-sm leading-6 text-[#607066]">
            This devotional is created on its own, with no teaching attached. You will go straight to the seven-day
            workspace next, where you can write or import the content. Attach it to a teaching whenever you are ready.
          </p>
        </header>

        <section className="mt-8 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-6">
          <h2 className="text-2xl font-extrabold text-[#243d31]">Series Information</h2>
          <CreateStandaloneDevotionalForm action={createStandaloneDevotional} />
        </section>

        <p className="mt-6 text-sm leading-6 text-[#607066]">
          A devotional becomes public only once it is assigned to a teaching and both are published. Assign it from that
          teaching&apos;s devotional page under <Link href="/admin/teachings" className="font-extrabold text-[#9d5a2f] hover:text-[#a85e32]">Teachings</Link>.
        </p>
      </div>
    </main>
  );
}
