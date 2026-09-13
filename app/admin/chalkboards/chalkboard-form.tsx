"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cleanupChalkboardUpload, createChalkboardUploadTarget, finalizeChalkboardUpload } from "./actions";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function ChalkboardForm() {
  const router = useRouter();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [chalkboardDate, setChalkboardDate] = useState(today());
  const [chalkboardTitle, setChalkboardTitle] = useState("");
  const [includeInPrint, setIncludeInPrint] = useState(true);
  const [allowDownload, setAllowDownload] = useState(true);
  const [altText, setAltText] = useState("");
  const [caption, setCaption] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ error?: string; saved?: boolean }>({});

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
      const target = await createChalkboardUploadTarget(chalkboardDate, chalkboardTitle, file.name);
      if (target.error || !target.path || !target.token || !target.assetGroupId) {
        setMessage({ error: target.error ?? "The secure upload destination could not be created." });
        return;
      }

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage.from("chalkboards").uploadToSignedUrl(target.path, target.token, file);
      if (uploadError) {
        await cleanupChalkboardUpload(target.assetGroupId, target.path);
        setMessage({ error: "The image could not be uploaded. Please try again." });
        return;
      }

      const result = await finalizeChalkboardUpload({
        assetGroupId: target.assetGroupId,
        incomingPath: target.path,
        chalkboardDate,
        chalkboardTitle,
        altText: String(form.get("altText") ?? ""),
        caption: String(form.get("caption") ?? ""),
        includeInPrint,
        allowDownload,
      });
      if (result.error) {
        await cleanupChalkboardUpload(target.assetGroupId, target.path);
        setMessage({ error: result.error });
        return;
      }

      setChalkboardTitle("");
      setIncludeInPrint(true);
      setAllowDownload(true);
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
      <p className="mt-2 text-sm text-[#607066]">Add a chalkboard to the independent library. It can be attached to a teaching later.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-bold text-[#385245]">Chalkboard date<input name="chalkboardDate" type="date" value={chalkboardDate} onChange={(event) => setChalkboardDate(event.target.value)} required className="admin-input" /></label>
        <label className="block text-sm font-bold text-[#385245]">Chalkboard title<input name="chalkboardTitle" value={chalkboardTitle} onChange={(event) => setChalkboardTitle(event.target.value)} required maxLength={160} className="admin-input" /><span className="mt-1 block text-xs font-normal text-[#607066]">The server stores this as YYYYMMDD_Title.</span></label>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-bold text-[#385245]">Alternative text<input name="altText" value={altText} onChange={(event) => setAltText(event.target.value)} required maxLength={500} className="admin-input" /><span className="mt-1 block text-xs font-normal text-[#607066]">Describe the visible board for people who cannot see the image.</span></label>
        <label className="block text-sm font-bold text-[#385245]">Caption <span className="font-normal text-[#607066]">(optional)</span><textarea name="caption" value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={500} rows={2} className="admin-input resize-y py-3" /></label>
      </div>
      <label className="mt-4 block text-sm font-bold text-[#385245]">Image file<input ref={imageInputRef} name="image" type="file" accept="image/jpeg,image/png,image/webp" required className="admin-input py-2" /><span className="mt-1 block text-xs font-normal text-[#607066]">Portrait 3:4 image, at least 1080 x 1440, maximum 15 MiB. The downloadable file is preserved as a 2160 x 2880 PNG.</span></label>
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="flex items-center gap-3 text-sm font-bold text-[#385245]"><input type="checkbox" checked={includeInPrint} onChange={(event) => setIncludeInPrint(event.target.checked)} />Include in Print Preview</label><label className="flex items-center gap-3 text-sm font-bold text-[#385245]"><input type="checkbox" checked={allowDownload} onChange={(event) => setAllowDownload(event.target.checked)} />Allow public download when published</label></div>
      {message.error ? <p role="alert" className="mt-4 text-sm font-bold text-[#a2472c]">{message.error}</p> : null}
      {message.saved ? <p role="status" className="mt-4 text-sm font-bold text-[#326048]">Chalkboard uploaded successfully.</p> : null}
      <button type="submit" disabled={pending} className="admin-primary-button mt-5"><span>{pending ? "Uploading and processing..." : "Upload chalkboard"}</span></button>
    </form>
  );
}
