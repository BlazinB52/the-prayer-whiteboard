import type { Metadata } from "next";
import Link from "next/link";
import { FormattedTextBlocks } from "@/app/formatted-text";
import { PublicFooter } from "@/app/public-footer";
import { PublicHeader } from "@/app/public-header";
import { FALLBACK_FULL_PAGE_COPYRIGHT_DISCLAIMER, safeCopyrightReturnToPath } from "@/lib/copyright-disclaimer-format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Copyright Disclaimers",
  description: "Copyright acknowledgments and permissions for The Prayer Whiteboard.",
  alternates: { canonical: "/copyright-disclaimers" },
};

type PageProps = {
  searchParams?: Promise<{ returnTo?: string | string[] }>;
};

function returnLabel(path: string | null) {
  if (!path) return "Return to The Prayer Whiteboard";
  if (path.startsWith("/teachings/")) return "Return to Teaching";
  if (path.startsWith("/devotionals/")) return "Return to Devotional";
  return "Return to The Prayer Whiteboard";
}

export default async function CopyrightDisclaimersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const returnToValue = Array.isArray(params?.returnTo) ? params?.returnTo[0] : params?.returnTo;
  const returnTo = safeCopyrightReturnToPath(returnToValue);
  const supabase = await createClient();
  const { data } = await supabase
    .from("copyright_disclaimers")
    .select("title, content, updated_at")
    .eq("disclaimer_key", "full_page")
    .maybeSingle();
  const content = data?.content?.trim() || FALLBACK_FULL_PAGE_COPYRIGHT_DISCLAIMER;

  return (
    <main className="min-h-screen bg-[#f7f2e8] text-[#243126]">
      <PublicHeader maxWidthClassName="max-w-4xl" end={<Link href={returnTo ?? "/"} className="shrink-0 text-sm font-extrabold text-[#244a3a]">{returnLabel(returnTo)}</Link>} />
      <article className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-16">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Copyright</p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-[#243d31] sm:text-6xl">Copyright Disclaimers</h1>
        {data?.updated_at ? <p className="mt-4 text-sm text-[#607066]">Updated {new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(new Date(data.updated_at))}</p> : null}
        <div className="mt-8 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5 leading-7 text-[#52645a] shadow-lg shadow-[#4d5f52]/8 sm:p-7">
          <FormattedTextBlocks text={content} links className="space-y-5" paragraphClassName="whitespace-pre-wrap" />
        </div>
        <Link href={returnTo ?? "/"} className="mt-8 inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#244a3a] px-5 font-extrabold !text-white shadow-xl shadow-[#244a3a]/20 transition hover:bg-[#1d3d30]">
          {returnLabel(returnTo)}
        </Link>
      </article>
      <PublicFooter />
    </main>
  );
}
