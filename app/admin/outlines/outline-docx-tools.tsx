"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Check = {
  ok: boolean;
  error?: string;
  problems?: string[];
  changeCount?: number;
  changes?: { where: string; before: string; after: string }[];
  moreChanges?: number;
  titleChanged?: boolean;
  subtitleChanged?: boolean;
  applied?: boolean;
};

async function send(outlineId: string, file: File, mode: "check" | "apply"): Promise<Check> {
  const body = new FormData();
  body.set("id", outlineId);
  body.set("mode", mode);
  body.set("file", file);
  try {
    const response = await fetch("/api/admin/outline/import", { method: "POST", body });
    return (await response.json()) as Check;
  } catch {
    return { ok: false, error: "The file could not be sent. Check your connection and try again." };
  }
}

// Export the outline to a styled Word file, and (for a draft) import the edited file back. The import asks the server to check
// the file first and shows what would change, then asks for a go-ahead before replacing anything.
export function OutlineDocxTools({ outlineId, isDraft }: { outlineId: string; isDraft: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: "ok" | "bad"; text: string; problems?: string[] } | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setResult(null);
    const check = await send(outlineId, file, "check");
    if (!check.ok) {
      setResult({ tone: "bad", text: check.error ?? "The file could not be imported.", problems: check.problems });
    } else if (!check.changeCount) {
      setResult({ tone: "ok", text: "The structure matches, but the file has no changes from the outline, so nothing was replaced." });
    } else {
      const lines = (check.changes ?? []).map((change) => `- ${change.where}: "${change.after}"`).join("\n");
      const more = check.moreChanges ? `\n...and ${check.moreChanges} more` : "";
      const title = check.titleChanged ? "\n- The title changed" : "";
      const subtitle = check.subtitleChanged ? "\n- The subtitle changed" : "";
      const message = `The structure matches. ${check.changeCount} change${check.changeCount === 1 ? "" : "s"} will replace the outline's text:\n\n${lines}${more}${title}${subtitle}\n\nReplace the outline with this file? The Word file you exported is your backup.`;
      if (window.confirm(message)) {
        const done = await send(outlineId, file, "apply");
        if (done.ok) {
          setResult({ tone: "ok", text: `Imported. ${done.changeCount} change${done.changeCount === 1 ? "" : "s"} applied.` });
          router.refresh();
        } else setResult({ tone: "bad", text: done.error ?? "The file could not be imported.", problems: done.problems });
      } else setResult({ tone: "ok", text: "Cancelled. Nothing was changed." });
    }
    setBusy(false);
    if (input.current) input.current.value = "";
  };

  return (
    <>
      <a href={`/api/admin/outline/export?id=${outlineId}`} className="text-[#946332] hover:text-[#a85e32]">Export for editing</a>
      {isDraft ? (
        <>
          <button type="button" disabled={busy} onClick={() => input.current?.click()} className="text-[#946332] hover:text-[#a85e32] disabled:opacity-50">{busy ? "Checking..." : "Import edited .docx"}</button>
          <input ref={input} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(event) => void onFile(event.target.files?.[0])} />
        </>
      ) : null}
      {result ? (
        <div role={result.tone === "bad" ? "alert" : "status"} className={`basis-full rounded-lg px-3 py-2 text-sm font-bold ${result.tone === "bad" ? "bg-[#f7e6e1] text-[#a2472c]" : "bg-[#e7efe9] text-[#326048]"}`}>
          <p>{result.text}</p>
          {result.problems?.length ? <ul className="mt-1 list-disc space-y-1 pl-5 font-normal">{result.problems.map((problem) => <li key={problem}>{problem}</li>)}</ul> : null}
        </div>
      ) : null}
    </>
  );
}
