"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cleanupWhiteboardUpload, createWhiteboardReplaceTarget, finalizeWhiteboardReplace, type WhiteboardActionState } from "./actions";

type Action = (state: WhiteboardActionState, formData: FormData) => Promise<WhiteboardActionState>;

type Asset = {
  id: string;
  canonicalName: string;
  language: "en" | "es";
  whiteboardDate: string;
  assignments: string[];
  title: string;
  alt_text: string;
  caption: string | null;
  include_in_print: boolean;
  allow_download: boolean;
  hasDownloadPath: boolean;
  width: number | null;
  height: number | null;
  uploaded_at: string;
  previewUrl: string | null;
};

export function WhiteboardCard({ asset, updateAction, deleteAction }: { asset: Asset; updateAction: Action; deleteAction: Action }) {
  const router = useRouter();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const deleteRef = useRef<HTMLDetailsElement>(null);
  const [language, setLanguage] = useState(asset.language);
  const [whiteboardDate, setWhiteboardDate] = useState(asset.whiteboardDate);
  const [title, setTitle] = useState(asset.title);
  const [altText, setAltText] = useState(asset.alt_text);
  const [caption, setCaption] = useState(asset.caption ?? "");
  const [includeInPrint, setIncludeInPrint] = useState(asset.include_in_print);
  const [allowDownload, setAllowDownload] = useState(asset.allow_download);
  const [updateState, updateFormAction, updatePending] = useActionState(async (previousState: WhiteboardActionState, formData: FormData) => {
    const result = await updateAction(previousState, formData);
    if (result.saved) {
      if (detailsRef.current) detailsRef.current.open = false;
      router.refresh();
    }
    return result;
  }, {});
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replaceMessage, setReplaceMessage] = useState<WhiteboardActionState>({});
  const [replacePending, startReplace] = useTransition();

  const replacePicture = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const file = new FormData(event.currentTarget).get("image");
    if (!(file instanceof File) || !file.size) {
      setReplaceMessage({ error: "Choose a portrait JPEG, PNG, or WebP image." });
      return;
    }
    setReplaceMessage({});
    startReplace(async () => {
      const target = await createWhiteboardReplaceTarget(asset.id, file.name);
      if (target.error || !target.path || !target.token || !target.assetGroupId) {
        setReplaceMessage({ error: target.error ?? "The secure upload destination could not be created." });
        return;
      }
      const { error: uploadError } = await createClient().storage.from("chalkboards").uploadToSignedUrl(target.path, target.token, file);
      if (uploadError) {
        await cleanupWhiteboardUpload(target.assetGroupId, target.path);
        setReplaceMessage({ error: "The image could not be uploaded. Please try again." });
        return;
      }
      const result = await finalizeWhiteboardReplace(asset.id, target.assetGroupId, target.path);
      if (result.error) {
        setReplaceMessage({ error: result.error });
        return;
      }
      if (replaceInputRef.current) replaceInputRef.current.value = "";
      setReplaceMessage({ saved: true });
      router.refresh();
    });
  };
  const [deleteState, deleteFormAction, deletePending] = useActionState(async (previousState: WhiteboardActionState, formData: FormData) => {
    const result = await deleteAction(previousState, formData);
    if (result.deleted) {
      if (deleteRef.current) deleteRef.current.open = false;
      router.push("/admin/whiteboards");
    }
    return result;
  }, {});

  return (
    <article className="self-start rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-4 shadow-lg shadow-[#4d5f52]/8">
      <div className="grid items-start gap-4 sm:grid-cols-[160px_1fr]">
        <div className="flex aspect-[3/4] w-full max-w-[180px] self-start items-center justify-center overflow-hidden rounded-xl bg-[#eee7da]">
          {asset.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={asset.previewUrl} alt={asset.alt_text} className="block h-full w-full object-contain" />
          ) : (
            <p className="px-3 text-center text-xs text-[#607066]">Preview unavailable</p>
          )}
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#946332]">{asset.canonicalName}</p>
          <h2 className="mt-2 text-xl font-extrabold text-[#243d31]">{asset.title}</h2>
          <dl className="mt-4 grid gap-2 text-sm text-[#607066]">
            <div className="flex justify-between gap-3"><dt>Language</dt><dd className="font-bold text-[#385245]">{asset.language === "es" ? "Español (El Salvador)" : "English"}</dd></div>
            <div className="flex justify-between gap-3"><dt>Assignments</dt><dd className="text-right font-bold text-[#385245]">{asset.assignments.length ? asset.assignments.join(", ") : "Unassigned"}</dd></div>
            <div className="flex justify-between gap-3"><dt>Dimensions</dt><dd className="font-bold text-[#385245]">{asset.width} x {asset.height}</dd></div>
            <div className="flex justify-between gap-3"><dt>Print</dt><dd className="font-bold text-[#385245]">{asset.include_in_print ? "Included" : "Excluded"}</dd></div>
            <div className="flex justify-between gap-3"><dt>Download</dt><dd className="font-bold text-[#385245]">{asset.allow_download ? "Allowed" : "Disabled"}</dd></div>
            <div className="flex justify-between gap-3"><dt>Uploaded</dt><dd className="font-bold text-[#385245]">{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(asset.uploaded_at))}</dd></div>
          </dl>
          <div className="mt-4 space-y-2 text-sm text-[#607066]">
            <p><span className="font-bold text-[#385245]">Alternative text</span>: {asset.alt_text}</p>
            {asset.caption ? <p><span className="font-bold text-[#385245]">Caption</span>: {asset.caption}</p> : null}
          </div>
          <details ref={detailsRef} className="mt-5">
            <summary className="cursor-pointer text-sm font-extrabold text-[#9d5a2f]">Edit details</summary>
            <form action={updateFormAction} className="mt-4 space-y-4">
              <input type="hidden" name="whiteboardId" value={asset.id} />
              <label className="block text-sm font-bold text-[#385245]">Language<select name="language" value={language} onChange={(event) => setLanguage(event.target.value === "es" ? "es" : "en")} className="admin-input"><option value="en">English</option><option value="es">Español (El Salvador)</option></select></label>
              <label className="block text-sm font-bold text-[#385245]">Whiteboard date<input name="whiteboardDate" type="date" value={whiteboardDate} onChange={(event) => setWhiteboardDate(event.target.value)} required className="admin-input" /></label>
              <label className="block text-sm font-bold text-[#385245]">Whiteboard title<input name="title" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={160} className="admin-input" /></label>
              <label className="block text-sm font-bold text-[#385245]">Alternative text<input name="altText" value={altText} onChange={(event) => setAltText(event.target.value)} required maxLength={500} className="admin-input" /></label>
              <label className="block text-sm font-bold text-[#385245]">Caption <span className="font-normal text-[#607066]">(optional)</span><textarea name="caption" value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={500} rows={2} className="admin-input resize-y py-3" /></label>
              <div className="grid gap-3">
                <label className="flex items-center gap-3 text-sm font-bold text-[#385245]"><input type="checkbox" name="includeInPrint" checked={includeInPrint} onChange={(event) => setIncludeInPrint(event.target.checked)} />Include in Print Preview</label>
                <label className="flex items-center gap-3 text-sm font-bold text-[#385245]"><input type="checkbox" name="allowDownload" checked={allowDownload} onChange={(event) => setAllowDownload(event.target.checked)} disabled={!asset.hasDownloadPath} />Allow public download when published</label>
              </div>
              {updateState.error ? <p role="alert" className="text-sm font-bold text-[#a2472c]">{updateState.error}</p> : null}
              {updateState.saved ? <p role="status" className="text-sm font-bold text-[#326048]">Details saved.</p> : null}
              <button type="submit" disabled={updatePending} className="admin-primary-button"><span>{updatePending ? "Saving..." : "Save details"}</span></button>
            </form>
          </details>
          <details className="mt-5">
            <summary className="cursor-pointer text-sm font-extrabold text-[#9d5a2f]">Replace picture</summary>
            <form onSubmit={replacePicture} className="mt-4 space-y-4">
              <p className="text-sm leading-6 text-[#607066]">Swaps the image on this whiteboard. The title, date, caption, settings and teaching assignments stay as they are.</p>
              <label className="block text-sm font-bold text-[#385245]">New image file<input ref={replaceInputRef} name="image" type="file" accept="image/jpeg,image/png,image/webp" required className="admin-input py-2" /><span className="mt-1 block text-xs font-normal text-[#607066]">Portrait 3:4 image, at least 1080 x 1440, maximum 15 MiB.</span></label>
              {replaceMessage.error ? <p role="alert" className="text-sm font-bold text-[#a2472c]">{replaceMessage.error}</p> : null}
              {replaceMessage.saved ? <p role="status" className="text-sm font-bold text-[#326048]">Picture replaced.</p> : null}
              <button type="submit" disabled={replacePending} className="admin-primary-button"><span>{replacePending ? "Uploading and processing..." : "Replace picture"}</span></button>
            </form>
          </details>
          <details ref={deleteRef} className="mt-5 rounded-xl border border-[#a2472c]/20 bg-[#fff3ed] p-4">
            <summary className="cursor-pointer text-sm font-extrabold text-[#a2472c]">Permanently delete whiteboard</summary>
            <form action={deleteFormAction} className="mt-4 space-y-3">
              <p className="text-sm leading-6 text-[#754033]">This removes the library record and all stored website/download files. Any teaching association will be cleared first.</p>
              <label className="block text-sm font-bold text-[#5d2b1f]">Type DELETE to confirm<input name="confirmation" className="admin-input" /></label>
              {deleteState.error ? <p role="alert" className="text-sm font-bold text-[#a2472c]">{deleteState.error}</p> : null}
              {deleteState.deleted ? <p role="status" className="text-sm font-bold text-[#326048]">Whiteboard deleted.</p> : null}
              <button type="submit" disabled={deletePending} className="min-h-11 rounded-xl bg-[#a2472c] px-5 font-extrabold text-white transition hover:bg-[#8f3823] disabled:cursor-not-allowed disabled:opacity-60"><span className="!text-white">{deletePending ? "Deleting..." : "Delete whiteboard"}</span></button>
            </form>
          </details>
        </div>
      </div>
    </article>
  );
}
