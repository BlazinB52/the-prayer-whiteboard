"use client";

import { useState } from "react";
import { DEVOTIONAL_DAY_NUMBERS } from "@/lib/devotionals";

type Result = { tone: "success" | "error"; message: string };

export function DevotionalTestSendForm({ devotionalId }: { devotionalId: string }) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [dayNumber, setDayNumber] = useState(String(DEVOTIONAL_DAY_NUMBERS[0]));
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function sendTest(formData: FormData) {
    setPending(true);
    setResult(null);
    try {
      const response = await fetch("/api/admin/devotional/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          devotional_id: devotionalId,
          day_number: Number(formData.get("dayNumber")),
          test_email: String(formData.get("testEmail") ?? "").trim(),
          first_name: String(formData.get("firstName") ?? "").trim() || undefined,
        }),
      });
      const payload = await response.json().catch(() => null);
      setResult(response.ok
        ? { tone: "success", message: `Test email sent to ${payload?.testEmail ?? "the address"}.` }
        : { tone: "error", message: `${payload?.error ?? "Test email could not be sent."}${payload?.reason ? ` (${payload.reason})` : ""}` });
    } catch {
      setResult({ tone: "error", message: "Test email could not be sent." });
    } finally {
      setPending(false);
    }
  }

  return (
    <form action={sendTest} className="space-y-3">
      <p className="text-sm text-[#607066]">
        Sends one devotional day to one address only. Subscribers are not contacted and the daily send ledger is untouched.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="text-sm font-bold text-[#385245]">
          Day
          <select name="dayNumber" value={dayNumber} onChange={(event) => setDayNumber(event.target.value)} className="admin-input">
            {DEVOTIONAL_DAY_NUMBERS.map((day) => <option key={day} value={day}>Day {day}</option>)}
          </select>
        </label>
        <label className="flex-1 text-sm font-bold text-[#385245]">
          Send test to
          <input
            name="testEmail"
            type="email"
            required
            maxLength={320}
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="admin-input"
          />
        </label>
        <label className="flex-1 text-sm font-bold text-[#385245]">
          Greeting name <span className="font-normal text-[#607066]">(optional)</span>
          <input
            name="firstName"
            maxLength={120}
            placeholder="Friend"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            className="admin-input"
          />
        </label>
        <button type="submit" disabled={pending || !email.trim()} className="admin-primary-button min-h-12 disabled:cursor-not-allowed disabled:opacity-60">
          <span className="!text-white">{pending ? "Sending..." : "Send test"}</span>
        </button>
      </div>
      {result ? (
        <p
          role="alert"
          className={result.tone === "success" ? "text-sm font-bold text-[#2f6b4f]" : "text-sm font-bold text-[#a2472c]"}
        >
          {result.message}
        </p>
      ) : null}
    </form>
  );
}
