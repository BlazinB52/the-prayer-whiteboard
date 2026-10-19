"use client";

import Link from "next/link";
import { useState } from "react";

type Scripture = { english: string; reference: string; quotation: string; verified: boolean };
type Result =
  | { tone: "success"; title: string; editUrl: string; warnings: string[]; scriptures: Scripture[] }
  | { tone: "error"; message: string };

// Admin control for "Translate to Español" on an English devotional. The admin side stays in English; only the new draft is Spanish.
export function TranslateDevotionalButton({ devotionalId }: { devotionalId: string }) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function translate() {
    setPending(true);
    setResult(null);
    try {
      const response = await fetch("/api/admin/devotional/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ devotional_id: devotionalId }),
      });
      const payload = await response.json().catch(() => null);
      if (response.ok && payload?.editUrl) {
        setResult({ tone: "success", title: String(payload.title ?? ""), editUrl: payload.editUrl, warnings: payload.warnings ?? [], scriptures: payload.scriptures ?? [] });
      } else {
        setResult({ tone: "error", message: payload?.error ?? "The Español devotional could not be created. Nothing was saved." });
      }
    } catch {
      setResult({ tone: "error", message: "The Español devotional could not be created. Check your connection and try again." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-[#607066]">
        Translates this devotional into Español (El Salvador, with the vos forms) following the Spanish Translation Rules, and saves it as a new Spanish draft, linked to this one. Everything is translated in full; nothing is shortened. Each anchor Scripture is replaced with the published RVR1960 text of its passage. This devotional is not changed. It usually takes one to two minutes. Afterwards, open the draft to review it, then publish it as usual.
      </p>
      <div>
        <button type="button" onClick={translate} disabled={pending} className="admin-primary-button min-h-12 disabled:cursor-not-allowed disabled:opacity-60">
          <span className="!text-white">{pending ? "Translating… please keep this page open" : "Translate to Español"}</span>
        </button>
      </div>

      {result?.tone === "error" ? <p role="alert" className="text-sm font-bold text-[#a2472c]">{result.message}</p> : null}

      {result?.tone === "success" ? (
        <div role="status" className="space-y-3 rounded-xl bg-[#e7efe9] p-4 text-sm text-[#2f4d3f]">
          <p className="font-bold">
            Español draft saved: &ldquo;{result.title}&rdquo;.{" "}
            <Link href={result.editUrl} className="font-extrabold text-[#9d5a2f] underline underline-offset-2">Open the Español draft</Link>
          </p>
          {result.scriptures.length ? (
            <div>
              <p className="font-bold">
                {result.scriptures.every((item) => item.verified)
                  ? "Every anchor Scripture is the published RVR1960 text:"
                  : "Check the Scriptures marked “not verified” against an RVR1960 Bible before publishing:"}
              </p>
              <ul className="mt-2 list-disc space-y-2 pl-5">
                {result.scriptures.map((item) => (
                  <li key={`${item.english}-${item.reference}`}>
                    <span className="font-bold">{item.reference}</span> <span className="text-[#607066]">(from {item.english})</span>
                    {item.verified ? null : <span className="font-bold text-[#a2472c]"> — not verified</span>}: &ldquo;{item.quotation}&rdquo;
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
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
