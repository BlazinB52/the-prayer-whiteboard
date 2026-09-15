import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicFooter } from "@/app/public-footer";
import { PublicHeader } from "@/app/public-header";
import { ReturnToTop } from "@/app/return-to-top";
import { ContentFooter } from "@/app/content-footer";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createClient } from "@/lib/supabase/server";
import { WeeklyUpdateContent } from "./weekly-update-content";
import { WeeklyUpdatePrintButton } from "./print-button";

export const metadata: Metadata = {
  title: "Weekly Update | The Whiteboard",
  description: "The current weekly update from The Prayer Whiteboard.",
};

export default async function WeeklyUpdatePage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("public_current_weekly_update")
    .select("id, title, body_markdown, converted_content, published_at")
    .maybeSingle();

  if (error || !data) notFound();
  const signer = createServiceRoleClient();
  const footerClient = signer ?? supabase;
  const { data: footerAssignment } = await footerClient
    .from("weekly_update_footer_assignments")
    .select("footer_id")
    .eq("weekly_update_id", data.id)
    .maybeSingle();
  const { data: footer } = footerAssignment?.footer_id
    ? await footerClient
        .from("content_footers")
        .select("content, status")
        .eq("id", footerAssignment.footer_id)
        .eq("status", "active")
        .maybeSingle()
    : { data: null };

  return (
    <main className="min-h-screen bg-[#f7f2e8] text-[#243126]">
      <PublicHeader maxWidthClassName="max-w-4xl" end={<Link href="/" className="shrink-0 text-sm font-extrabold text-[#244a3a]">Home</Link>} />
      <div className="sticky top-[73px] z-30 border-b border-[#284a3b]/10 bg-[#f7f2e8]/95 px-5 py-2 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-4xl justify-end">
          <WeeklyUpdatePrintButton />
        </div>
      </div>
      <article className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-16">
        <header className="border-b border-[#284a3b]/15 pb-8">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Weekly Update</p>
          <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight text-[#243d31] sm:text-6xl">{data.title}</h1>
          {data.published_at ? <p className="mt-4 text-sm font-bold text-[#607066]">{new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(new Date(data.published_at))}</p> : null}
        </header>
        <div className="mt-10">
          <div className="mb-10 flex justify-center">
            <Image
              src="/images/whiteboard-sword-logo-with-tagline.png"
              alt="The Prayer Whiteboard sword logo with tagline"
              width={2172}
              height={724}
              className="h-auto w-full max-w-[520px]"
              priority
            />
          </div>
          <WeeklyUpdateContent body={data.body_markdown} blocks={data.converted_content} />
          {footer?.status === "active" ? <ContentFooter content={footer.content} /> : null}
        </div>
      </article>
      <PublicFooter />
      <ReturnToTop />
    </main>
  );
}
