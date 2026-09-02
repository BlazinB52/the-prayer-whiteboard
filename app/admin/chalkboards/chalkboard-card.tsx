"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ChalkboardActionState } from "./actions";

type Action = (state: ChalkboardActionState, formData: FormData) => Promise<ChalkboardActionState>;

type Asset = {
  id: string;
  title: string;
  alt_text: string;
  caption: string | null;
  include_in_print: boolean;
  allow_download: boolean;
  hasDownloadPath: boolean;
  width: number | null;
  height: number | null;
  location: string;
  uploaded_at: string;
  previewUrl: string | null;
};

export function ChalkboardCard({ asset, action }: { asset: Asset; action: Action }) {
  const router = useRouter();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [title, setTitle] = useState(asset.title);
  const [altText, setAltText] = useState(asset.alt_text);
  const [caption, setCaption] = useState(asset.caption ?? "");
  const [includeInPrint, setIncludeInPrint] = useState(asset.include_in_print);
  const [allowDownload, setAllowDownload] = useState(asset.allow_download);
  const [state, formAction, pending] = useActionState(async (previousState: ChalkboardActionState, formData: FormData) => {
    const result = await action(previousState, formData);
    if (result.saved) {
      if (detailsRef.current) detailsRef.current.open = false;
      router.refresh();
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
          ) : <p className="px-3 text-center text-xs text-[#607066]">Preview unavailable</p>}
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#946332]">{asset.location}</p>
          <h3 className="mt-2 text-xl font-extrabold text-[#243d31]">{asset.title}</h3>
          <dl className="mt-4 grid gap-2 text-sm text-[#607066]"><div className="flex justify-between gap-3"><dt>Dimensions</dt><dd className="font-bold text-[#385245]">{asset.width} × {asset.height}</dd></div><div className="flex justify-between gap-3"><dt>Print</dt><dd className="font-bold text-[#385245]">{asset.include_in_print ? "Included" : "Excluded"}</dd></div><div className="flex justify-between gap-3"><dt>Download</dt><dd className="font-bold text-[#385245]">{asset.allow_download ? "Allowed" : "Disabled"}</dd></div><div className="flex justify-between gap-3"><dt>Uploaded</dt><dd className="font-bold text-[#385245]">{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(asset.uploaded_at))}</dd></div></dl>
          <div className="mt-4 space-y-2 text-sm text-[#607066]"><p><span className="font-bold text-[#385245]">Alternative text</span>: {asset.alt_text}</p>{asset.caption ? <p><span className="font-bold text-[#385245]">Caption</span>: {asset.caption}</p> : null}</div>
          <details ref={detailsRef} className="mt-5"><summary className="cursor-pointer text-sm font-extrabold text-[#9d5a2f]">Edit details</summary><form action={formAction} className="mt-4 space-y-4"><label className="block text-sm font-bold text-[#385245]">Chalkboard title<input name="title" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={160} className="admin-input" /></label><label className="block text-sm font-bold text-[#385245]">Alternative text<input name="altText" value={altText} onChange={(event) => setAltText(event.target.value)} required maxLength={500} className="admin-input" /></label><label className="block text-sm font-bold text-[#385245]">Caption <span className="font-normal text-[#607066]">(optional)</span><textarea name="caption" value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={500} rows={2} className="admin-input resize-y py-3" /></label><div className="grid gap-3"><label className="flex items-center gap-3 text-sm font-bold text-[#385245]"><input type="checkbox" name="includeInPrint" checked={includeInPrint} onChange={(event) => setIncludeInPrint(event.target.checked)} />Include in Print Preview</label><label className="flex items-center gap-3 text-sm font-bold text-[#385245]"><input type="checkbox" name="allowDownload" checked={allowDownload} onChange={(event) => setAllowDownload(event.target.checked)} disabled={!asset.hasDownloadPath} />Allow public download when published</label></div>{state.error ? <p role="alert" className="text-sm font-bold text-[#a2472c]">{state.error}</p> : null}{state.saved ? <p role="status" className="text-sm font-bold text-[#326048]">Details saved.</p> : null}<button type="submit" disabled={pending} className="admin-primary-button"><span>{pending ? "Saving..." : "Save details"}</span></button></form></details>
        </div>
      </div>
    </article>
  );
}
