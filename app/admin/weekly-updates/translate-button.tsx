"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Result = { tone: "success"; title: string; id: string; warnings: string[] } | { tone: "error"; message: string; existingId?: string };

// "Translate to Español" on an English weekly update: creates an Español DRAFT linked to it. Nothing is published or emailed.
export function TranslateWeeklyUpdateButton({ weeklyUpdateId }: { weeklyUpdateId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function translate() {
    setPending(true);
    setResult(null);
    try {
      const response = await fetch("/api/admin/weekly-update/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekly_update_id: weeklyUpdateId }),
      });
      const payload = await response.json().catch(() => null);
      if (response.ok && payload?.id) {
        setResult({ tone: "success", title: String(payload.title ?? ""), id: String(payload.id), warnings: payload.warnings ?? [] });
        router.refresh();
      } else {
        setResult({ tone: "error", message: payload?.error ?? "The Español weekly update could not be created. Nothing was saved.", existingId: payload?.existingId });
      }
    } catch {
      setResult({ tone: "error", message: "The Español weekly update could not be created. Check your connection and try again." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-3 space-y-3">
      <button type="button" onClick={translate} disabled={pending} className="admin-primary-button disabled:cursor-not-allowed disabled:opacity-60">
        <span className="!text-white">{pending ? "Translating… please keep this page open" : "Translate to Español"}</span>
      </button>
      {result?.tone === "error" ? (
        <p role="alert" className="text-sm font-bold text-[#a2472c]">
          {result.message}{result.existingId ? <> <a href={`#update-${result.existingId}`} className="underline underline-offset-2">Go to it</a>.</> : null}
        </p>
      ) : null}
      {result?.tone === "success" ? (
        <div role="status" className="space-y-2 rounded-xl bg-[#e7efe9] p-4 text-sm text-[#2f4d3f]">
          <p className="font-bold">
            Español draft saved: &ldquo;{result.title}&rdquo;.{" "}
            <a href={`#update-${result.id}`} className="font-extrabold text-[#9d5a2f] underline underline-offset-2">Go to the Español weekly update</a>
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
