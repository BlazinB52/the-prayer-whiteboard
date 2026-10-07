"use client";

import { useState } from "react";

type Result = { tone: "success" | "error"; message: string };

// For a subscriber who joined after the broadcast went out. Sends the real email (no [TEST] label)
// to that one confirmed subscriber and records it, so they are never mailed twice.
export function SendToSubscriberForm({ weeklyUpdateId }: { weeklyUpdateId: string }) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function send(formData: FormData) {
    const email = String(formData.get("subscriberEmail") ?? "").trim();
    if (!window.confirm(`Send this update to ${email}? This is a real email, not a test.`)) return;
    setPending(true);
    setResult(null);
    try {
      const response = await fetch("/api/admin/weekly-update/send-to-subscriber", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekly_update_id: weeklyUpdateId, email }),
      });
      const payload = await response.json().catch(() => null);
      setResult(response.ok
        ? { tone: "success", message: `Sent to ${payload?.email ?? email}.` }
        : { tone: "error", message: `${payload?.error ?? "The email could not be sent."}${payload?.reason ? ` (${payload.reason})` : ""}` });
    } catch {
      setResult({ tone: "error", message: "The email could not be sent." });
    } finally {
      setPending(false);
    }
  }

  return (
    <form action={send} className="space-y-3">
      <p className="text-sm text-[#607066]">
        Sends this update, as a normal email, to one confirmed subscriber who missed it. Nobody else is contacted, and they are never sent it twice.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1 text-sm font-bold text-[#385245]">
          Subscriber email
          <input name="subscriberEmail" type="email" required maxLength={320} autoComplete="off" className="mt-1 w-full rounded-xl border border-[#284a3b]/20 bg-white px-3 py-2 text-sm" />
        </label>
        <button type="submit" disabled={pending} className="admin-secondary-button disabled:opacity-60">{pending ? "Sending…" : "Send to this subscriber"}</button>
      </div>
      {result ? <p role={result.tone === "error" ? "alert" : "status"} className={`text-sm font-bold ${result.tone === "error" ? "text-[#a2472c]" : "text-[#326048]"}`}>{result.message}</p> : null}
    </form>
  );
}
