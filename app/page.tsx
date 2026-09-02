/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BookOpenText,
  CalendarDays,
  HeartHandshake,
  Menu,
  MessageCircleHeart,
  Sparkles,
} from "lucide-react";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createClient } from "@/lib/supabase/server";
import { getHomepageSectionExcerpt, selectFeaturedTeaching, type FeaturedTeachingCandidate } from "@/lib/homepage-utils";

const pageUrl = "https://theprayerwhiteboard.com";
const teachingPath = "/teachings/aliyah-israel-harvest-prayer";

export const metadata: Metadata = {
  title: "The Whiteboard | Prayer, Scripture & Praise",
  description:
    "A welcoming home for prayer-group teachings, prayer needs, praise reports, and growing together in God's Word.",
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
  };
  highlights: { id: string; title: string; categoryTitle: string; excerpt: string }[];
  chalkboard: { url: string; altText: string; caption: string | null } | null;
  previousGatherings: PreviousGathering[];
};

type PreviousGathering = {
  id: string;
  slug: string;
  title: string;
  gathering_date: string | null;
  summary: string | null;
};

async function getFeaturedHomepageData(): Promise<FeaturedHomepageData | null> {
  const supabase = await createClient();
  const { data: candidates, error: teachingError } = await supabase
    .from("teachings")
    .select("id, slug, title, gathering_date, updated_at, is_featured, status, central_theme, introduction, summary")
    .eq("status", "published")
    .eq("is_featured", true);
  if (teachingError) return null;

  const teaching = selectFeaturedTeaching((candidates ?? []) as FeaturedTeachingCandidate[]);
  if (!teaching) return null;
  const selectedTeaching = (candidates ?? []).find((candidate) => candidate.id === teaching.id);
  if (!selectedTeaching) return null;

  const signer = createServiceRoleClient();
  if (!signer) return null;

  const [{ data: categories, error: categoriesError }, { data: sections, error: sectionsError }, { data: assets, error: assetsError }, { data: previousGatherings, error: previousError }] = await Promise.all([
    supabase.from("teaching_categories").select("id, teaching_id, title, sort_order, status").eq("teaching_id", teaching.id).eq("status", "published").order("sort_order"),
    supabase.from("teaching_sections").select("id, teaching_id, category_id, title, content, sort_order, status").eq("teaching_id", teaching.id).eq("status", "published").order("sort_order"),
    signer.from("chalkboard_assets").select("id, teaching_id, category_id, section_id, alt_text, caption, website_storage_path, storage_path, display_order, is_current_version, status").eq("teaching_id", teaching.id).eq("is_current_version", true).eq("status", "active").is("category_id", null).is("section_id", null).order("display_order").limit(1),
    supabase.from("teachings").select("id, slug, title, gathering_date, summary").eq("status", "published").neq("id", teaching.id).order("gathering_date", { ascending: false, nullsFirst: false }).order("id", { ascending: false }),
  ]);
  if (categoriesError || sectionsError || assetsError || previousError) return null;

  const validCategories = (categories ?? []).filter((category) => category.teaching_id === teaching.id);
  const validSections = (sections ?? []).filter((section) => section.teaching_id === teaching.id && validCategories.some((category) => category.id === section.category_id));
  const highlights = validCategories.flatMap((category) => validSections.filter((section) => section.category_id === category.id).map((section) => ({ id: section.id, title: section.title, categoryTitle: category.title, excerpt: getHomepageSectionExcerpt(section.content), selected: Boolean(section.content && typeof section.content === "object" && (section.content as Record<string, unknown>).homepageHighlight === true) }))).filter((section) => section.excerpt && section.selected).slice(0, 4);

  let chalkboard: FeaturedHomepageData["chalkboard"] = null;
  const asset = assets?.[0];
  if (asset && signer) {
    const paths = [asset.website_storage_path, asset.storage_path].filter((path): path is string => Boolean(path));
    for (const path of paths) {
      const { data } = await signer.storage.from("chalkboards").createSignedUrl(path, 300);
      if (data?.signedUrl) {
        chalkboard = { url: data.signedUrl, altText: asset.alt_text, caption: asset.caption };
        break;
      }
    }
  }

  if (!chalkboard) return null;

  return { teaching: selectedTeaching as FeaturedHomepageData["teaching"], highlights, chalkboard, previousGatherings: (previousGatherings ?? []) as PreviousGathering[] };
}

export default async function PrayerGroupPage() {
  const featured = await getFeaturedHomepageData();
  return featured ? <FeaturedHomepage data={featured} /> : <HardCodedHomepage />;
}

function FeaturedHomepage({ data }: { data: FeaturedHomepageData }) {
  const teachingPath = `/teachings/${data.teaching.slug}`;
  const date = data.teaching.gathering_date ? new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${data.teaching.gathering_date}T00:00:00Z`)) : "Latest gathering";
  const description = data.teaching.central_theme || data.teaching.summary || data.teaching.introduction || "";

  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f2e8] text-[#243126]">
      <header className="relative z-20 border-b border-[#284a3b]/10 bg-[#fffdf8]/90 backdrop-blur"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8"><Link href="/" className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-[#244a3a] text-[#f4dfaa] shadow-md shadow-[#244a3a]/20"><BookOpenText aria-hidden="true" size={23} /></span><span><span className="block text-lg font-extrabold tracking-tight text-[#21382e]">The Whiteboard</span><span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-[#9a6c32]">Prayer &amp; Bible Study</span></span></Link><nav className="hidden items-center gap-7 text-sm font-bold text-[#385245] md:flex" aria-label="Main navigation"><a href="#latest">Latest Teaching</a><a href="#prayer">Prayer Needs</a><a href="#praise">Praise Reports</a><a href="#gatherings">Gatherings</a></nav><a href="#gatherings" className="grid size-11 place-items-center rounded-xl border border-[#284a3b]/15 bg-white text-[#244a3a] md:hidden" aria-label="Jump to gatherings"><Menu aria-hidden="true" size={22} /></a></div></header>
      <section className="relative"><div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_12%,rgba(209,159,83,0.22),transparent_28%),radial-gradient(circle_at_8%_75%,rgba(58,103,79,0.15),transparent_30%)]" /><div className="relative mx-auto grid max-w-6xl gap-9 px-5 pb-14 pt-12 sm:px-8 sm:pt-16 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:py-20"><div><p className="inline-flex items-center gap-2 rounded-full border border-[#b98243]/25 bg-[#fffaf0] px-4 py-2 text-xs font-extrabold uppercase tracking-[0.16em] text-[#875624]"><Sparkles aria-hidden="true" size={15} />Welcome to our gathering place</p><h1 className="mt-6 max-w-2xl text-5xl font-extrabold leading-[0.98] tracking-[-0.045em] text-[#20382e] sm:text-6xl lg:text-7xl">Prayer changes things. <span className="text-[#a85e32]">The Word changes us.</span></h1><p className="mt-6 max-w-xl text-lg leading-8 text-[#52645a]">A place to revisit our teachings, stand together in prayer, and celebrate what God is doing among us.</p><div className="mt-8 flex flex-col gap-3 sm:flex-row"><Link href={teachingPath} className="group inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#244a3a] px-6 text-base font-extrabold text-white shadow-xl shadow-[#244a3a]/20 transition hover:-translate-y-0.5 hover:bg-[#1d3d30]"><span>Read the featured teaching</span><ArrowRight aria-hidden="true" size={19} /></Link><a href="#prayer" className="inline-flex min-h-14 items-center justify-center rounded-2xl border border-[#284a3b]/15 bg-white px-6 text-base font-extrabold text-[#284a3b]">Pray with us</a></div></div><div className="relative mx-auto w-full max-w-[510px]">{data.chalkboard ? <div className="relative -rotate-1 rounded-[1.75rem] border border-[#284a3b]/10 bg-white p-3 shadow-2xl shadow-[#2d4639]/20 sm:p-4"><a href={data.chalkboard.url} target="_blank" rel="noreferrer" aria-label="View featured chalkboard larger"><img src={data.chalkboard.url} alt={data.chalkboard.altText} className="h-auto w-full rounded-2xl object-contain" /></a>{data.chalkboard.caption ? <p className="mt-3 text-center text-sm text-[#607066]">{data.chalkboard.caption}</p> : null}<div className="absolute -bottom-4 left-5 right-5 rounded-2xl bg-[#fffdf8] px-4 py-3 text-center shadow-lg ring-1 ring-[#284a3b]/10"><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#9a642e]">This week&apos;s whiteboard</p><p className="mt-1 font-extrabold text-[#263f33]">{data.teaching.title}</p></div></div> : <div className="rounded-[1.75rem] border border-[#284a3b]/10 bg-[#fffdf8] p-8 text-center shadow-xl"><p className="text-sm font-bold text-[#607066]">Chalkboard coming soon</p></div>}</div></div></section>
      <section id="latest" className="bg-[#244a3a] px-5 py-14 text-white sm:px-8 sm:py-20"><div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-start"><div><p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#f0cb83]">{date}</p><h2 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">{data.teaching.title}</h2><p className="mt-5 text-base leading-7 text-[#dce8e1]">{description}</p><Link href={teachingPath} className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#f1c66f] px-5 font-extrabold text-[#244a3a]">Read the full teaching <ArrowRight aria-hidden="true" size={18} /></Link></div><div className="grid gap-4 sm:grid-cols-2">{data.highlights.map((highlight, index) => <Link key={highlight.id} href={`${teachingPath}#section-${highlight.id}`} className="group rounded-3xl border border-white/10 bg-white/[0.07] p-5 transition hover:-translate-y-0.5 hover:bg-white/[0.11]"><span className="grid size-9 place-items-center rounded-full bg-[#f1c66f] text-sm font-black text-[#244a3a]">{index + 1}</span><h3 className="mt-4 text-xl font-extrabold">{highlight.title}</h3><p className="mt-3 text-sm leading-6 text-[#dce8e1]">{highlight.excerpt}</p><span className="mt-4 inline-flex items-center gap-2 text-sm font-extrabold text-[#f0cb83]">Read this section <ArrowRight aria-hidden="true" size={16} /></span></Link>)}</div></div></section>
      <StaticHomepageLowerSections previousGatherings={data.previousGatherings} />
    </main>
  );
}

function StaticHomepageLowerSections({ previousGatherings }: { previousGatherings: PreviousGathering[] }) {
  return (
    <>
      <section className="px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-2">
          <article id="prayer" className="rounded-[2rem] border border-[#284a3b]/10 bg-[#fffdf8] p-6 shadow-xl shadow-[#4d5f52]/8 sm:p-8">
            <span className="grid size-12 place-items-center rounded-2xl bg-[#e8efe9] text-[#244a3a]"><HeartHandshake aria-hidden="true" size={25} /></span>
            <p className="mt-6 text-xs font-extrabold uppercase tracking-[0.18em] text-[#8e673c]">Stand together</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[#243d31]">Prayer Needs</h2>
            <p className="mt-4 leading-7 text-[#5b6a61]">Join us in praying for salvation, healing, families, our communities, Israel, and the nations. Prayer needs are shared only in summary form, with names and identifying details withheld to protect privacy.</p>
            <span className="mt-6 inline-flex items-center gap-2 font-extrabold text-[#9d5a2f]">Current requests coming soon <ArrowRight aria-hidden="true" size={18} /></span>
          </article>
          <article id="praise" className="rounded-[2rem] border border-[#d2a34f]/20 bg-[#fff8e8] p-6 shadow-xl shadow-[#8b6531]/8 sm:p-8">
            <span className="grid size-12 place-items-center rounded-2xl bg-[#f5dfaa] text-[#8a5425]"><MessageCircleHeart aria-hidden="true" size={25} /></span>
            <p className="mt-6 text-xs font-extrabold uppercase tracking-[0.18em] text-[#8e673c]">Remember His goodness</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[#503b27]">Praise Reports</h2>
            <p className="mt-4 leading-7 text-[#6f604f]">Celebrate answered prayer, testimonies of God&apos;s faithfulness, and the ways we see Him working throughout the week.</p>
            <span className="mt-6 inline-flex items-center gap-2 font-extrabold text-[#9d5a2f]">Praise reports coming soon <ArrowRight aria-hidden="true" size={18} /></span>
          </article>
        </div>
      </section>
      <section id="gatherings" className="border-y border-[#284a3b]/10 bg-[#eee7da] px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Return to the Word</p>
              <h2 className="mt-2 text-4xl font-extrabold tracking-tight text-[#243d31]">Previous Gatherings</h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-[#607066]">Published teachings are organized by gathering date so they remain easy to find later.</p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {previousGatherings.map((gathering) => (
              <Link key={gathering.id} href={`/teachings/${gathering.slug}`} className="group flex min-h-[245px] flex-col rounded-3xl border border-[#284a3b]/10 bg-[#fffdf8] p-6 transition hover:-translate-y-1 hover:shadow-xl">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-[#9b6531]"><CalendarDays aria-hidden="true" size={16} /> {formatGatheringDate(gathering.gathering_date)}</span>
                </div>
                <h3 className="mt-5 text-xl font-extrabold leading-7 text-[#263e33]">{gathering.title}</h3>
                <p className="mt-3 text-sm leading-6 text-[#66746c]">{gathering.summary}</p>
                <span className="mt-auto inline-flex items-center gap-2 pt-6 text-sm font-extrabold text-[#9d5a2f]">Read the teaching <ArrowRight aria-hidden="true" size={17} className="transition group-hover:translate-x-1" /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>
      <footer className="bg-[#1d352b] px-5 py-10 text-center text-[#d8e5dd] sm:px-8"><BookOpenText aria-hidden="true" className="mx-auto text-[#efc775]" size={28} /><p className="mt-4 text-lg font-extrabold text-white">The Whiteboard</p><p className="mt-2 text-sm">Prayer · The Word · Praise · Growing Together</p></footer>
    </>
  );
}

function formatGatheringDate(value: string | null) {
  if (!value) return "Gathering date not set";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function HardCodedHomepage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f2e8] text-[#243126]">
      <header className="relative z-20 border-b border-[#284a3b]/10 bg-[#fffdf8]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-[#244a3a] text-[#f4dfaa] shadow-md shadow-[#244a3a]/20">
              <BookOpenText aria-hidden="true" size={23} />
            </span>
            <span>
              <span className="block text-lg font-extrabold tracking-tight text-[#21382e]">
                The Whiteboard
              </span>
              <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-[#9a6c32]">
                Prayer &amp; Bible Study
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-7 text-sm font-bold text-[#385245] md:flex" aria-label="Main navigation">
            <a href="#latest" className="transition hover:text-[#a45e2e]">Latest Teaching</a>
            <a href="#prayer" className="transition hover:text-[#a45e2e]">Prayer Needs</a>
            <a href="#praise" className="transition hover:text-[#a45e2e]">Praise Reports</a>
            <a href="#gatherings" className="transition hover:text-[#a45e2e]">Gatherings</a>
          </nav>

          <a
            href="#gatherings"
            className="grid size-11 place-items-center rounded-xl border border-[#284a3b]/15 bg-white text-[#244a3a] md:hidden"
            aria-label="Jump to gatherings"
          >
            <Menu aria-hidden="true" size={22} />
          </a>
        </div>
      </header>

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
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href={teachingPath}
                className="group inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#244a3a] px-6 text-base font-extrabold text-white shadow-xl shadow-[#244a3a]/20 transition hover:-translate-y-0.5 hover:bg-[#1d3d30] hover:text-white"
              >
                <span className="!text-white">Read the full teaching</span> <ArrowRight aria-hidden="true" size={19} className="text-white transition group-hover:text-white" />
              </Link>
              <a
                href="#prayer"
                className="inline-flex min-h-14 items-center justify-center rounded-2xl border border-[#284a3b]/15 bg-white px-6 text-base font-extrabold text-[#284a3b] transition hover:border-[#a85e32]/40"
              >
                Pray with us
              </a>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[510px]">
            <div className="absolute -inset-3 rotate-2 rounded-[2rem] bg-[#bb7a3c]/18" />
            <div className="relative -rotate-1 rounded-[1.75rem] border border-[#284a3b]/10 bg-white p-3 shadow-2xl shadow-[#2d4639]/20 sm:p-4">
              <Image
                src="/prayergroup/aliyah-chalkboard.jpg"
                alt="Chalkboard teaching about Aliyah, Israel, the harvest, and prayer"
                width={588}
                height={734}
                priority
                className="h-auto w-full rounded-2xl"
              />
              <div className="absolute -bottom-4 left-5 right-5 rounded-2xl bg-[#fffdf8] px-4 py-3 text-center shadow-lg ring-1 ring-[#284a3b]/10">
                <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#9a642e]">This week&apos;s whiteboard</p>
                <p className="mt-1 font-extrabold text-[#263f33]">Aliyah · Israel · The Harvest · Prayer</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="latest" className="bg-[#244a3a] px-5 py-14 text-white sm:px-8 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#f0cb83]">Latest gathering · August 30, 2026</p>
            <h2 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              Aliyah: Israel, the Harvest &amp; Prayer
            </h2>
            <p className="mt-5 text-base leading-7 text-[#dce8e1]">
              God is gathering His people, revealing Jesus, and calling the Church to pray. This teaching follows the biblical picture of returning, ascending, and drawing nearer to God.
            </p>
            <Link
              href={teachingPath}
              className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#f1c66f] px-5 font-extrabold text-[#244a3a] transition hover:bg-[#f5d58d]"
            >
              Read the full teaching <ArrowRight aria-hidden="true" size={18} />
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["The Meaning of Aliyah", "To go up or to ascend—and God's call to His people: ‘Come home. Return to Israel.’"],
              ["Aliyah in Genesis", "Joseph and his family went up from Egypt to return Jacob to the Promised Land."],
              ["Spiritual Elevation", "Prayer, praise, and the Word draw us nearer and renew our thinking."],
              ["Aliyah to Jesus", "Our prayer for spiritual awakening: ‘Call them up to Jesus.’"],
            ].map(([title, body], index) => {
              const sectionIds = ["meaning", "genesis", "elevation", "jesus"];

              return (
                <Link
                  key={title}
                  href={`${teachingPath}#${sectionIds[index]}`}
                  className="group rounded-3xl border border-white/10 bg-white/[0.07] p-5 transition hover:-translate-y-0.5 hover:bg-white/[0.11]"
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
        <div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-2">
          <article id="prayer" className="rounded-[2rem] border border-[#284a3b]/10 bg-[#fffdf8] p-6 shadow-xl shadow-[#4d5f52]/8 sm:p-8">
            <span className="grid size-12 place-items-center rounded-2xl bg-[#e8efe9] text-[#244a3a]">
              <HeartHandshake aria-hidden="true" size={25} />
            </span>
            <p className="mt-6 text-xs font-extrabold uppercase tracking-[0.18em] text-[#8e673c]">Stand together</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[#243d31]">Prayer Needs</h2>
            <p className="mt-4 leading-7 text-[#5b6a61]">
              Join us in praying for salvation, healing, families, our communities, Israel, and the nations. Prayer needs are shared only in summary form, with names and identifying details withheld to protect privacy.
            </p>
            <span className="mt-6 inline-flex items-center gap-2 font-extrabold text-[#9d5a2f]">
              Current requests coming soon <ArrowRight aria-hidden="true" size={18} />
            </span>
          </article>

          <article id="praise" className="rounded-[2rem] border border-[#d2a34f]/20 bg-[#fff8e8] p-6 shadow-xl shadow-[#8b6531]/8 sm:p-8">
            <span className="grid size-12 place-items-center rounded-2xl bg-[#f5dfaa] text-[#8a5425]">
              <MessageCircleHeart aria-hidden="true" size={25} />
            </span>
            <p className="mt-6 text-xs font-extrabold uppercase tracking-[0.18em] text-[#8e673c]">Remember His goodness</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[#503b27]">Praise Reports</h2>
            <p className="mt-4 leading-7 text-[#6f604f]">
              Celebrate answered prayer, testimonies of God&apos;s faithfulness, and the ways we see Him working throughout the week.
            </p>
            <span className="mt-6 inline-flex items-center gap-2 font-extrabold text-[#9d5a2f]">
              Praise reports coming soon <ArrowRight aria-hidden="true" size={18} />
            </span>
          </article>
        </div>
      </section>

      <section id="gatherings" className="border-y border-[#284a3b]/10 bg-[#eee7da] px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Return to the Word</p>
              <h2 className="mt-2 text-4xl font-extrabold tracking-tight text-[#243d31]">Previous Gatherings</h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-[#607066]">Teachings will be organized by gathering date so they remain easy to find later.</p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {archiveDates.map((gathering) => (
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
                  <Link
                    href={teachingPath}
                    className="mt-auto inline-flex items-center gap-2 pt-6 text-sm font-extrabold text-[#9d5a2f]"
                  >
                    Read the full teaching
                    <ArrowRight aria-hidden="true" size={17} className="transition group-hover:translate-x-1" />
                  </Link>
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

      <footer className="bg-[#1d352b] px-5 py-10 text-center text-[#d8e5dd] sm:px-8">
        <BookOpenText aria-hidden="true" className="mx-auto text-[#efc775]" size={28} />
        <p className="mt-4 text-lg font-extrabold text-white">The Whiteboard</p>
        <p className="mt-2 text-sm">Prayer · The Word · Praise · Growing Together</p>
      </footer>
    </main>
  );
}
