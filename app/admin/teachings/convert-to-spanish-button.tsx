"use client";

import Link from "next/link";
import { useState } from "react";

type Scripture = { english: string; reference: string; quotation: string };
type Result =
  | { tone: "success"; title: string; editUrl: string; warnings: string[]; scriptures: Scripture[] }
  | { tone: "error"; message: string; details: string[] };

// Admin control for "Convert & Save Spanish Version". The admin side stays in English; only the new draft is Spanish.
export function ConvertToSpanishButton({ teachingId }: { teachingId: string }) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function convert() {
    setPending(true);
    setResult(null);
    try {
      const response = await fetch("/api/admin/teaching/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teaching_id: teachingId }),
      });
      const payload = await response.json().catch(() => null);
      if (response.ok && payload?.editUrl) {
        setResult({ tone: "success", title: String(payload.title ?? ""), editUrl: payload.editUrl, warnings: payload.warnings ?? [], scriptures: payload.scriptures ?? [] });
      } else {
        setResult({ tone: "error", message: payload?.error ?? "The Spanish version could not be created. Nothing was saved.", details: Array.isArray(payload?.details) ? payload.details : [] });
      }
    } catch {
      setResult({ tone: "error", message: "The Spanish version could not be created. Check your connection and try again.", details: [] });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-5 space-y-4 border-t border-[#284a3b]/10 pt-5">
      <h3 className="text-lg font-extrabold text-[#243d31]">Convert &amp; Save Spanish Version</h3>
      <p className="text-sm leading-6 text-[#607066]">
        Translates this teaching into Español (El Salvador, with the vos forms) following the Spanish Translation Rules, and saves it as a new Spanish draft, linked to this one. Everything is translated in full; nothing is shortened. Scripture quotations use the RVR1960. This teaching is not changed. It usually takes one to two minutes. Afterwards, open the draft to review it, choose its chalkboard and footer, and publish it as usual.
      </p>
      <div>
        <button type="button" onClick={convert} disabled={pending} className="admin-primary-button min-h-12 disabled:cursor-not-allowed disabled:opacity-60">
          <span className="!text-white">{pending ? "Translating… please keep this page open" : "Convert & Save Spanish Version"}</span>
        </button>
      </div>

      {result?.tone === "error" ? (
        <div role="alert" className="text-sm font-bold text-[#a2472c]">
          <p>{result.message}</p>
          {result.details.length ? <ul className="mt-2 list-disc space-y-1 pl-5 font-normal">{result.details.map((detail) => <li key={detail}>{detail}</li>)}</ul> : null}
        </div>
      ) : null}

      {result?.tone === "success" ? (
        <div role="status" className="space-y-3 rounded-xl bg-[#e7efe9] p-4 text-sm text-[#2f4d3f]">
          <p className="font-bold">
            Spanish draft saved: &ldquo;{result.title}&rdquo;.{" "}
            <Link href={result.editUrl} className="font-extrabold text-[#9d5a2f] underline underline-offset-2">Open the Spanish draft</Link>
          </p>
          {result.scriptures.length ? (
            <div>
              <p className="font-bold">Check these Scripture quotations against an RVR1960 Bible before publishing:</p>
              <ul className="mt-2 list-disc space-y-2 pl-5">
                {result.scriptures.map((item) => (
                  <li key={`${item.english}-${item.reference}`}><span className="font-bold">{item.reference}</span> <span className="text-[#607066]">(from {item.english})</span>: &ldquo;{item.quotation}&rdquo;</li>
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
