import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/supabase/admin";
import { loadTeachingChoices } from "../../teaching-choice";
import { formatTeachingDateShort } from "@/lib/teaching-date";
import { VersionForm, type VersionBase } from "./version-form";

export const metadata: Metadata = {
  title: "Add another version",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ERRORS: Record<string, string> = {
  base: "Choose the handout this version is made from.",
  version: "Give the version a name, such as Honduras.",
  title: "The title is required and must be 200 characters or fewer.",
  date: "Choose the date of the teaching this handout goes with.",
  teaching: "That teaching could not be found.",
  create: "The version could not be created. Nothing was saved.",
};

export default async function AddHandoutVersionPage({ searchParams }: { searchParams: Promise<{ from?: string; error?: string }> }) {
  const flags = await searchParams;
  const { supabase } = await requireAdmin();
  const [{ data }, teachings] = await Promise.all([
    supabase
      .from("teaching_handouts")
      .select("id, title, gathering_date, teaching_id, language, status, version_label")
      .order("gathering_date", { ascending: false, nullsFirst: true })
      .order("created_at", { ascending: false }),
    loadTeachingChoices(supabase),
  ]);
  const bases: VersionBase[] = ((data as { id: string; title: string; gathering_date: string | null; teaching_id: string | null; language: string; status: string; version_label: string | null }[] | null) ?? [])
    .filter((row) => row.gathering_date)
    .map((row) => ({
      id: row.id,
      title: row.title,
      date: row.gathering_date as string,
      teachingId: row.teaching_id ?? "",
      language: row.language === "es" ? "es" : "en",
      versionLabel: row.version_label ?? "",
      label: `${formatTeachingDateShort(row.gathering_date)} · ${row.title}${row.version_label ? ` (${row.version_label})` : ""} · ${row.language === "es" ? "Español" : "English"}${row.status === "published" ? "" : " (draft)"}`,
    }));
  const from = flags.from && UUID_PATTERN.test(flags.from) ? flags.from : "";

  return (
    <main className="admin-shell">
      <div className="mx-auto max-w-3xl">
        <Link href={from ? `/admin/handouts/${from}` : "/admin/handouts"} className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">{from ? "Back to the handout" : "Back to handouts"}</Link>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-[#243d31]">Add another version</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#607066]">
          For a handout that is published in more than one version, such as Honduras and the US. Each version is its own handout with its own text, footer and final PDF, so you build and publish each one on its own page. To remove a version, open it, unpublish it if it is published, and delete it there.
        </p>
        {flags.error ? <p role="alert" className="mt-6 text-sm font-bold text-[#a2472c]">{ERRORS[flags.error] ?? ERRORS.create}</p> : null}
        <VersionForm bases={bases} teachings={teachings} initialFromId={from} />
      </div>
    </main>
  );
}
