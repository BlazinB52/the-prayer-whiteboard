"use client";

import { useState } from "react";

type Result = { tone: "success" | "error"; message: string };

// Shown only when a teaching email did not reach everyone. It mails only subscribers who have not
// been sent this teaching, so pressing it never repeats an email someone already received.
export function FinishTeachingSendButton({ teachingId, title, sentCount }: { teachingId: string; title: string; sentCount: number }) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function finish() {
    setPending(true);
    setResult(null);
    try {
      const response = await fetch("/api/webhooks/teaching/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teaching_id: teachingId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setResult({ tone: "error", message: payload?.error ?? "Sending could not be finished." });
      } else if (payload?.status === "incomplete") {
        setResult({ tone: "success", message: `${payload.sentCount} of ${payload.recipientCount} sent. The rest continue in the background; reload in a minute to check.` });
      } else {
        setResult({ tone: "success", message: `Done. ${payload?.sentCount ?? 0} of ${payload?.recipientCount ?? 0} subscribers have this teaching.${payload?.failedCount ? ` ${payload.failedCount} could not be sent.` : ""}` });
      }
    } catch {
      setResult({ tone: "error", message: "Sending could not be finished." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div role="note" className="mt-6 rounded-xl border border-[#946332]/30 bg-[#fbf1e1] px-4 py-3 text-sm text-[#7a4a1d]">
      <p className="font-bold">The email for “{title}” has been sent to {sentCount} subscribers so far, and some have not received it yet.</p>
      <p className="mt-1">Finishing sends the teaching only to subscribers who have not received it. Nobody gets a second copy.</p>
      <button type="button" onClick={finish} disabled={pending} className="admin-secondary-button mt-3 disabled:opacity-60">
        {pending ? "Sending…" : "Finish sending to the rest"}
      </button>
      {result ? <p role={result.tone === "error" ? "alert" : "status"} className={`mt-2 font-bold ${result.tone === "error" ? "text-[#a2472c]" : "text-[#326048]"}`}>{result.message}</p> : null}
    </div>
  );
}
