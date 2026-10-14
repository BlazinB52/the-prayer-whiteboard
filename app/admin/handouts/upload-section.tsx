"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TeachingChoiceOptions, type TeachingChoice } from "../teaching-choice";
import { HandoutContent } from "./handout-content";
import { previewHandout, saveHandout, type HandoutPreview } from "./actions";

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

export function UploadSection({ teachings }: { teachings: TeachingChoice[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<HandoutPreview | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const resetPreview = () => {
    setPreview(null);
    setError(null);
  };

  const handlePreview = () => {
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    resetPreview();
    startTransition(async () => {
      const result = await previewHandout(formData);
      if (result.error || !result.preview) {
        setError(result.error ?? "The document could not be previewed.");
        return;
      }
      setPreview(result.preview);
      setTitle(result.preview.handout?.title ?? "");
      setDate(result.preview.suggestedDate ?? "");
    });
  };

  const handleSave = () => {
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    setError(null);
    startTransition(async () => {
      const result = await saveHandout(formData);
      if (result.error || !result.id) {
        setError(result.error ?? "The handout could not be saved.");
        return;
      }
      router.push(`/admin/handouts/${result.id}?saved=1`);
    });
  };

  const handout = preview?.handout ?? null;
  const counts = preview?.counts ?? null;
  const blocked = Boolean(preview?.unsupportedLanguage);

  return (
    <section className="border-b border-[#284a3b]/10 py-7">
      <h2 className="text-xl font-extrabold text-[#243d31]">Upload a handout</h2>
      <form ref={formRef} onSubmit={(event) => { event.preventDefault(); handlePreview(); }} className="mt-4 space-y-5">
        <label className="block text-sm font-bold text-[#385245]">
          Word file
          <input
            name="sourceDocument"
            type="file"
            required
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={resetPreview}
            disabled={pending}
            className="admin-input py-2"
          />
          <span className="mt-1 block text-xs font-normal text-[#607066]">
            Name the file like <strong>en_20261010_handout.docx</strong> (language, then the teaching date) and the date fills in for you. Use the styles in the handout template: Heading 1 for a section title, Subtitle, Heading 2 for a paragraph title, List Bullet, and Quote for the closing line. Nothing is saved until you approve the preview.
          </span>
        </label>

        <button type="submit" disabled={pending} className="admin-primary-button">
          <span>{pending && !preview ? "Checking..." : preview ? "Check again" : "Preview handout"}</span>
        </button>

        {error ? <p role="alert" className="text-sm font-bold text-[#a2472c]">{error}</p> : null}

        {preview ? (
          <div className="space-y-5 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-6 shadow-lg shadow-[#4d5f52]/8" aria-label="Handout preview">
            <p className="text-xs font-black uppercase tracking-wider text-[#946332]">Preview of {preview.fileName}</p>

            {preview.unsupportedLanguage ? (
              <div role="alert" className="rounded-xl border border-[#a2472c]/30 bg-[#fbeeea] p-4 text-sm font-bold text-[#7d2f1a]">
                This file name starts with &quot;{preview.unsupportedLanguage}_&quot;. Only English handouts (en_) are supported for now.
              </div>
            ) : null}

            {preview.errors.length ? (
              <div role="alert" className="rounded-xl border border-[#a2472c]/30 bg-[#fbeeea] p-4">
                <h3 className="text-sm font-extrabold text-[#a2472c]">This document cannot be saved yet</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#7d2f1a]">{preview.errors.map((message, index) => <li key={index}>{message}</li>)}</ul>
              </div>
            ) : null}

            {preview.warnings.length ? (
              <div className="rounded-xl border border-[#c49a3a]/40 bg-[#fbf4e1] p-4">
                <h3 className="text-sm font-extrabold text-[#7a5a12]">Worth a look (does not block saving)</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#6b5013]">{preview.warnings.map((message, index) => <li key={index}>{message}</li>)}</ul>
              </div>
            ) : null}

            {handout && counts ? (
              <>
                <p className="rounded-xl border border-[#326048]/20 bg-[#e7efe9] px-4 py-3 text-sm font-bold text-[#326048]">
                  Found {plural(counts.sections, "section", "sections")}, {plural(counts.subtitles, "subtitle", "subtitles")}, {plural(counts.paragraphTitles, "paragraph title", "paragraph titles")}, {plural(counts.paragraphs, "paragraph", "paragraphs")}, {plural(counts.bullets, "bullet", "bullets")} and {plural(counts.taglines, "closing line", "closing lines")}. If a number looks wrong, a style did not take in Word.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-bold text-[#385245] sm:col-span-2">
                    Title
                    <input name="title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} disabled={pending} className="admin-input" />
                    <span className="mt-1 block text-xs font-normal text-[#607066]">Only used to find the handout in your lists.</span>
                  </label>
                  <label className="block text-sm font-bold text-[#385245]">
                    Teaching date
                    <input name="gatheringDate" type="date" required value={date} onChange={(event) => setDate(event.target.value)} disabled={pending} className="admin-input" />
                    <span className="mt-1 block text-xs font-normal text-[#607066]">{preview.suggestedDate ? "Read from the file name. Check that it is right." : "Required. The file name did not start with a date."}</span>
                  </label>
                  <label className="block text-sm font-bold text-[#385245] sm:col-span-2">
                    Teaching
                    <select name="teachingId" defaultValue="" disabled={pending} className="admin-input"><TeachingChoiceOptions teachings={teachings} /></select>
                    <span className="mt-1 block text-xs font-normal text-[#607066]">The teaching this handout goes with. It can be changed later.</span>
                  </label>
                  <p className="self-center text-sm font-bold text-[#385245]">This is saved as a draft that Content Managers cannot see. Send it to them for review from its page. It is never published on the site.</p>
                </div>

                <div className="max-h-[32rem] overflow-y-auto rounded-xl border border-[#284a3b]/10 bg-white p-5">
                  <HandoutContent blocks={handout.blocks} />
                </div>

                <button type="button" onClick={handleSave} disabled={pending || !preview.ok || blocked || !date} className="admin-primary-button">
                  <span>{pending ? "Saving..." : "Save handout"}</span>
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </form>
    </section>
  );
}
