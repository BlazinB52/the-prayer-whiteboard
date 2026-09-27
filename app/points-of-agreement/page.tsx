import type { Metadata } from "next";
import { ArrowRight, HeartHandshake } from "lucide-react";
import { PublicFooter } from "@/app/public-footer";
import { formatInlineText } from "@/app/formatted-text";
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
          <p className="mt-4 max-w-3xl text-lg font-bold leading-8 text-[#52645a]">{formatInlineText(guideSettings.subtitle)}</p>
          <blockquote className="mt-8 border-l-4 border-[#d2a34f] pl-5 text-lg italic leading-8 text-[#4d5f52]">
            <p>{formatInlineText(guideSettings.opening_scripture)}</p>
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
          <div className="mt-8 space-y-5 sm:mt-10 sm:space-y-6">
            {publicPoints.map((point, index) => (
              <section key={`${point.display_order}-${point.point_of_agreement}`} className="rounded-[1.5rem] border border-[#284a3b]/20 bg-[#fffdf8] p-5 shadow-lg shadow-[#4d5f52]/10 sm:p-8">
                <p className="text-sm font-black uppercase leading-snug tracking-[0.1em] text-[#875624] sm:text-base">
                  FOCUS {index + 1}: {point.point_of_agreement}
                </p>
                <GuideField label="SCRIPTURE" value={point.scripture} variant="scripture" />
                <GuideField label="TARGET" value={point.target} variant="target" />
                <GuideField label="DECREE" value={point.decree} variant="decree" />
                {point.additional_direction ? <GuideField label="ADDITIONAL DIRECTION" value={point.additional_direction} variant="direction" /> : null}
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
            <p>{formatInlineText(guideSettings.footer_quotation)}</p>
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

function GuideField({ label, value, variant }: { label: string; value: string; variant: "scripture" | "target" | "decree" | "direction" }) {
  const bodyClassName = {
    scripture: "mt-2 rounded-2xl border-l-4 border-[#c99a52] bg-[#fff6e4] px-4 py-3 text-[#3f4f45] shadow-inner shadow-[#8b6531]/5 sm:px-5 sm:py-4 italic",
    target: "mt-2 px-1 text-[#52645a]",
    decree: "mt-2 rounded-2xl border-l-4 border-[#244a3a] bg-[#eaf2ec] px-4 py-3 text-[#31483b] shadow-inner shadow-[#244a3a]/5 sm:px-5 sm:py-4",
    direction: "mt-2 rounded-2xl border border-[#d2a34f]/25 bg-[#fffaf0] px-4 py-3 text-[#5b6a61] sm:px-5",
  }[variant];

  return (
    <div className={variant === "target" ? "mt-4 sm:mt-5" : "mt-5 sm:mt-6"}>
      <h2 className="text-xs font-black uppercase tracking-[0.18em] text-[#243d31]">{label}:</h2>
      <div className={`space-y-3 whitespace-pre-wrap break-words text-base font-normal leading-7 ${bodyClassName}`}>{formatInlineText(value)}</div>
    </div>
  );
}
