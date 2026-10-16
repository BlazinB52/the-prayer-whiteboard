"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { PRINTABLE_PDF_BUCKET } from "@/lib/printable-pdf-links";
import { cleanupPrintablePdfUpload, createPrintablePdfUploadTarget } from "../printable-pdfs/actions";
import { TeachingChoiceOptions, type TeachingChoice } from "../teaching-choice";
import Link from "next/link";
import { deleteHandout, publishHandout, saveHandoutDetails, setHandoutFooter, unpublishHandout, uploadHandoutDraft, type HandoutDraftState } from "./actions";

type Message = { ok: boolean; text: string } | null;

function MessageLine({ message }: { message: Message }) {
  if (!message) return null;
  return <p role={message.ok ? "status" : "alert"} className={`text-sm font-bold ${message.ok ? "text-[#326048]" : "text-[#a2472c]"}`}>{message.text}</p>;
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

// A hung request should never leave a button stuck on a spinner forever.
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out. Please try again.`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Title, the date of the teaching the handout goes with, and the teaching itself. */
export function HandoutDetailsForm({
  id,
  title,
  date,
  teachingId,
  teachings,
  untitled,
  versionLabel,
}: {
  id: string;
  title: string;
  date: string | null;
  teachingId: string | null;
  teachings: TeachingChoice[];
  untitled: boolean;
  versionLabel: string | null;
}) {
  const router = useRouter();
  const [titleValue, setTitleValue] = useState(untitled ? "" : title);
  const [dateValue, setDateValue] = useState(date ?? "");
  const [teachingValue, setTeachingValue] = useState(teachingId ?? "");
  const [versionValue, setVersionValue] = useState(versionLabel ?? "");
  const [message, setMessage] = useState<Message>(null);
  const [pending, startTransition] = useTransition();
  const changed = titleValue !== (untitled ? "" : title) || dateValue !== (date ?? "") || teachingValue !== (teachingId ?? "") || versionValue !== (versionLabel ?? "");

  return (
    <form
      className="mt-6 space-y-4 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        startTransition(async () => {
          const result = await saveHandoutDetails(id, titleValue, dateValue, teachingValue, versionValue);
          if (result.error) setMessage({ ok: false, text: result.error });
          else {
            setMessage({ ok: true, text: "Details saved." });
            router.refresh();
          }
        });
      }}
    >
      <h2 className="text-lg font-extrabold text-[#243d31]">1. Details</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-bold text-[#385245] sm:col-span-2">
          Title
          <input value={titleValue} onChange={(event) => setTitleValue(event.target.value)} required maxLength={200} disabled={pending} className="admin-input" placeholder="For example: From Glory to Glory" />
          <span className="mt-1 block text-xs font-normal text-[#607066]">Also the name it will have in the public PDF library.</span>
        </label>
        <label className="block text-sm font-bold text-[#385245] sm:col-span-2">
          Version <span className="font-normal text-[#607066]">(optional)</span>
          <input value={versionValue} onChange={(event) => setVersionValue(event.target.value)} maxLength={60} disabled={pending} className="admin-input" placeholder="For example: Honduras" />
          <span className="mt-1 block text-xs font-normal text-[#607066]">Only when the same handout is published in more than one version. It becomes part of the Word file name.</span>
        </label>
        <label className="block text-sm font-bold text-[#385245]">
          Teaching date
          <input type="date" required value={dateValue} onChange={(event) => setDateValue(event.target.value)} disabled={pending} className="admin-input" />
          <span className="mt-1 block text-xs font-normal text-[#607066]">The date of the teaching this handout goes with.</span>
        </label>
        <label className="block text-sm font-bold text-[#385245]">
          Teaching
          <select value={teachingValue} onChange={(event) => setTeachingValue(event.target.value)} disabled={pending} className="admin-input"><TeachingChoiceOptions teachings={teachings} selectedId={teachingId} /></select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || !changed} className="admin-primary-button"><span>{pending ? "Saving..." : "Save details"}</span></button>
        <MessageLine message={message} />
      </div>
    </form>
  );
}

/** Uploads the Word draft. It replaces the text, so it is closed off once the handout is with the CMs or published. */
export function DraftUpload({ id, hasDraft, sourceFileName, locked }: { id: string; hasDraft: boolean; sourceFileName: string | null; locked: string | null }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<HandoutDraftState | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="mt-6 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5">
      <h2 className="text-lg font-extrabold text-[#243d31]">2. Draft</h2>
      <p className="mt-1 text-sm leading-6 text-[#607066]">
        {hasDraft ? `The draft text came from ${sourceFileName ?? "a Word file"}. ` : "Upload the Word draft of the handout. "}
        Use the styles in the handout template (Heading 1 section title, Subtitle, Heading 2 paragraph title, List Bullet, Quote). Name the file like <strong>20261010_en_handout.docx</strong> (or <strong>es_…</strong> for an Español handout) and the teaching date fills in for you if it is empty.
      </p>
      {locked ? (
        <p className="mt-3 rounded-xl border border-[#c49a3a]/40 bg-[#fbf4e1] px-4 py-3 text-sm font-bold text-[#6b5013]">{locked}</p>
      ) : (
        <form
          ref={formRef}
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!formRef.current) return;
            if (hasDraft && !window.confirm("Replace the current draft text with this file? Anything you edited here is lost.")) return;
            const formData = new FormData(formRef.current);
            setResult(null);
            startTransition(async () => {
              const outcome = await uploadHandoutDraft(id, formData);
              setResult(outcome);
              if (outcome.ok) {
                formRef.current?.reset();
                router.refresh();
              }
            });
          }}
        >
          <input
            name="sourceDocument"
            type="file"
            required
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            disabled={pending}
            className="admin-input py-2"
            aria-label="Word draft"
          />
          <button type="submit" disabled={pending} className="admin-primary-button"><span>{pending ? "Reading the file..." : hasDraft ? "Replace draft" : "Upload draft"}</span></button>
        </form>
      )}

      {result?.error ? (
        <div role="alert" className="mt-4 rounded-xl border border-[#a2472c]/30 bg-[#fbeeea] p-4 text-sm font-bold text-[#7d2f1a]">{result.error}</div>
      ) : null}
      {result?.ok && result.counts ? (
        <p role="status" className="mt-4 rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">
          Saved {result.fileName}: {plural(result.counts.sections, "section", "sections")}, {plural(result.counts.subtitles, "subtitle", "subtitles")}, {plural(result.counts.paragraphTitles, "paragraph title", "paragraph titles")}, {plural(result.counts.paragraphs, "paragraph", "paragraphs")}, {plural(result.counts.bullets, "bullet", "bullets")} and {plural(result.counts.taglines, "closing line", "closing lines")}. If a number looks wrong, a style did not take in Word.
          {result.filled?.title ? ` The title was filled in as "${result.filled.title}".` : ""}
          {result.filled?.date ? ` The teaching date was filled in from the file name (${result.filled.date}); check that it is right.` : ""}
        </p>
      ) : null}
      {result?.warnings?.length ? (
        <div className="mt-4 rounded-xl border border-[#c49a3a]/40 bg-[#fbf4e1] p-4">
          <h3 className="text-sm font-extrabold text-[#7a5a12]">Worth a look</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#6b5013]">{result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
        </div>
      ) : null}
    </section>
  );
}

/** Publishing is adding the final PDF to Printable PDF Links, where the public PDF library shows it. */
export function PublishSection({ id, title, ready }: { id: string; title: string; ready: string | null }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<Message>(null);
  const [phase, setPhase] = useState<"idle" | "uploading" | "publishing">("idle");
  const [pending, startTransition] = useTransition();

  return (
    <section className="mt-6 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5">
      <h2 className="text-lg font-extrabold text-[#243d31]">4. Publish the final handout</h2>
      <p className="mt-1 text-sm leading-6 text-[#607066]">
        When the handout is finished in Word, upload the final PDF here. It is added to <a href="/admin/printable-pdfs" className="font-extrabold text-[#946332] underline underline-offset-2">Printable PDF Links</a> as &quot;{title}&quot; and is then available to the public in the PDF library. Publishing also closes any Content Manager review that is still open.
      </p>
      {ready ? (
        <p className="mt-3 rounded-xl border border-[#c49a3a]/40 bg-[#fbf4e1] px-4 py-3 text-sm font-bold text-[#6b5013]">{ready}</p>
      ) : (
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const file = fileInputRef.current?.files?.[0];
            if (!file || !file.size) {
              setMessage({ ok: false, text: "Choose the final PDF file." });
              return;
            }
            if (!window.confirm(`Publish this handout? "${title}" will be available to the public in the PDF library.`)) return;
            setMessage(null);
            startTransition(async () => {
              let uploadedPath: string | null = null;
              try {
                setPhase("uploading");
                const target = await withTimeout(createPrintablePdfUploadTarget(), 15_000, "Creating the upload destination");
                if (target.error || !target.path || !target.token) {
                  setMessage({ ok: false, text: target.error ?? "The secure upload destination could not be created." });
                  return;
                }
                uploadedPath = target.path;
                const supabase = createClient();
                const { error: uploadError } = await withTimeout(
                  supabase.storage.from(PRINTABLE_PDF_BUCKET).uploadToSignedUrl(target.path, target.token, file, { cacheControl: "public, max-age=31536000, immutable" }),
                  120_000,
                  "Uploading the PDF",
                );
                if (uploadError) {
                  await cleanupPrintablePdfUpload(target.path);
                  setMessage({ ok: false, text: "The PDF could not be uploaded. Please try again." });
                  return;
                }

                setPhase("publishing");
                const result = await withTimeout(publishHandout(id, target.path), 30_000, "Publishing");
                if (result.error) {
                  setMessage({ ok: false, text: result.error });
                  return;
                }
                if (fileInputRef.current) fileInputRef.current.value = "";
                router.refresh();
              } catch (error) {
                if (uploadedPath) await cleanupPrintablePdfUpload(uploadedPath).catch(() => {});
                setMessage({ ok: false, text: error instanceof Error ? error.message : "Something went wrong. Please try again." });
              } finally {
                setPhase("idle");
              }
            });
          }}
        >
          <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" disabled={pending} className="admin-input py-2" aria-label="Final PDF" />
          <p className="text-xs text-[#607066]">A PDF, 25 MiB or smaller.</p>
          <button type="submit" disabled={pending} className="admin-primary-button"><span>{phase === "uploading" ? "Uploading the PDF..." : phase === "publishing" ? "Publishing..." : "Publish handout"}</span></button>
          <MessageLine message={message} />
        </form>
      )}
    </section>
  );
}

export function UnpublishButton({ id }: { id: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<Message>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Unpublish this handout? It is removed from the public PDF library and the published PDF file is deleted. The handout goes back to a draft.")) return;
          setMessage(null);
          startTransition(async () => {
            const result = await unpublishHandout(id);
            if (result.error) setMessage({ ok: false, text: result.error });
            else router.refresh();
          });
        }}
        className="admin-secondary-button"
      >
        <span>{pending ? "Unpublishing..." : "Unpublish"}</span>
      </button>
      <MessageLine message={message} />
    </div>
  );
}

export function DeleteHandoutButton({ id, disabledReason }: { id: string; disabledReason: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <button
        type="button"
        disabled={pending || Boolean(disabledReason)}
        onClick={() => {
          if (!window.confirm("Delete this handout and every Content Manager proposal on it? This cannot be undone.")) return;
          setError(null);
          startTransition(async () => {
            const result = await deleteHandout(id);
            if (result.error) setError(result.error);
            else router.push("/admin/handouts");
          });
        }}
        className="admin-secondary-button text-[#a2472c]"
      >
        <span>{pending ? "Deleting..." : "Delete handout"}</span>
      </button>
      {disabledReason ? <p className="mt-2 text-xs text-[#607066]">{disabledReason}</p> : null}
      {error ? <p role="alert" className="mt-2 text-sm font-bold text-[#a2472c]">{error}</p> : null}
    </div>
  );
}

export type FooterChoice = { id: string; title: string };

/** The footer printed at the bottom of the handout, chosen from the existing footers of the handout's language. */
export function FooterForm({ id, footerId, footers, language }: { id: string; footerId: string | null; footers: FooterChoice[]; language: "en" | "es" }) {
  const router = useRouter();
  const [value, setValue] = useState(footerId ?? "");
  const [message, setMessage] = useState<Message>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="mt-6 space-y-3 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        startTransition(async () => {
          const result = await setHandoutFooter(id, value);
          if (result.error) setMessage({ ok: false, text: result.error });
          else {
            setMessage({ ok: true, text: "Footer saved." });
            router.refresh();
          }
        });
      }}
    >
      <h2 className="text-lg font-extrabold text-[#243d31]">Handout footer</h2>
      <p className="text-sm leading-6 text-[#607066]">
        The small credits block at the bottom of the printed handout. It comes from the {language === "es" ? "Español" : "English"} footers, which are written for the handout and are not a translation of the other language&apos;s footer. Manage them under <Link href="/admin/footers" className="font-extrabold text-[#946332] underline underline-offset-2">Footers</Link>.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm font-bold text-[#385245]">
          Footer
          <select value={value} onChange={(event) => setValue(event.target.value)} disabled={pending} className="admin-input max-w-sm">
            <option value="">No footer chosen</option>
            {footers.map((footer) => <option key={footer.id} value={footer.id}>{footer.title}</option>)}
          </select>
        </label>
        <button type="submit" disabled={pending || value === (footerId ?? "")} className="admin-secondary-button"><span>{pending ? "Saving..." : "Save footer"}</span></button>
        <MessageLine message={message} />
      </div>
      {footers.length === 0 ? <p className="text-sm font-bold text-[#6b5013]">There are no {language === "es" ? "Español" : "English"} footers yet. Add one under Footers first.</p> : null}
    </form>
  );
}

type TranslateResult = { tone: "success"; title: string; editUrl: string; warnings: string[] } | { tone: "error"; message: string; existingId?: string };

/** "Translate to Español": creates the Español handout from this English one. English handouts only. */
export function TranslateToEspanolButton({ handoutId }: { handoutId: string }) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<TranslateResult | null>(null);

  async function translate() {
    setPending(true);
    setResult(null);
    try {
      const response = await fetch("/api/admin/handout/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handout_id: handoutId }),
      });
      const payload = await response.json().catch(() => null);
      if (response.ok && payload?.editUrl) {
        setResult({ tone: "success", title: String(payload.title ?? ""), editUrl: payload.editUrl, warnings: payload.warnings ?? [] });
      } else {
        setResult({ tone: "error", message: payload?.error ?? "The Español handout could not be created. Nothing was saved.", existingId: payload?.existingId });
      }
    } catch {
      setResult({ tone: "error", message: "The Español handout could not be created. Check your connection and try again." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-4 space-y-4">
      <button type="button" onClick={translate} disabled={pending} className="admin-primary-button disabled:cursor-not-allowed disabled:opacity-60">
        <span className="!text-white">{pending ? "Translating… please keep this page open" : "Translate to Español"}</span>
      </button>
      {result?.tone === "error" ? (
        <p role="alert" className="text-sm font-bold text-[#a2472c]">
          {result.message}{result.existingId ? <> <Link href={`/admin/handouts/${result.existingId}`} className="underline underline-offset-2">Open it</Link>.</> : null}
        </p>
      ) : null}
      {result?.tone === "success" ? (
        <div role="status" className="space-y-2 rounded-xl bg-[#e7efe9] p-4 text-sm text-[#2f4d3f]">
          <p className="font-bold">
            Español handout saved: &ldquo;{result.title}&rdquo;.{" "}
            <Link href={result.editUrl} className="font-extrabold text-[#9d5a2f] underline underline-offset-2">Open the Español handout</Link>
          </p>
          {result.warnings.length ? (
            <div>
              <p className="font-bold">Please look at these spots while reviewing:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type BuildReport = {
  sections: { section: number; title: string; sizePt: number; usedPt: number; capacityPt: number; adjustments: string[] }[];
  caption: { lines: number; roomLines: number; blank: boolean } | null;
  footer: { sizePt: number } | null;
  warnings: string[];
};
type BuildOutcome = { tone: "success"; fileName: string; report: BuildReport } | { tone: "error"; message: string; details: string[]; report: BuildReport | null };

/** Builds the Word file from the language's template: the text, the whiteboard and its caption, and the footer. */
export function BuildHandoutSection({ handoutId, language, blocker }: { handoutId: string; language: "en" | "es"; blocker: string | null }) {
  const [pending, setPending] = useState(false);
  const [leaveCaptionBlank, setLeaveCaptionBlank] = useState(false);
  const [outcome, setOutcome] = useState<BuildOutcome | null>(null);

  async function build() {
    setPending(true);
    setOutcome(null);
    try {
      const response = await fetch("/api/admin/handout/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handout_id: handoutId, leave_caption_blank: leaveCaptionBlank }),
      });
      if (response.ok) {
        const fileName = response.headers.get("X-Handout-File") ?? "handout.docx";
        const header = response.headers.get("X-Handout-Report");
        const report = header ? (JSON.parse(decodeURIComponent(header)) as BuildReport) : { sections: [], caption: null, footer: null, warnings: [] };
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        setOutcome({ tone: "success", fileName, report });
      } else {
        const payload = await response.json().catch(() => null);
        setOutcome({ tone: "error", message: payload?.error ?? "The handout could not be built.", details: Array.isArray(payload?.details) ? payload.details : [], report: payload?.report ?? null });
      }
    } catch {
      setOutcome({ tone: "error", message: "The handout could not be built. Check your connection and try again.", details: [], report: null });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5">
      <h2 className="text-lg font-extrabold text-[#243d31]">Build the handout (Word file)</h2>
      <p className="mt-1 text-sm leading-6 text-[#607066]">
        Fills the {language === "es" ? "Español" : "English"} handout template with this text, the {language === "es" ? "Español" : "English"} whiteboard and its caption from the teaching, and the footer chosen above. The text boxes stay exactly where they are. If a section does not fit, the build stops and says which and by how much; nothing is cut. Open the file in Word, check it, and save the PDF to publish.
      </p>
      {blocker ? (
        <p className="mt-3 rounded-xl border border-[#c49a3a]/40 bg-[#fbf4e1] px-4 py-3 text-sm font-bold text-[#6b5013]">{blocker}</p>
      ) : (
        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-3 text-sm font-bold text-[#385245]">
            <input type="checkbox" checked={leaveCaptionBlank} onChange={(event) => setLeaveCaptionBlank(event.target.checked)} disabled={pending} />
            Leave the whiteboard caption blank. I will add it in Word.
          </label>
          <button type="button" onClick={build} disabled={pending} className="admin-primary-button disabled:cursor-not-allowed disabled:opacity-60">
            <span className="!text-white">{pending ? "Building…" : "Build handout (.docx)"}</span>
          </button>
        </div>
      )}

      {outcome?.tone === "error" ? (
        <div role="alert" className="mt-4 text-sm font-bold text-[#a2472c]">
          <p>{outcome.message}</p>
          {outcome.details.length ? <ul className="mt-2 list-disc space-y-1 pl-5 font-normal">{outcome.details.map((detail) => <li key={detail}>{detail}</li>)}</ul> : null}
        </div>
      ) : null}

      {outcome ? <BuildReportView report={outcome.report} fileName={outcome.tone === "success" ? outcome.fileName : null} /> : null}
    </section>
  );
}

function BuildReportView({ report, fileName }: { report: BuildReport | null; fileName: string | null }) {
  if (!report) return null;
  return (
    <div role="status" className={`mt-4 space-y-3 rounded-xl p-4 text-sm ${fileName ? "bg-[#e7efe9] text-[#2f4d3f]" : "bg-[#f4efe5] text-[#385245]"}`}>
      {fileName ? <p className="font-bold">Built and downloaded: {fileName}</p> : <p className="font-bold">How far the build got:</p>}
      <ul className="list-disc space-y-1 pl-5">
        {report.sections.map((section) => (
          <li key={section.section}>
            Section {section.section} ({section.title}): {section.sizePt} pt text, {Math.round((section.usedPt / section.capacityPt) * 100)}% of its box{section.adjustments.length ? `; ${section.adjustments.join("; ")}` : ""}.
          </li>
        ))}
        {report.caption ? <li>{report.caption.blank ? "Caption: left blank with a yellow placeholder to fill in." : `Caption: ${report.caption.lines} of ${report.caption.roomLines} lines.`}</li> : null}
        {report.footer ? <li>Footer: {report.footer.sizePt} pt.</li> : null}
      </ul>
      {report.warnings.length ? (
        <div>
          <p className="font-bold">Look at these in Word:</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">{report.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </div>
      ) : null}
    </div>
  );
}
