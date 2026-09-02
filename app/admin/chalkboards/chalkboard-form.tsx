"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cleanupChalkboardUpload, createChalkboardUploadTarget, finalizeChalkboardUpload } from "./actions";

type Teaching = { id: string; title: string; categories: Category[] };
type Category = { id: string; title: string; sections: Section[] };
type Section = { id: string; category_id: string; title: string };

export function ChalkboardForm({ teachings }: { teachings: Teaching[] }) {
  const router = useRouter();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const initialTeachingId = teachings[0]?.id ?? "";
  const [teachingId, setTeachingId] = useState(initialTeachingId);
  const [categoryId, setCategoryId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [placement, setPlacement] = useState("teaching");
  const [includeInPrint, setIncludeInPrint] = useState(true);
  const [allowDownload, setAllowDownload] = useState(true);
  const [title, setTitle] = useState("");
  const [altText, setAltText] = useState("");
  const [caption, setCaption] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ error?: string; saved?: boolean }>({});

  const teaching = teachings.find((item) => item.id === teachingId);
  const categories = teaching?.categories ?? [];
  const sections = categories.find((category) => category.id === categoryId)?.sections ?? [];

  const changeTeaching = (value: string) => {
    setTeachingId(value);
    setCategoryId("");
    setSectionId("");
  };

  const changePlacement = (value: string) => {
    setPlacement(value);
    setCategoryId("");
    setSectionId("");
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("image");
    if (!(file instanceof File) || !file.size) {
      setMessage({ error: "Choose a portrait JPEG, PNG, or WebP image." });
      return;
    }

    setMessage({});
    startTransition(async () => {
      const target = await createChalkboardUploadTarget(teachingId, file.name);
      if (target.error || !target.path || !target.token || !target.assetGroupId) {
        setMessage({ error: target.error ?? "The secure upload destination could not be created." });
        return;
      }

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage.from("chalkboards").uploadToSignedUrl(target.path, target.token, file);
      if (uploadError) {
        await cleanupChalkboardUpload(teachingId, target.assetGroupId, target.path);
        setMessage({ error: "The image could not be uploaded. Please try again." });
        return;
      }

      const result = await finalizeChalkboardUpload({
        teachingId,
        assetGroupId: target.assetGroupId,
        incomingPath: target.path,
        title: String(form.get("title") ?? ""),
        altText: String(form.get("altText") ?? ""),
        caption: String(form.get("caption") ?? ""),
        categoryId: placement === "category" || placement === "section" ? categoryId : "",
        sectionId: placement === "section" ? sectionId : "",
        includeInPrint,
        allowDownload,
      });
      if (result.error) {
        await cleanupChalkboardUpload(teachingId, target.assetGroupId, target.path);
        setMessage({ error: result.error });
        return;
      }

      setTeachingId(initialTeachingId);
      setPlacement("teaching");
      setCategoryId("");
      setSectionId("");
      setIncludeInPrint(true);
      setAllowDownload(true);
      setTitle("");
      setAltText("");
      setCaption("");
      if (imageInputRef.current) imageInputRef.current.value = "";
      setMessage({ saved: true });
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5 shadow-lg shadow-[#4d5f52]/8 sm:p-6">
      <h2 className="text-2xl font-extrabold text-[#243d31]">Upload chalkboard</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-bold text-[#385245]">Teaching<select name="teachingId" value={teachingId} onChange={(event) => changeTeaching(event.target.value)} className="admin-input" required>{teachings.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label className="block text-sm font-bold text-[#385245]">Placement<select value={placement} onChange={(event) => changePlacement(event.target.value)} className="admin-input"><option value="teaching">Entire teaching</option><option value="category">Category</option><option value="section">Section</option></select></label>
      </div>
      {placement !== "teaching" ? <label className="mt-4 block text-sm font-bold text-[#385245]">Category<select value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setSectionId(""); }} className="admin-input" required>{<option value="">Choose a category</option>}{categories.map((category) => <option key={category.id} value={category.id}>{category.title}</option>)}</select></label> : null}
      {placement === "section" ? <label className="mt-4 block text-sm font-bold text-[#385245]">Section<select value={sectionId} onChange={(event) => setSectionId(event.target.value)} className="admin-input" required><option value="">Choose a section</option>{sections.map((section) => <option key={section.id} value={section.id}>{section.title}</option>)}</select></label> : null}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-bold text-[#385245]">Chalkboard title<input name="title" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={160} className="admin-input" /></label>
        <label className="block text-sm font-bold text-[#385245]">Alternative text<input name="altText" value={altText} onChange={(event) => setAltText(event.target.value)} required maxLength={500} className="admin-input" /><span className="mt-1 block text-xs font-normal text-[#607066]">Describe the visible board for people who cannot see the image.</span></label>
      </div>
      <label className="mt-4 block text-sm font-bold text-[#385245]">Caption <span className="font-normal text-[#607066]">(optional)</span><textarea name="caption" value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={500} rows={2} className="admin-input resize-y py-3" /></label>
      <label className="mt-4 block text-sm font-bold text-[#385245]">Image file<input ref={imageInputRef} name="image" type="file" accept="image/jpeg,image/png,image/webp" required className="admin-input py-2" /><span className="mt-1 block text-xs font-normal text-[#607066]">Portrait 3:4 image, at least 1080 × 1440, maximum 15 MiB. The complete image is preserved.</span></label>
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="flex items-center gap-3 text-sm font-bold text-[#385245]"><input type="checkbox" checked={includeInPrint} onChange={(event) => setIncludeInPrint(event.target.checked)} />Include in Print Preview</label><label className="flex items-center gap-3 text-sm font-bold text-[#385245]"><input type="checkbox" checked={allowDownload} onChange={(event) => setAllowDownload(event.target.checked)} />Allow public download when published</label></div>
      {message.error ? <p role="alert" className="mt-4 text-sm font-bold text-[#a2472c]">{message.error}</p> : null}
      {message.saved ? <p role="status" className="mt-4 text-sm font-bold text-[#326048]">Chalkboard uploaded successfully.</p> : null}
      <button type="submit" disabled={pending || !teachingId} className="admin-primary-button mt-5"><span>{pending ? "Uploading and processing..." : "Upload chalkboard"}</span></button>
    </form>
  );
}
