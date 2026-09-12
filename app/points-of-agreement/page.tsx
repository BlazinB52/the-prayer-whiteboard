import type { Metadata } from "next";
import { ArrowRight, HeartHandshake } from "lucide-react";
import { PublicFooter } from "@/app/public-footer";
import { PublicHeader } from "@/app/public-header";
import { ReturnToTop } from "@/app/return-to-top";
import {
  DEFAULT_POINTS_OF_AGREEMENT_GUIDE_SETTINGS,
  type PointsOfAgreementGuideSettings,
  type PublicPointOfAgreement,
} from "@/lib/points-of-agreement";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Prayer & Intercession Guide",
  description: "Join The Prayer Whiteboard in active Points of Agreement.",
};

export default async function PointsOfAgreementPage() {
  const supabase = await createClient();
  const [{ data: settings, error: settingsError }, { data: points, error: pointsError }] = await Promise.all([
    supabase
      .from("public_points_of_agreement_guide_settings")
      .select("title, subtitle, opening_scripture, opening_scripture_reference, footer_quotation, footer_scripture_reference")
      .maybeSingle(),
    supabase
      .from("public_points_of_agreement")
      .select("point_of_agreement, scripture, target, decree, additional_direction, display_order")
      .order("display_order", { ascending: true })
      .order("point_of_agreement", { ascending: true }),
  ]);
  const guideSettings = settingsError || !settings
    ? DEFAULT_POINTS_OF_AGREEMENT_GUIDE_SETTINGS
    : settings as PointsOfAgreementGuideSettings;
  const publicPoints = pointsError ? [] : (points ?? []) as PublicPointOfAgreement[];

  return (
    <main id="top" className="min-h-screen bg-[#f7f2e8] text-[#243126]">
      <PublicHeader maxWidthClassName="max-w-5xl" />

      <article className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-16">
        <header className="border-b border-[#284a3b]/15 pb-8">
          <p className="inline-flex items-center gap-2 rounded-full border border-[#b98243]/25 bg-[#fffaf0] px-4 py-2 text-xs font-extrabold uppercase tracking-[0.16em] text-[#875624]">
            <HeartHandshake aria-hidden="true" size={15} />
            Points of Agreement
          </p>
          <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight text-[#243d31] sm:text-6xl">{guideSettings.title}</h1>
          <p className="mt-4 max-w-3xl text-lg font-bold leading-8 text-[#52645a]">{guideSettings.subtitle}</p>
          <blockquote className="mt-8 border-l-4 border-[#d2a34f] pl-5 text-lg italic leading-8 text-[#4d5f52]">
            <p>{guideSettings.opening_scripture}</p>
            <cite className="mt-3 block text-xs not-italic font-extrabold uppercase tracking-[0.18em] text-[#946332]">
              {guideSettings.opening_scripture_reference}
            </cite>
          </blockquote>
        </header>

        {pointsError ? (
          <p className="mt-8 rounded-xl border border-[#a2472c]/20 bg-[#fff3ed] px-4 py-3 text-sm font-bold text-[#a2472c]">
            The Prayer & Intercession Guide could not be loaded.
          </p>
        ) : publicPoints.length ? (
          <div className="mt-9 space-y-5">
            {publicPoints.map((point, index) => (
              <section key={`${point.display_order}-${point.point_of_agreement}`} className="rounded-[1.5rem] border border-[#284a3b]/10 bg-[#fffdf8] p-6 shadow-sm shadow-[#4d5f52]/5 sm:p-8">
                <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">
                  FOCUS {index + 1}: {point.point_of_agreement}
                </p>
                <GuideField label="SCRIPTURE" value={point.scripture} />
                <GuideField label="TARGET" value={point.target} />
                <GuideField label="DECREE" value={point.decree} />
                {point.additional_direction ? <GuideField label="ADDITIONAL DIRECTION" value={point.additional_direction} /> : null}
              </section>
            ))}
          </div>
        ) : (
          <p className="mt-8 rounded-2xl border border-dashed border-[#284a3b]/20 bg-[#fffdf8] p-6 leading-7 text-[#607066]">
            There are no active Points of Agreement right now.
          </p>
        )}

        <footer className="mt-10 border-t border-[#284a3b]/15 pt-8">
          <blockquote className="text-lg italic leading-8 text-[#4d5f52]">
            <p>{guideSettings.footer_quotation}</p>
            <cite className="mt-3 block text-xs not-italic font-extrabold uppercase tracking-[0.18em] text-[#946332]">
              {guideSettings.footer_scripture_reference}
            </cite>
          </blockquote>
          <a href="#top" className="mt-8 inline-flex items-center gap-2 font-extrabold text-[#9d5a2f]">
            Return to top <ArrowRight aria-hidden="true" size={18} className="-rotate-90" />
          </a>
        </footer>
      </article>
      <PublicFooter />
      <ReturnToTop />
    </main>
  );
}

function GuideField({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-5">
      <h2 className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#8e673c]">{label}:</h2>
      <div className="mt-2 space-y-3 whitespace-pre-wrap leading-7 text-[#52645a]">{value}</div>
    </div>
  );
}
