"use client";

import { useRef, useState, useTransition } from "react";
import { createTeachingFromImport, previewTeachingImport, type TeachingImportPreview } from "./actions";

const LIMITS = { centralTheme: 400, introduction: 5000, summary: 600, teaserHeading: 100, teaserText: 300 };
const FORMAT_LABEL = { paragraph: "Paragraph", bullets: "Bullets", scripture: "Scripture", takeaway: "Takeaway", quote: "Quote" } as const;

function Count({ label, value, limit }: { label: string; value: string; limit: number }) {
  const over = value.length > limit;
  return (
    <div className="flex justify-between gap-4 text-sm">
      <dt className="text-[#607066]">{label}</dt>
      <dd className={`font-bold ${over ? "text-[#a2472c]" : "text-[#385245]"}`}>{value.length.toLocaleString()} / {limit.toLocaleString()} characters</dd>
    </div>
  );
}

function sectionDetail(section: NonNullable<TeachingImportPreview["teaching"]>["categories"][number]["sections"][number]) {
  if (section.format === "scripture") return `${section.reference} (${section.translation})`;
  if (section.format === "bullets") return `${section.bullets.length} bullet${section.bullets.length === 1 ? "" : "s"}`;
  return `${section.text.length.toLocaleString()} characters`;
}

export function TeachingImportForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<TeachingImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gatheringDate, setGatheringDate] = useState("");
  const [language, setLanguage] = useState<"en" | "es">("en");
  const [pending, startTransition] = useTransition();

  const resetPreview = () => {
    setPreview(null);
    setError(null);
  };

  const handlePreview = () => {
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    setError(null);
    startTransition(async () => {
      const result = await previewTeachingImport(formData);
      if (result.error || !result.preview) {
        setPreview(null);
        setError(result.error ?? "The document could not be previewed.");
        return;
      }
      setPreview(result.preview);
      setGatheringDate(result.preview.suggestedDate ?? "");
    });
  };

  const handleCreate = () => {
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    setError(null);
    startTransition(async () => {
      const result = await createTeachingFromImport(formData);
      if (result?.error) setError(result.error);
    });
  };

  const teaching = preview?.teaching ?? null;

  return (
    <form ref={formRef} onSubmit={(event) => { event.preventDefault(); handlePreview(); }} className="space-y-6">
      <label className="block text-sm font-bold text-[#385245]">
        Language
        <select name="language" value={language} onChange={(event) => { setLanguage(event.target.value === "es" ? "es" : "en"); resetPreview(); }} disabled={pending} className="admin-input">
          <option value="en">English</option>
          <option value="es">Español</option>
        </select>
        <span className="mt-1 block text-xs font-normal text-[#607066]">Which list the teaching appears under on the Teachings page. An Español teaching uses the Bible versions RVR1960 and NVI; an English teaching uses AMP, AMPC, ESV, KJV, NIV and NKJV.</span>
      </label>
      <label className="block text-sm font-bold text-[#385245]">
        Teaching document
        <input name="sourceDocument" type="file" required accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={resetPreview} disabled={pending} className="admin-input py-2" />
        <span className="mt-1 block text-xs font-normal text-[#607066]">A .docx file prepared to the Teaching DOCX Import Format Rules, 8 MiB or smaller. The file is checked and previewed first; nothing is saved until you approve the preview.</span>
      </label>
      <button type="submit" disabled={pending} className="admin-primary-button"><span>{pending && !preview ? "Checking..." : preview ? "Check again" : "Check document"}</span></button>

      {error ? <p role="alert" className="text-sm font-bold text-[#a2472c]">{error}</p> : null}

      {preview ? (
        <section className="space-y-6 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-6 shadow-lg shadow-[#4d5f52]/8" aria-label="Import preview">
          <header>
            <p className="text-xs font-black uppercase tracking-wider text-[#946332]">Preview of {preview.fileName}</p>
            <h2 className="mt-2 text-2xl font-extrabold text-[#243d31]">{teaching?.title ?? "This document cannot be imported yet"}</h2>
          </header>

          {preview.errors.length ? (
            <div role="alert" className="rounded-xl border border-[#a2472c]/30 bg-[#fbeeea] p-4">
              <h3 className="text-sm font-extrabold text-[#a2472c]">{preview.errors.length} error{preview.errors.length === 1 ? "" : "s"} to fix in Word</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#7d2f1a]">{preview.errors.map((message, index) => <li key={index}>{message}</li>)}</ul>
            </div>
          ) : null}

          {preview.warnings.length ? (
            <div className="rounded-xl border border-[#c49a3a]/40 bg-[#fbf4e1] p-4">
              <h3 className="text-sm font-extrabold text-[#7a5a12]">{preview.warnings.length} warning{preview.warnings.length === 1 ? "" : "s"} (does not block the import)</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#6b5013]">{preview.warnings.map((message, index) => <li key={index}>{message}</li>)}</ul>
            </div>
          ) : null}

          {teaching ? (
            <>
              <dl className="grid gap-2">
                <Count label="Central Theme" value={teaching.centralTheme} limit={LIMITS.centralTheme} />
                <Count label="Introduction" value={teaching.introduction} limit={LIMITS.introduction} />
                <Count label="Short Summary" value={teaching.summary} limit={LIMITS.summary} />
                {teaching.teaser1Heading || teaching.teaser1Text || teaching.teaser2Heading || teaching.teaser2Text ? (
                  <>
                    <Count label="Homepage teaser 1 heading" value={teaching.teaser1Heading} limit={LIMITS.teaserHeading} />
                    <Count label="Homepage teaser 1 text" value={teaching.teaser1Text} limit={LIMITS.teaserText} />
                    {teaching.teaser2Heading || teaching.teaser2Text ? (
                      <>
                        <Count label="Homepage teaser 2 heading" value={teaching.teaser2Heading} limit={LIMITS.teaserHeading} />
                        <Count label="Homepage teaser 2 text" value={teaching.teaser2Text} limit={LIMITS.teaserText} />
                      </>
                    ) : null}
                  </>
                ) : (
                  <div className="flex justify-between gap-4 text-sm"><dt className="text-[#607066]">Homepage teasers</dt><dd className="font-bold text-[#7a5a12]">None in this file</dd></div>
                )}
              </dl>

              {preview.source ? (
                <div className="rounded-xl border border-[#1a4fb4]/20 bg-[#e8f0fe] p-4 text-sm text-[#1a3f8a]">
                  <p className="font-extrabold">This file was exported from “{preview.source.title}” ({preview.source.language === "es" ? "Español" : "English"}).</p>
                  {preview.source.language === language ? (
                    <p className="mt-1">The Language above is the same as that teaching&apos;s, so it cannot be linked as its translation. Change the Language if this is a translation.</p>
                  ) : preview.source.alreadyPaired ? (
                    <p className="mt-1">That teaching already has a translation linked, so this draft will not be linked automatically. You can link it later from the edit page.</p>
                  ) : (
                    <label className="mt-2 flex items-start gap-3 font-bold">
                      <input type="checkbox" name="linkSource" value={preview.source.id} defaultChecked disabled={pending} className="mt-1 h-4 w-4" />
                      <span>Link this draft as the {language === "es" ? "Español" : "English"} version of “{preview.source.title}”. The two public pages will then point to each other once both are published.</span>
                    </label>
                  )}
                </div>
              ) : null}

              <div className="space-y-4">
                {teaching.categories.map((category, categoryIndex) => (
                  <div key={categoryIndex} className="rounded-xl border border-[#284a3b]/10 bg-white/70 p-4">
                    <h3 className="font-extrabold text-[#243d31]">{category.title}</h3>
                    <ol className="mt-3 space-y-2 text-sm">
                      {category.sections.map((section, sectionIndex) => (
                        <li key={sectionIndex} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <span className="rounded-full bg-[#e7efe9] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#326048]">{FORMAT_LABEL[section.format]}</span>
                          <span className="font-bold text-[#385245]">{section.showTitle ? section.title : "Untitled (hidden heading)"}</span>
                          <span className="text-[#607066]">{sectionDetail(section)}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>

              <label className="block text-sm font-bold text-[#385245]">
                Gathering date
                <input name="gatheringDate" type="date" value={gatheringDate} onChange={(event) => setGatheringDate(event.target.value)} disabled={pending} className="admin-input" />
                <span className="mt-1 block text-xs font-normal text-[#607066]">{preview.suggestedDate ? "Suggested from the file name. Confirm or change it." : "Optional. You can also set it later on the edit page."}</span>
              </label>

              <p className="text-sm text-[#607066]">Approving creates a private <strong>draft</strong>. Chalkboards, the footer, the printable PDF link and publishing are completed afterward on the edit page.</p>
              <button type="button" onClick={handleCreate} disabled={pending || !preview.ok} className="admin-primary-button"><span>{pending ? "Creating draft..." : "Approve and create draft teaching"}</span></button>
            </>
          ) : null}
        </section>
      ) : null}
    </form>
  );
}
