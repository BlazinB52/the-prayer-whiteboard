import type { Metadata } from "next";
import type { ReactNode } from "react";
import { HeartHandshake, MessageCircleHeart } from "lucide-react";
import { PublicFooter } from "@/app/public-footer";
import { PublicHeader } from "@/app/public-header";
import { ReturnToTop } from "@/app/return-to-top";
import type { PrayerNeed, PraiseReport } from "@/lib/prayer-and-praise";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Prayer and Praise | The Whiteboard",
  description: "Join in Points of Agreement and celebrate Praise Reports & Answered Prayer.",
};

export default async function PrayerAndPraisePage() {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const [{ data: prayers, error: prayerError }, { data: praises, error: praiseError }] = await Promise.all([
    supabase
      .from("prayer_needs")
      .select("id, category, public_summary, published_at")
      .eq("status", "active")
      .gt("expires_at", now)
      .order("published_at", { ascending: false })
      .order("id", { ascending: false }),
    supabase
      .from("praise_reports")
      .select("id, category, public_summary, published_at")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .order("id", { ascending: false }),
  ]);

  return (
    <main className="min-h-screen bg-[#f7f2e8] text-[#243126]">
      <PublicHeader maxWidthClassName="max-w-5xl" />

      <article className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-16">
        <header className="max-w-3xl border-b border-[#284a3b]/15 pb-8">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Prayer and Praise</p>
          <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight text-[#243d31] sm:text-6xl">Stand together and remember His goodness.</h1>
        </header>

        <PublicSection
          id="points-of-agreement"
          icon={<HeartHandshake aria-hidden="true" size={24} />}
          title="Points of Agreement"
          description="Join in prayer for active needs presented in a privacy-conscious summary form."
          error={Boolean(prayerError)}
          empty="There are no active Points of Agreement right now."
          items={(prayers ?? []) as Pick<PrayerNeed, "id" | "category" | "public_summary">[]}
        />

        <PublicSection
          id="praise-reports"
          icon={<MessageCircleHeart aria-hidden="true" size={24} />}
          title="Praise Reports & Answered Prayer"
          description="Celebrate answered prayer and testimonies of God's faithfulness."
          error={Boolean(praiseError)}
          empty="There are no published praise reports right now."
          items={(praises ?? []) as Pick<PraiseReport, "id" | "category" | "public_summary">[]}
        />
      </article>
      <PublicFooter />
      <ReturnToTop />
    </main>
  );
}

function PublicSection({ id, icon, title, description, error, empty, items }: { id: string; icon: ReactNode; title: string; description: string; error: boolean; empty: string; items: Array<{ id: string; category: string; public_summary: string }> }) {
  return (
    <section id={id} className="scroll-mt-8 border-b border-[#284a3b]/10 py-10 last:border-b-0">
      <div className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#e8efe9] text-[#244a3a]">{icon}</span>
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-[#243d31]">{title}</h2>
          <p className="mt-3 max-w-2xl leading-7 text-[#5b6a61]">{description}</p>
        </div>
      </div>
      {error ? <p className="mt-8 rounded-xl border border-[#a2472c]/20 bg-[#fff3ed] px-4 py-3 text-sm font-bold text-[#a2472c]">This section could not be loaded.</p> : items.length ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {items.map((item) => (
            <article key={item.id} className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-6 shadow-sm shadow-[#4d5f52]/5">
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#946332]">{item.category}</p>
              <p className="mt-3 leading-7 text-[#52645a]">{item.public_summary}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-8 rounded-2xl border border-dashed border-[#284a3b]/20 bg-[#fffdf8] p-6 leading-7 text-[#607066]">{empty}</p>
      )}
    </section>
  );
}
