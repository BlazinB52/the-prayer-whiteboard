"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { PRINTABLE_PDF_BUCKET } from "@/lib/printable-pdf-links";
import { cleanupPrintablePdfUpload, createPrintablePdfUploadTarget } from "../printable-pdfs/actions";
import { TeachingChoiceOptions, type TeachingChoice } from "../teaching-choice";
import { deleteHandout, publishHandout, saveHandoutDetails, unpublishHandout, uploadHandoutDraft, type HandoutDraftState } from "./actions";

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
}: {
  id: string;
  title: string;
  date: string | null;
  teachingId: string | null;
  teachings: TeachingChoice[];
  untitled: boolean;
}) {
  const router = useRouter();
  const [titleValue, setTitleValue] = useState(untitled ? "" : title);
  const [dateValue, setDateValue] = useState(date ?? "");
  const [teachingValue, setTeachingValue] = useState(teachingId ?? "");
  const [message, setMessage] = useState<Message>(null);
  const [pending, startTransition] = useTransition();
  const changed = titleValue !== (untitled ? "" : title) || dateValue !== (date ?? "") || teachingValue !== (teachingId ?? "");

  return (
    <form
      className="mt-6 space-y-4 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        startTransition(async () => {
          const result = await saveHandoutDetails(id, titleValue, dateValue, teachingValue);
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
        Use the styles in the handout template (Heading 1 section title, Subtitle, Heading 2 paragraph title, List Bullet, Quote). Name the file like <strong>en_20261010_handout.docx</strong> and the teaching date fills in for you if it is empty.
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
