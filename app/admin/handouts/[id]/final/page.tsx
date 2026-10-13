import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TeachingDateLabel } from "@/app/teaching-date-label";
import { requireAdmin } from "@/lib/supabase/admin";
import { handoutSections, sectionPlainText, type HandoutBlock, type HandoutInline, type HandoutSection } from "@/lib/teaching-handouts";
import { renderHandoutInlines } from "../../handout-content";
import { CopyButtons } from "./copy-buttons";

export const metadata: Metadata = {
  title: "Final Handout Text",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inlinesHtml(inlines: HandoutInline[]) {
  return inlines
    .map((inline) => {
      let out = escapeHtml(inline.text);
      if (inline.italic) out = `<i>${out}</i>`;
      if (inline.bold) out = `<b>${out}</b>`;
      if (inline.href) out = `<a href="${escapeHtml(inline.href)}">${out}</a>`;
      return out;
    })
    .join("");
}

function blockHtml(block: HandoutBlock) {
  if (block.type === "list") return `<ul>${block.items.map((item) => `<li>${inlinesHtml(item.inlines)}</li>`).join("")}</ul>`;
  if (block.type === "paragraph_title") return `<p><b>${inlinesHtml(block.inlines)}</b></p>`;
  if (block.type === "tagline") return `<p><i>${inlinesHtml(block.inlines)}</i></p>`;
  return `<p>${inlinesHtml(block.inlines)}</p>`;
}

function sectionHtml(section: HandoutSection) {
  return [
    section.title ? `<p><b>${inlinesHtml(section.title)}</b></p>` : "",
    section.subtitle ? `<p><b>${inlinesHtml(section.subtitle)}</b></p>` : "",
    ...section.body.map(blockHtml),
  ].join("");
}

export default async function FinalHandoutTextPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) notFound();

  const { supabase } = await requireAdmin();
  const { data: handout } = await supabase.from("teaching_handouts").select("id, title, gathering_date, content").eq("id", id).maybeSingle();
  if (!handout) notFound();

  const sections = handoutSections(handout.content);

  return (
    <main className="admin-shell">
      <div className="mx-auto max-w-4xl">
        <Link href={`/admin/handouts/${id}`} className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Back to the handout</Link>
        <header className="mt-4 border-b border-[#284a3b]/10 pb-6">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Final text</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#243d31] sm:text-4xl">{handout.title}</h1>
          <div className="mt-3"><TeachingDateLabel date={handout.gathering_date} /></div>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#607066]">
            This is the handout as it reads now, with every accepted change included. Copy a section and paste it into the Word handout. The copy keeps bold and italic. Make sure every Content Manager proposal on the Revisions page has been decided first.
          </p>
        </header>

        <div className="mt-6 space-y-6">
          {sections.map((section, index) => {
            const label = `section ${index + 1}`;
            return (
              <article key={index} className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5 shadow-lg shadow-[#4d5f52]/8">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-extrabold text-[#243d31]">Section {index + 1}</h2>
                  <CopyButtons html={sectionHtml(section)} text={sectionPlainText(section)} label={label} />
                </div>
                <div className="mt-4">
                  {section.title ? <h3 className="text-xl font-extrabold text-[#243d31]">{renderHandoutInlines(section.title)}</h3> : null}
                  {section.subtitle ? <p className="mt-1 font-bold text-[#607066]">{renderHandoutInlines(section.subtitle)}</p> : null}
                  <pre className="mt-3 whitespace-pre-wrap font-sans text-[15px] leading-7 text-[#243126]">{sectionPlainText({ ...section, title: null, subtitle: null })}</pre>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </main>
  );
}
