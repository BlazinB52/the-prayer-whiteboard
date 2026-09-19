/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  HeartHandshake,
  Layers,
  Sparkles,
} from "lucide-react";
import { PublicHeader } from "@/app/public-header";
import { PublicFooter } from "@/app/public-footer";
import { ReturnToTop } from "@/app/return-to-top";
import { EmailUpdatesCta } from "@/app/email-updates-cta";
import { formatInlineText } from "@/app/formatted-text";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createClient } from "@/lib/supabase/server";
import { selectFeaturedTeaching, type FeaturedTeachingCandidate } from "@/lib/homepage-utils";

const pageUrl = "https://theprayerwhiteboard.com";
const teachingPath = "/teachings/aliyah-israel-harvest-prayer";
const homepageNav = [
  { href: "#latest", label: "Latest Teaching" },
  { href: "/deep-dives", label: "Deep Dives" },
  { href: "/devotionals", label: "Devotionals" },
  { href: "/points-of-agreement", label: "Prayer Guide" },
  { href: "#gatherings", label: "Gatherings" },
  { href: "/subscribe", label: "Email Updates" },
];

export const metadata: Metadata = {
  title: "The Whiteboard | Prayer & Scripture",
  description:
    "A welcoming home for prayer-group teachings, points of agreement, and growing together in God's Word.",
  alternates: { canonical: pageUrl },
  robots: { index: true, follow: true },
};

const archiveDates = [
  {
    date: "August 30, 2026",
    title: "Aliyah: Israel, the Harvest & Prayer",
    description:
      "God is gathering His people, revealing Jesus, and calling the Church to pray.",
    current: true,
  },
  {
    date: "August 23, 2026",
    title: "Speaking Life and Believing God",
    description:
      "A study of faith-filled words, prayer, and agreement with God's promises.",
  },
  {
    date: "August 16, 2026",
    title: "Seeing, Hearing and Following",
    description:
      "Learning to recognize God's direction through His Word and prayer.",
  },
];

type FeaturedHomepageData = {
  teaching: FeaturedTeachingCandidate & {
    central_theme: string | null;
    introduction: string | null;
    summary: string | null;
    teaser_1_heading: string | null;
    teaser_1_text: string | null;
    teaser_2_heading: string | null;
    teaser_2_text: string | null;
    hasPublishedDevotional: boolean;
    devotionalSlug: string | null;
  };
  teasers: HomepageTeaser[];
  chalkboard: { url: string; altText: string; caption: string | null } | null;
  previousGatherings: PreviousGathering[];
};

type HomepageTeaser = {
  id: string;
  heading: string;
  text: string;
};

type PreviousGathering = {
  id: string;
  slug: string;
  title: string;
  gathering_date: string | null;
  hasPublishedDevotional?: boolean;
  devotionalSlug?: string | null;
};

type HomepageChalkboard = { url: string; altText: string; caption: string | null };
type CurrentWeeklyUpdate = { id: string; title: string; chalkboard: HomepageChalkboard | null } | null;
type ServiceRoleClient = NonNullable<ReturnType<typeof createServiceRoleClient>>;
const CHALKBOARD_SIGNED_URL_TTL_SECONDS = 60 * 60;
const fallbackHomepageChalkboard: HomepageChalkboard = {
  url: "/prayergroup/aliyah-chalkboard.jpg",
  altText: "Chalkboard teaching about Aliyah, Israel, the harvest, and prayer",
  caption: null,
};

async function retryNullable<T>(operation: () => Promise<T | null>, attempts = 2): Promise<T | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await operation();
      if (result !== null) return result;
    } catch {
      // A brief Supabase or storage interruption should not remove the homepage image.
    }

    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  return null;
}

async function getSignedChalkboard(assetId: string | null, client?: ServiceRoleClient): Promise<HomepageChalkboard | null> {
  if (!assetId) return null;
  const signer = client ?? createServiceRoleClient();
  if (!signer) return null;
  const asset = await retryNullable(async () => {
    const { data, error } = await signer
      .from("chalkboard_assets")
      .select("id, alt_text, caption, website_storage_path, storage_path, is_current_version, status")
      .eq("id", assetId)
      .eq("is_current_version", true)
      .eq("status", "active")
      .maybeSingle();
    return error ? null : data;
  });

  if (!asset) return null;
  const paths = [asset.website_storage_path, asset.storage_path].filter((path): path is string => Boolean(path));
  for (const path of paths) {
    const signedUrl = await retryNullable(async () => {
      const { data, error } = await signer.storage.from("chalkboards").createSignedUrl(path, CHALKBOARD_SIGNED_URL_TTL_SECONDS);
      return error ? null : data?.signedUrl ?? null;
    });
    if (signedUrl) return { url: signedUrl, altText: asset.alt_text, caption: asset.caption };
  }
  return null;
}

async function getCurrentWeeklyUpdate(): Promise<CurrentWeeklyUpdate> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("public_current_weekly_update")
    .select("id, title, chalkboard_asset_id")
    .maybeSingle();

  if (error || !data) return null;
  const signer = createServiceRoleClient();
  const { data: assignments } = signer
    ? await signer
        .from("weekly_update_chalkboard_assignments")
        .select("chalkboard_asset_id, display_order")
        .eq("weekly_update_id", data.id)
        .order("display_order", { ascending: true })
    : { data: null };
  const assignedChalkboardIds = (assignments ?? []).map((assignment) => assignment.chalkboard_asset_id as string).filter(Boolean);
  const candidateChalkboardIds = [...assignedChalkboardIds, data.chalkboard_asset_id as string | null].filter((assetId, index, values): assetId is string => Boolean(assetId) && values.indexOf(assetId) === index);
  let chalkboard: HomepageChalkboard | null = null;
  for (const assetId of candidateChalkboardIds) {
    chalkboard = await getSignedChalkboard(assetId, signer ?? undefined);
    if (chalkboard) break;
  }
  return {
    id: data.id,
    title: data.title,
    chalkboard,
  };
}

async function getPreviousGatherings(): Promise<PreviousGathering[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teachings")
    .select("id, slug, title, gathering_date")
    .eq("status", "published")
    .eq("teaching_type", "standard")
    .order("gathering_date", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false });

  if (error) return [];
  const gatherings = (data ?? []) as PreviousGathering[];
  const devotionalSlugsByTeachingId = await getPublishedDevotionalSlugsByTeachingId(gatherings.map((gathering) => gathering.id));
  return gatherings.map((gathering) => ({ ...gathering, hasPublishedDevotional: devotionalSlugsByTeachingId.has(gathering.id), devotionalSlug: devotionalSlugsByTeachingId.get(gathering.id) ?? null }));
}

async function getPublishedDevotionalSlugsByTeachingId(teachingIds: string[]) {
  if (!teachingIds.length) return new Map<string, string>();
  const supabase = await createClient();
  const { data: assignments, error: assignmentsError } = await supabase
    .from("teaching_devotional_assignments")
    .select("teaching_id, devotional_id")
    .in("teaching_id", teachingIds);

  if (assignmentsError || !assignments?.length) return new Map<string, string>();
  const devotionalIds = [...new Set(assignments.map((assignment) => assignment.devotional_id))];
  const { data: devotionals, error: devotionalsError } = await supabase
    .from("teaching_devotionals")
    .select("id, slug")
    .eq("status", "published")
    .in("id", devotionalIds);

  if (devotionalsError) return new Map<string, string>();
  const slugsByDevotionalId = new Map((devotionals ?? []).map((devotional) => [devotional.id, devotional.slug]));
  return new Map(assignments.flatMap((assignment) => {
    const devotionalSlug = slugsByDevotionalId.get(assignment.devotional_id);
    return devotionalSlug ? [[assignment.teaching_id, devotionalSlug]] : [];
  }));
}

async function getFeaturedHomepageData(): Promise<FeaturedHomepageData | null> {
  const supabase = await createClient();
  const { data: candidates, error: teachingError } = await supabase
    .from("teachings")
    .select("id, slug, title, gathering_date, is_featured, status, central_theme, introduction, summary, teaser_1_heading, teaser_1_text, teaser_2_heading, teaser_2_text, chalkboard_asset_id")
    .eq("status", "published")
    .eq("teaching_type", "standard")
    .eq("is_featured", true);
  if (teachingError) return null;

  const teaching = selectFeaturedTeaching((candidates ?? []) as FeaturedTeachingCandidate[]);
  if (!teaching) return null;
  const selectedTeaching = (candidates ?? []).find((candidate) => candidate.id === teaching.id);
  if (!selectedTeaching) return null;

  const [{ data: previousGatherings, error: previousError }] = await Promise.all([
    supabase.from("teachings").select("id, slug, title, gathering_date").eq("status", "published").eq("teaching_type", "standard").order("gathering_date", { ascending: false, nullsFirst: false }).order("id", { ascending: false }),
  ]);
  if (previousError) return null;

  const previousGatheringItems = (previousGatherings ?? []) as PreviousGathering[];
  const devotionalSlugsByTeachingId = await getPublishedDevotionalSlugsByTeachingId([teaching.id, ...previousGatheringItems.map((gathering) => gathering.id)]);

  const { data: teachingChalkboards } = await supabase
    .from("teaching_chalkboard_assignments")
    .select("chalkboard_asset_id, display_order")
    .eq("teaching_id", teaching.id)
    .order("display_order", { ascending: true })
    .limit(1);
  const chalkboard = await getSignedChalkboard(teachingChalkboards?.[0]?.chalkboard_asset_id ?? selectedTeaching.chalkboard_asset_id);

  return {
    teaching: { ...selectedTeaching, hasPublishedDevotional: devotionalSlugsByTeachingId.has(teaching.id), devotionalSlug: devotionalSlugsByTeachingId.get(teaching.id) ?? null } as FeaturedHomepageData["teaching"],
    teasers: buildHomepageTeasers(selectedTeaching),
    chalkboard,
    previousGatherings: previousGatheringItems.map((gathering) => ({ ...gathering, hasPublishedDevotional: devotionalSlugsByTeachingId.has(gathering.id), devotionalSlug: devotionalSlugsByTeachingId.get(gathering.id) ?? null })),
  };
}

function buildHomepageTeasers(teaching: Pick<FeaturedHomepageData["teaching"], "teaser_1_heading" | "teaser_1_text" | "teaser_2_heading" | "teaser_2_text">): HomepageTeaser[] {
  return [
    { id: "teaser-1", heading: teaching.teaser_1_heading?.trim() ?? "", text: teaching.teaser_1_text?.trim() ?? "" },
    { id: "teaser-2", heading: teaching.teaser_2_heading?.trim() ?? "", text: teaching.teaser_2_text?.trim() ?? "" },
  ].filter((teaser) => teaser.heading && teaser.text);
}

export default async function PrayerGroupPage() {
  const [featured, weeklyUpdate] = await Promise.all([getFeaturedHomepageData(), getCurrentWeeklyUpdate()]);
  return featured ? <FeaturedHomepage data={featured} weeklyUpdate={weeklyUpdate} /> : <HardCodedHomepage previousGatherings={await getPreviousGatherings()} weeklyUpdate={weeklyUpdate} />;
}

function WeeklyUpdateHeroButton({ weeklyUpdate }: { weeklyUpdate: CurrentWeeklyUpdate }) {
  if (!weeklyUpdate) return null;
  return (
    <Link href="/weekly-update" className="group mt-8 inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#244a3a] px-6 text-base font-extrabold !text-white shadow-xl shadow-[#244a3a]/20 transition hover:-translate-y-0.5 hover:bg-[#1d3d30] hover:!text-white focus-visible:!text-white visited:!text-white">
      <span>Read the weekly update</span><ArrowRight aria-hidden="true" size={19} className="!text-white" />
    </Link>
  );
}

function FeaturedHomepage({ data, weeklyUpdate }: { data: FeaturedHomepageData; weeklyUpdate: CurrentWeeklyUpdate }) {
  const teachingPath = `/teachings/${data.teaching.slug}`;
  const date = data.teaching.gathering_date ? new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${data.teaching.gathering_date}T00:00:00Z`)) : "Latest gathering";
  const description = data.teaching.central_theme || data.teaching.summary || data.teaching.introduction || "";
  const heroChalkboard = weeklyUpdate?.chalkboard ?? data.chalkboard ?? fallbackHomepageChalkboard;
  const heroChalkboardTitle = weeklyUpdate?.chalkboard
    ? weeklyUpdate.title
    : data.chalkboard
      ? data.teaching.title
      : "Aliyah · Israel · The Harvest · Prayer";

  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f2e8] text-[#243126]">
      <PublicHeader maxWidthClassName="max-w-6xl" nav={homepageNav} />
      <section className="relative"><div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_12%,rgba(209,159,83,0.22),transparent_28%),radial-gradient(circle_at_8%_75%,rgba(58,103,79,0.15),transparent_30%)]" /><div className="relative mx-auto grid max-w-6xl gap-9 px-5 pb-14 pt-12 sm:px-8 sm:pt-16 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:py-20"><div><p className="inline-flex items-center gap-2 rounded-full border border-[#b98243]/25 bg-[#fffaf0] px-4 py-2 text-xs font-extrabold uppercase tracking-[0.16em] text-[#875624]"><Sparkles aria-hidden="true" size={15} />Welcome to our gathering place</p><h1 className="mt-6 max-w-2xl text-5xl font-extrabold leading-[0.98] tracking-[-0.045em] text-[#20382e] sm:text-6xl lg:text-7xl">Prayer changes things. <span className="text-[#a85e32]">The Word changes us.</span></h1><p className="mt-6 max-w-xl text-lg leading-8 text-[#52645a]">A place to revisit our teachings, stand together in prayer, and celebrate what God is doing among us.</p><WeeklyUpdateHeroButton weeklyUpdate={weeklyUpdate} /></div><div className="relative mx-auto w-full max-w-[510px]">{heroChalkboard ? <><div className="absolute -inset-3 rotate-2 rounded-[2rem] bg-[#bb7a3c]/18" /><div className="relative -rotate-1 rounded-[1.75rem] border border-[#284a3b]/10 bg-white p-3 shadow-2xl shadow-[#2d4639]/20 sm:p-4"><a href={heroChalkboard.url} target="_blank" rel="noreferrer" aria-label="View featured chalkboard larger"><img src={heroChalkboard.url} alt={heroChalkboard.altText} className="h-auto w-full rounded-2xl object-contain" /></a>{heroChalkboard.caption ? <p className="mt-3 text-center text-sm text-[#607066]">{heroChalkboard.caption}</p> : null}<div className="absolute -bottom-4 left-5 right-5 rounded-2xl bg-[#fffdf8] px-4 py-3 text-center shadow-lg ring-1 ring-[#284a3b]/10"><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#9a642e]">This week&apos;s whiteboard</p><p className="mt-1 font-extrabold text-[#263f33]">{heroChalkboardTitle}</p></div></div></> : <div className="rounded-[1.75rem] border border-[#284a3b]/10 bg-[#fffdf8] p-8 text-center shadow-xl"><p className="text-sm font-bold text-[#607066]">Chalkboard coming soon</p></div>}</div></div></section>
      <section id="latest" className="bg-[#244a3a] px-5 py-14 text-white sm:px-8 sm:py-20"><div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-start"><div><p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#f0cb83]">{date}</p><h2 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">{data.teaching.title}</h2><p className="mt-5 text-base leading-7 text-[#dce8e1]">{formatInlineText(description)}</p><HomepageTeachingActions slug={data.teaching.slug} hasPublishedDevotional={data.teaching.hasPublishedDevotional} devotionalSlug={data.teaching.devotionalSlug} variant="dark" className="mt-7" /></div>{data.teasers.length ? <div className="grid gap-4 sm:grid-cols-2">{data.teasers.map((teaser, index) => <HomepageTeaserCard key={teaser.id} teaser={teaser} href={teachingPath} index={index} />)}</div> : null}</div></section>
      <StaticHomepageLowerSections previousGatherings={data.previousGatherings} />
      <EmailUpdatesCta copy="Stay connected with The Prayer Whiteboard. Subscribe to the Weekly Updates, teachings, and devotionals you choose." />
      <PublicFooter />
      <ReturnToTop />
    </main>
  );
}

function HomepageTeaserCard({ teaser, href, index }: { teaser: HomepageTeaser; href: string; index: number }) {
  return (
    <Link href={href} className="group flex min-h-56 flex-col rounded-3xl border border-white/10 bg-white/[0.07] p-5 text-left text-[#dce8e1] transition hover:-translate-y-0.5 hover:bg-white/[0.11]">
      <span className="grid size-9 place-items-center rounded-full bg-[#f1c66f] text-sm font-black text-[#244a3a]">{index + 1}</span>
      <h3 className="mt-4 text-xl font-extrabold text-white">{formatInlineText(teaser.heading)}</h3>
      <p className="mt-3 text-sm leading-6 text-[#dce8e1]">{formatInlineText(teaser.text)}</p>
      <span className="mt-auto inline-flex items-center gap-2 pt-5 text-sm font-extrabold text-[#f0cb83]">Read the full teaching <ArrowRight aria-hidden="true" size={16} /></span>
    </Link>
  );
}

function StaticHomepageLowerSections({ previousGatherings, showFallbackArchive = false }: { previousGatherings: PreviousGathering[]; showFallbackArchive?: boolean }) {
  const fallbackGatherings = showFallbackArchive && !previousGatherings.length ? archiveDates : [];

  return (
    <>
      <section className="px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <article className="rounded-[2rem] border border-[#284a3b]/10 bg-[#fffdf8] p-6 shadow-xl shadow-[#4d5f52]/8 sm:p-8">
            <span className="grid size-12 place-items-center rounded-2xl bg-[#e8efe9] text-[#244a3a]"><HeartHandshake aria-hidden="true" size={25} /></span>
            <p className="mt-6 text-xs font-extrabold uppercase tracking-[0.18em] text-[#8e673c]">Stand together</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[#243d31]">Points of Agreement</h2>
            <p className="mt-4 leading-7 text-[#5b6a61]">Join in prayer for active needs presented in a privacy-conscious summary form.</p>
            <Link href="/points-of-agreement" className="mt-6 inline-flex items-center gap-2 font-extrabold text-[#9d5a2f]">View Points of Agreement <ArrowRight aria-hidden="true" size={18} /></Link>
          </article>
        </div>
      </section>
      <section id="gatherings" className="border-y border-[#284a3b]/10 bg-[#eee7da] px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Return to the Word</p>
              <h2 className="mt-2 text-4xl font-extrabold tracking-tight text-[#243d31]">The Storehouse</h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-[#607066]">Published teachings are organized by gathering date so they remain easy to find later.</p>
          </div>
          {previousGatherings.length ? (
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {previousGatherings.map((gathering) => (
              <article key={gathering.id} className="flex min-h-[250px] flex-col rounded-3xl border border-[#284a3b]/10 bg-[#fffdf8] p-6">
                <h3 className="text-xl font-extrabold leading-7 text-[#263e33]">{gathering.title}</h3>
                <p className="mt-2 inline-flex items-center gap-2 text-sm font-bold text-[#607066]"><CalendarDays aria-hidden="true" size={16} /> {formatGatheringDate(gathering.gathering_date)}</p>
                <div className="mt-5 border-t border-[#284a3b]/10 pt-4">
                  <HomepageTeachingActions slug={gathering.slug} hasPublishedDevotional={Boolean(gathering.hasPublishedDevotional)} devotionalSlug={gathering.devotionalSlug} />
                </div>
              </article>
            ))}
          </div>
          ) : fallbackGatherings.length ? (
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {fallbackGatherings.map((gathering) => (
              <article key={gathering.date} className="group flex min-h-[245px] flex-col rounded-3xl border border-[#284a3b]/10 bg-[#fffdf8] p-6 transition hover:-translate-y-1 hover:shadow-xl">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-[#9b6531]"><CalendarDays aria-hidden="true" size={16} /> {gathering.date}</span>
                  {gathering.current ? <span className="rounded-full bg-[#e7efe9] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#326048]">Latest</span> : null}
                </div>
                <h3 className="mt-5 text-xl font-extrabold leading-7 text-[#263e33]">{gathering.title}</h3>
                <p className="mt-3 text-sm leading-6 text-[#66746c]">{gathering.description}</p>
                {gathering.current ? (
                  <HomepageTeachingActions slug="aliyah-israel-harvest-prayer" hasPublishedDevotional={false} className="mt-auto pt-6" />
                ) : (
                  <span className="mt-auto inline-flex items-center gap-2 pt-6 text-sm font-extrabold text-[#9d5a2f]">Teaching coming soon <ArrowRight aria-hidden="true" size={17} /></span>
                )}
              </article>
            ))}
          </div>
          ) : null}
        </div>
      </section>
      <DeepDivesInvitation />
    </>
  );
}

function DeepDivesInvitation() {
  return (
    <section className="bg-[#20382e] px-5 py-14 text-[#f8f1df] sm:px-8 sm:py-20">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:items-center">
        <div>
          <span className="grid size-12 place-items-center rounded-2xl bg-[#f0cb83] text-[#20382e]"><Layers aria-hidden="true" size={25} /></span>
          <p className="mt-6 text-xs font-extrabold uppercase tracking-[0.2em] text-[#f0cb83]">Deeper study</p>
          <h2 className="mt-2 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">Launch Out Into the Deep</h2>
        </div>
        <div>
          <blockquote className="border-l-4 border-[#f0cb83] pl-5 text-xl font-bold leading-8 text-white">
            <p>&ldquo;Launch out into the deep.&rdquo;</p>
            <cite className="mt-3 block text-xs not-italic font-extrabold uppercase tracking-[0.18em] text-[#f0cb83]">Luke 5:4</cite>
          </blockquote>
          <p className="mt-6 max-w-2xl leading-7 text-[#dce8e1]">Go beyond the shorelines of our weekly gatherings. These deeper teachings are built specifically for those who are hungry for more&mdash;designed to mature your faith, expand your vision, and anchor your understanding in the depths of God&apos;s Word.</p>
          <Link href="/deep-dives" className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#f0cb83] px-5 font-extrabold text-[#20382e] transition hover:bg-[#f5d58d]">
            Explore Deep Dives <ArrowRight aria-hidden="true" size={18} />
          </Link>
        </div>
      </div>
    </section>
  );
}

function formatGatheringDate(value: string | null) {
  if (!value) return "Gathering date not set";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function HomepageTeachingActions({ slug, hasPublishedDevotional, devotionalSlug, className, variant = "light" }: { slug: string; hasPublishedDevotional: boolean; devotionalSlug?: string | null; className?: string; variant?: "dark" | "light" }) {
  return (
    <div className={`flex flex-col items-start gap-2 ${className ?? ""}`}>
      <HomepageTeachingAction href={`/teachings/${slug}`} label="Read the full teaching" variant={variant} />
      {hasPublishedDevotional && devotionalSlug ? <HomepageTeachingAction href={`/devotionals/${devotionalSlug}`} label="Open 7-Day Devotions" variant={variant} /> : null}
    </div>
  );
}

function HomepageTeachingAction({ href, label, variant }: { href: string; label: string; variant: "dark" | "light" }) {
  const colorClassName = variant === "dark" ? "text-[#f0cb83] hover:text-[#f5d58d]" : "text-[#9d5a2f] hover:text-[#a85e32]";

  return (
    <Link href={href} className={`group inline-flex min-h-11 max-w-full items-center gap-2 text-sm font-extrabold underline-offset-4 transition hover:underline focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f1c66f] sm:text-base ${colorClassName}`}>
      <span>{label}</span>
      <ArrowRight aria-hidden="true" size={18} className="shrink-0 transition motion-reduce:transition-none group-hover:translate-x-1 motion-reduce:group-hover:translate-x-0" />
    </Link>
  );
}

function HardCodedHomepage({ previousGatherings, weeklyUpdate }: { previousGatherings: PreviousGathering[]; weeklyUpdate: CurrentWeeklyUpdate }) {
  const weeklyUpdateChalkboard = weeklyUpdate?.chalkboard ?? null;
  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f2e8] text-[#243126]">
      <PublicHeader maxWidthClassName="max-w-6xl" nav={homepageNav} />

      <section className="relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_12%,rgba(209,159,83,0.22),transparent_28%),radial-gradient(circle_at_8%_75%,rgba(58,103,79,0.15),transparent_30%)]" />
        <div className="relative mx-auto grid max-w-6xl gap-9 px-5 pb-14 pt-12 sm:px-8 sm:pt-16 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:py-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-[#b98243]/25 bg-[#fffaf0] px-4 py-2 text-xs font-extrabold uppercase tracking-[0.16em] text-[#875624]">
              <Sparkles aria-hidden="true" size={15} />
              Welcome to our gathering place
            </p>
            <h1 className="mt-6 max-w-2xl text-5xl font-extrabold leading-[0.98] tracking-[-0.045em] text-[#20382e] sm:text-6xl lg:text-7xl">
              Prayer changes things. <span className="text-[#a85e32]">The Word changes us.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-[#52645a]">
              A place to revisit our teachings, stand together in prayer, and celebrate what God is doing among us.
            </p>
            <WeeklyUpdateHeroButton weeklyUpdate={weeklyUpdate} />
          </div>

          <div className="relative mx-auto w-full max-w-[510px]">
            <div className="absolute -inset-3 rotate-2 rounded-[2rem] bg-[#bb7a3c]/18" />
            <div className="relative -rotate-1 rounded-[1.75rem] border border-[#284a3b]/10 bg-white p-3 shadow-2xl shadow-[#2d4639]/20 sm:p-4">
              {weeklyUpdateChalkboard ? (
                <a href={weeklyUpdateChalkboard.url} target="_blank" rel="noreferrer" aria-label="View featured chalkboard larger">
                  <img src={weeklyUpdateChalkboard.url} alt={weeklyUpdateChalkboard.altText} className="h-auto w-full rounded-2xl object-contain" />
                </a>
              ) : (
                <Image
                  src="/prayergroup/aliyah-chalkboard.jpg"
                  alt="Chalkboard teaching about Aliyah, Israel, the harvest, and prayer"
                  width={588}
                  height={734}
                  priority
                  className="h-auto w-full rounded-2xl"
                />
              )}
              {weeklyUpdateChalkboard?.caption ? <p className="mt-3 text-center text-sm text-[#607066]">{weeklyUpdateChalkboard.caption}</p> : null}
              <div className="absolute -bottom-4 left-5 right-5 rounded-2xl bg-[#fffdf8] px-4 py-3 text-center shadow-lg ring-1 ring-[#284a3b]/10">
                <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#9a642e]">This week&apos;s whiteboard</p>
                <p className="mt-1 font-extrabold text-[#263f33]">{weeklyUpdateChalkboard && weeklyUpdate ? weeklyUpdate.title : <>Aliyah &middot; Israel &middot; The Harvest &middot; Prayer</>}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="latest" className="bg-[#244a3a] px-5 py-14 text-white sm:px-8 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#f0cb83]">Latest gathering &middot; August 30, 2026</p>
            <h2 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              Aliyah: Israel, the Harvest &amp; Prayer
            </h2>
            <p className="mt-5 text-base leading-7 text-[#dce8e1]">
              God is gathering His people, revealing Jesus, and calling the Church to pray. This teaching follows the biblical picture of returning, ascending, and drawing nearer to God.
            </p>
            <HomepageTeachingActions slug="aliyah-israel-harvest-prayer" hasPublishedDevotional={false} variant="dark" className="mt-7" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["The Meaning of Aliyah", "To go up or to ascend\u2014and God's call to His people: \u2018Come home. Return to Israel.\u2019"],
              ["Aliyah in Genesis", "Joseph and his family went up from Egypt to return Jacob to the Promised Land."],
              ["Spiritual Elevation", "Prayer, praise, and the Word draw us nearer and renew our thinking."],
              ["Aliyah to Jesus", "Our prayer for spiritual awakening: \u2018Call them up to Jesus.\u2019"],
            ].map(([title, body], index) => {
              const sectionIds = ["meaning", "genesis", "elevation", "jesus"];

              return (
                <Link
                  key={title}
                  href={`${teachingPath}#${sectionIds[index]}`}
                  className="group flex min-h-56 flex-col justify-center rounded-3xl border border-white/10 bg-white/[0.07] p-5 transition hover:-translate-y-0.5 hover:bg-white/[0.11]"
                >
                  <span className="grid size-9 place-items-center rounded-full bg-[#f1c66f] text-sm font-black text-[#244a3a]">{index + 1}</span>
                  <h3 className="mt-4 text-xl font-extrabold">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#dce8e1]">{body}</p>
                  <span className="mt-4 inline-flex items-center gap-2 text-sm font-extrabold text-[#f0cb83]">
                    Read this section
                    <ArrowRight aria-hidden="true" size={16} className="transition group-hover:translate-x-1" />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <article className="rounded-[2rem] border border-[#284a3b]/10 bg-[#fffdf8] p-6 shadow-xl shadow-[#4d5f52]/8 sm:p-8">
            <span className="grid size-12 place-items-center rounded-2xl bg-[#e8efe9] text-[#244a3a]">
              <HeartHandshake aria-hidden="true" size={25} />
            </span>
            <p className="mt-6 text-xs font-extrabold uppercase tracking-[0.18em] text-[#8e673c]">Stand together</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[#243d31]">Points of Agreement</h2>
            <p className="mt-4 leading-7 text-[#5b6a61]">
              Join in prayer for active needs presented in a privacy-conscious summary form.
            </p>
            <Link href="/points-of-agreement" className="mt-6 inline-flex items-center gap-2 font-extrabold text-[#9d5a2f]">
              View Points of Agreement <ArrowRight aria-hidden="true" size={18} />
            </Link>
          </article>
        </div>
      </section>

      <section id="gatherings" className="border-y border-[#284a3b]/10 bg-[#eee7da] px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Return to the Word</p>
              <h2 className="mt-2 text-4xl font-extrabold tracking-tight text-[#243d31]">The Storehouse</h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-[#607066]">Published teachings are organized by gathering date so they remain easy to find later.</p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {previousGatherings.length ? previousGatherings.map((gathering) => (
              <article key={gathering.id} className="flex min-h-[250px] flex-col rounded-3xl border border-[#284a3b]/10 bg-[#fffdf8] p-6">
                <h3 className="text-xl font-extrabold leading-7 text-[#263e33]">{gathering.title}</h3>
                <p className="mt-2 inline-flex items-center gap-2 text-sm font-bold text-[#607066]">
                  <CalendarDays aria-hidden="true" size={16} /> {formatGatheringDate(gathering.gathering_date)}
                </p>
                <div className="mt-5 border-t border-[#284a3b]/10 pt-4">
                  <HomepageTeachingActions slug={gathering.slug} hasPublishedDevotional={Boolean(gathering.hasPublishedDevotional)} devotionalSlug={gathering.devotionalSlug} />
                </div>
              </article>
            )) : archiveDates.map((gathering) => (
              <article key={gathering.date} className="group flex min-h-[245px] flex-col rounded-3xl border border-[#284a3b]/10 bg-[#fffdf8] p-6 transition hover:-translate-y-1 hover:shadow-xl">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-[#9b6531]">
                    <CalendarDays aria-hidden="true" size={16} /> {gathering.date}
                  </span>
                  {gathering.current ? <span className="rounded-full bg-[#e7efe9] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#326048]">Latest</span> : null}
                </div>
                <h3 className="mt-5 text-xl font-extrabold leading-7 text-[#263e33]">{gathering.title}</h3>
                <p className="mt-3 text-sm leading-6 text-[#66746c]">{gathering.description}</p>
                {gathering.current ? (
                  <HomepageTeachingActions slug="aliyah-israel-harvest-prayer" hasPublishedDevotional={false} className="mt-auto pt-6" />
                ) : (
                  <span className="mt-auto inline-flex items-center gap-2 pt-6 text-sm font-extrabold text-[#9d5a2f]">
                    Teaching coming soon
                    <ArrowRight aria-hidden="true" size={17} />
                  </span>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      <DeepDivesInvitation />

      <EmailUpdatesCta copy="Stay connected with The Prayer Whiteboard. Subscribe to the Weekly Updates, teachings, and devotionals you choose." />
      <PublicFooter />
      <ReturnToTop />
    </main>
  );
}
