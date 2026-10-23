import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/supabase/admin";
import { TeachingChoiceOptions, loadTeachingChoices } from "../../teaching-choice";
import { createHandout } from "../actions";
import { ReadmeButton } from "./readme-button";
import { GuideMarkdown } from "./readme-markdown";

export const metadata: Metadata = {
  title: "Create new handout",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  title: "The title is required and must be 200 characters or fewer.",
  date: "Choose the date of the teaching this handout goes with.",
  teaching: "That teaching could not be found.",
  version: "The version name must be 60 characters or fewer.",
  create: "The handout could not be created. Nothing was saved.",
};

// Nothing is created until this form is saved, so leaving the page leaves no empty handout behind.
export default async function NewHandoutPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const flags = await searchParams;
  const { supabase } = await requireAdmin();
  const teachings = await loadTeachingChoices(supabase);
  const guide = await readFile(path.join(process.cwd(), "docs", "handout-readme.md"), "utf8");

  return (
    <main className="admin-shell">
      <div className="mx-auto max-w-3xl">
        <Link href="/admin/handouts" className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Back to handouts</Link>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-[#243d31]">Create new handout</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#607066]">Enter the details and save. The handout is created when you save; you then upload the Word draft on its page.</p>
        <div className="mt-4">
          <ReadmeButton><GuideMarkdown source={guide} /></ReadmeButton>
        </div>
        {flags.error ? <p role="alert" className="mt-6 text-sm font-bold text-[#a2472c]">{ERRORS[flags.error] ?? ERRORS.create}</p> : null}
        <form action={createHandout} className="mt-6 space-y-4 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5">
          <label className="block text-sm font-bold text-[#385245]">
            Publication
            <select name="language" defaultValue="en" className="admin-input">
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
          </label>
          <label className="block text-sm font-bold text-[#385245]">
            Title
            <input name="title" required maxLength={200} className="admin-input" placeholder="For example: From Glory to Glory" />
            <span className="mt-1 block text-xs font-normal text-[#607066]">Also the name it will have in the public PDF library.</span>
          </label>
          <label className="block text-sm font-bold text-[#385245]">
            Version name <span className="font-normal text-[#607066]">(optional)</span>
            <input name="versionLabel" maxLength={60} className="admin-input" placeholder="For example: Honduras" />
            <span className="mt-1 block text-xs font-normal text-[#607066]">Only when the same handout is published in more than one version. Just the audience, like &ldquo;Honduras&rdquo; or &ldquo;US&rdquo;, not the full title.</span>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-bold text-[#385245]">
              Teaching date
              <input name="gatheringDate" type="date" required className="admin-input" />
              <span className="mt-1 block text-xs font-normal text-[#607066]">The date of the teaching this handout goes with.</span>
            </label>
            <label className="block text-sm font-bold text-[#385245]">
              Teaching
              <select name="teachingId" defaultValue="" className="admin-input"><TeachingChoiceOptions teachings={teachings} selectedId={null} /></select>
            </label>
          </div>
          <button type="submit" className="admin-primary-button"><span>Save and continue</span></button>
        </form>
      </div>
    </main>
  );
}
