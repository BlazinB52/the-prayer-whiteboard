"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { OutlineContent } from "@/app/teaching-outlines/outline-content";
import {
  createOutlineCategory,
  deleteOutline,
  deleteOutlineCategory,
  moveOutlineToCategory,
  previewOutline,
  renameOutlineCategory,
  saveOutline,
  setOutlineStatus,
  type OutlineActionState,
  type OutlinePreview,
} from "./actions";

export type ManagerCategory = { id: string; name: string };
export type ManagerOutline = {
  id: string;
  title: string;
  subtitle: string | null;
  categoryId: string;
  language: "en" | "es";
  gatheringDate: string | null;
  status: "draft" | "published";
  createdAt: string;
  downloadHref: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value.length === 10 ? `${value}T00:00:00Z` : value));
}

function UploadSection({ categories }: { categories: ManagerCategory[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<OutlinePreview | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const resetPreview = () => {
    setPreview(null);
    setError(null);
    setSaved(null);
  };

  const handlePreview = () => {
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    resetPreview();
    startTransition(async () => {
      const result = await previewOutline(formData);
      if (result.error || !result.preview) {
        setError(result.error ?? "The document could not be previewed.");
        return;
      }
      setPreview(result.preview);
      setTitle(result.preview.outline?.title ?? "");
      setDate(result.preview.suggestedDate ?? "");
    });
  };

  const handleSave = () => {
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    setError(null);
    startTransition(async () => {
      const result = await saveOutline(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(`"${title}" was saved.`);
      setPreview(null);
      formRef.current?.reset();
      router.refresh();
    });
  };

  const outline = preview?.outline ?? null;

  return (
    <section className="border-b border-[#284a3b]/10 py-7">
      <h2 className="text-xl font-extrabold text-[#243d31]">Upload an outline</h2>
      {categories.length === 0 ? (
        <p className="mt-3 text-sm text-[#607066]">Add a category below first, then come back to upload.</p>
      ) : (
        <form ref={formRef} onSubmit={(event) => { event.preventDefault(); handlePreview(); }} className="mt-4 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-bold text-[#385245]">
              Category
              <select name="categoryId" required defaultValue="" disabled={pending} className="admin-input">
                <option value="" disabled>Choose a category</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <label className="block text-sm font-bold text-[#385245]">
              Language
              <select name="language" defaultValue="en" disabled={pending} className="admin-input">
                <option value="en">English</option>
                <option value="es">Español</option>
              </select>
            </label>
          </div>
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
              A normal .docx, 8 MiB or smaller. Use Word&apos;s built-in Title, Heading 1/2, and bulleted or numbered list styles and it will look right automatically. Nothing is saved until you approve the preview.
            </span>
          </label>

          <button type="submit" disabled={pending} className="admin-primary-button">
            <span>{pending && !preview ? "Checking..." : preview ? "Check again" : "Preview outline"}</span>
          </button>

          {error ? <p role="alert" className="text-sm font-bold text-[#a2472c]">{error}</p> : null}
          {saved ? <p role="status" className="text-sm font-bold text-[#326048]">{saved}</p> : null}

          {preview ? (
            <div className="space-y-5 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-6 shadow-lg shadow-[#4d5f52]/8" aria-label="Outline preview">
              <p className="text-xs font-black uppercase tracking-wider text-[#946332]">Preview of {preview.fileName}</p>

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

              {outline ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm font-bold text-[#385245] sm:col-span-2">
                      Title
                      <input name="title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} disabled={pending} className="admin-input" />
                    </label>
                    <label className="block text-sm font-bold text-[#385245]">
                      Teaching date
                      <input name="gatheringDate" type="date" value={date} onChange={(event) => setDate(event.target.value)} disabled={pending} className="admin-input" />
                      <span className="mt-1 block text-xs font-normal text-[#607066]">{preview.suggestedDate ? "Suggested from the file name." : "Optional."}</span>
                    </label>
                    <label className="flex items-center gap-3 self-center text-sm font-bold text-[#385245]">
                      <input name="publish" type="checkbox" defaultChecked className="h-5 w-5 accent-[#326048]" disabled={pending} />
                      Publish now (uncheck to save as a draft)
                    </label>
                  </div>

                  <div className="max-h-[32rem] overflow-y-auto rounded-xl border border-[#284a3b]/10 bg-white p-5">
                    {outline.subtitle ? <p className="text-xs font-black uppercase tracking-wider text-[#946332]">{outline.subtitle}</p> : null}
                    <h3 className="mt-1 text-3xl font-extrabold tracking-tight text-[#243d31]">{title || outline.title}</h3>
                    <OutlineContent blocks={outline.blocks} />
                  </div>

                  <button type="button" onClick={handleSave} disabled={pending || !preview.ok} className="admin-primary-button">
                    <span>{pending ? "Saving..." : "Save outline"}</span>
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </form>
      )}
    </section>
  );
}

function CategoriesSection({ categories, counts }: { categories: ManagerCategory[]; counts: Map<string, number> }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<OutlineActionState>, onDone?: () => void) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else {
        onDone?.();
        router.refresh();
      }
    });
  };

  return (
    <section className="border-b border-[#284a3b]/10 py-7">
      <h2 className="text-xl font-extrabold text-[#243d31]">Categories</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          run(() => createOutlineCategory(name), () => setName(""));
        }}
        className="mt-4 flex flex-col gap-3 sm:flex-row"
      >
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="New category name" maxLength={80} disabled={pending} aria-label="New category name" className="admin-input sm:max-w-sm" />
        <button type="submit" disabled={pending || !name.trim()} className="admin-primary-button"><span>Add category</span></button>
      </form>
      {error ? <p role="alert" className="mt-3 text-sm font-bold text-[#a2472c]">{error}</p> : null}

      {categories.length ? (
        <ul className="mt-4 divide-y divide-[#284a3b]/10 rounded-xl border border-[#284a3b]/10 bg-[#fffdf8]">
          {categories.map((category) => (
            <li key={category.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              {editingId === category.id ? (
                <form
                  className="flex flex-1 flex-wrap gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    run(() => renameOutlineCategory(category.id, editName), () => setEditingId(null));
                  }}
                >
                  <input value={editName} onChange={(event) => setEditName(event.target.value)} maxLength={80} aria-label="Category name" autoFocus className="admin-input sm:max-w-xs" />
                  <button type="submit" disabled={pending} className="admin-primary-button"><span>Save</span></button>
                  <button type="button" onClick={() => setEditingId(null)} className="admin-secondary-button"><span>Cancel</span></button>
                </form>
              ) : (
                <>
                  <span className="flex-1 font-bold text-[#243d31]">
                    {category.name} <span className="text-xs font-normal text-[#607066]">({counts.get(category.id) ?? 0})</span>
                  </span>
                  <button type="button" onClick={() => { setEditingId(category.id); setEditName(category.name); }} className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Rename</button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => { if (window.confirm(`Delete the category "${category.name}"?`)) run(() => deleteOutlineCategory(category.id)); }}
                    className="text-sm font-extrabold text-[#a2472c] hover:underline"
                  >
                    Delete
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function OutlineList({ categories, outlines }: { categories: ManagerCategory[]; outlines: ManagerOutline[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<OutlineActionState>) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else router.refresh();
    });
  };

  return (
    <section className="py-7">
      <h2 className="text-xl font-extrabold text-[#243d31]">Uploaded outlines</h2>
      {error ? <p role="alert" className="mt-3 text-sm font-bold text-[#a2472c]">{error}</p> : null}
      {outlines.length === 0 ? <p className="mt-3 text-sm text-[#607066]">No outlines have been uploaded yet.</p> : null}

      <div className="mt-4 space-y-8">
        {categories.map((category) => {
          const rows = outlines.filter((outline) => outline.categoryId === category.id);
          if (!rows.length) return null;
          return (
            <div key={category.id}>
              <h3 className="text-sm font-black uppercase tracking-wider text-[#946332]">{category.name}</h3>
              <ul className="mt-3 space-y-3">
                {rows.map((outline) => (
                  <li key={outline.id} className="rounded-xl border border-[#284a3b]/10 bg-[#fffdf8] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <Link href={`/admin/outlines/${outline.id}`} className="text-lg font-extrabold text-[#243d31] hover:text-[#a85e32]">{outline.title}</Link>
                        <p className="mt-1 text-xs text-[#607066]">
                          {outline.language === "es" ? "Español" : "English"}
                          {outline.gatheringDate ? ` · Taught ${formatDate(outline.gatheringDate)}` : ""} · Uploaded {formatDate(outline.createdAt)}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${outline.status === "published" ? "bg-[#e7efe9] text-[#326048]" : "bg-[#f1e6d2] text-[#7a5a12]"}`}>
                        {outline.status}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-extrabold">
                      <Link href={`/admin/outlines/${outline.id}`} className="text-[#946332] hover:text-[#a85e32]">View</Link>
                      <a href={outline.downloadHref} className="text-[#946332] hover:text-[#a85e32]">Download .docx</a>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => setOutlineStatus(outline.id, outline.status === "published" ? "draft" : "published"))}
                        className="text-[#244a3a] hover:text-[#a85e32]"
                      >
                        {outline.status === "published" ? "Unpublish" : "Publish"}
                      </button>
                      <label className="flex items-center gap-2 font-bold text-[#385245]">
                        Category
                        <select
                          value={outline.categoryId}
                          disabled={pending}
                          onChange={(event) => run(() => moveOutlineToCategory(outline.id, event.target.value))}
                          className="rounded-lg border border-[#284a3b]/20 bg-white px-2 py-1 text-sm"
                        >
                          {categories.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                        </select>
                      </label>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => { if (window.confirm(`Delete "${outline.title}"? This also removes the stored Word file.`)) run(() => deleteOutline(outline.id)); }}
                        className="text-[#a2472c] hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function OutlineManager({ categories, outlines }: { categories: ManagerCategory[]; outlines: ManagerOutline[] }) {
  const counts = new Map<string, number>();
  for (const outline of outlines) counts.set(outline.categoryId, (counts.get(outline.categoryId) ?? 0) + 1);

  return (
    <>
      <UploadSection categories={categories} />
      <CategoriesSection categories={categories} counts={counts} />
      <OutlineList categories={categories} outlines={outlines} />
    </>
  );
}
