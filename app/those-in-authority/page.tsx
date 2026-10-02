import type { Metadata } from "next";
import { Landmark } from "lucide-react";
import { PublicFooter } from "@/app/public-footer";
import { PublicHeader } from "@/app/public-header";
import { createClient } from "@/lib/supabase/server";
import {
  MAX_ACTIVE_LEADERS,
  authorityPhotoUrl,
  leaderPhotoAlt,
  type PublicAuthorityLeader,
} from "@/lib/those-in-authority";
import { LeaderGrid, type LeaderCard } from "./leader-grid";

export const metadata: Metadata = {
  title: "Pray for Those in Authority",
  description: "Join The Prayer Whiteboard in praying for leaders and all who are in authority.",
  alternates: { canonical: "/those-in-authority" },
};

export default async function ThoseInAuthorityPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("public_authority_leaders")
    .select("id, name, title, photo_path, photo_alt, scripture_reference, scripture_text, prayer, display_order")
    .order("display_order", { ascending: true })
    .order("name", { ascending: true })
    .limit(MAX_ACTIVE_LEADERS);

  const leaders: LeaderCard[] = (error ? [] : ((data ?? []) as PublicAuthorityLeader[])).map((leader) => ({
    id: leader.id,
    name: leader.name,
    title: leader.title,
    photoUrl: authorityPhotoUrl(leader.photo_path),
    photoAlt: leaderPhotoAlt(leader),
    scriptureReference: leader.scripture_reference,
    scriptureText: leader.scripture_text,
    prayer: leader.prayer,
  }));

  return (
    <main className="min-h-screen bg-[#f7f2e8] text-[#243126]">
      <PublicHeader maxWidthClassName="max-w-3xl" />

      <article className="mx-auto max-w-3xl px-5 pb-12 pt-5 sm:px-8 sm:pt-10">
        <header className="text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-[#b98243]/25 bg-[#fffaf0] px-3 py-1 text-[0.65rem] font-extrabold uppercase tracking-[0.16em] text-[#875624]">
            <Landmark aria-hidden="true" size={13} />
            1 Timothy 2:1–2
          </p>
          <h1 className="mt-2 text-[1.65rem] font-extrabold leading-tight tracking-tight text-[#243d31] sm:text-4xl">
            Pray for Those in Authority
          </h1>
          <p className="mt-1 text-sm text-[#607066]">Tap a leader to read the scripture and our prayer.</p>
        </header>

        <div className="mt-5 sm:mt-8">
          {error ? (
            <p className="rounded-xl border border-[#a2472c]/20 bg-[#fff3ed] px-4 py-3 text-center text-sm font-bold text-[#a2472c]">
              The prayer list could not be loaded. Please try again shortly.
            </p>
          ) : leaders.length ? (
            <LeaderGrid leaders={leaders} />
          ) : (
            <p className="mx-auto max-w-md rounded-2xl border border-dashed border-[#284a3b]/20 bg-[#fffdf8] p-6 text-center leading-7 text-[#607066]">
              No leaders are on the prayer list right now. Please check back soon.
            </p>
          )}
        </div>
      </article>
      <PublicFooter />
    </main>
  );
}
