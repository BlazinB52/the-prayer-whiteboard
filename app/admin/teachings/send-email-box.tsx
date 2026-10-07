"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Outcome = { status?: string; sentCount?: number; recipientCount?: number; remainingCount?: number; error?: string };

function describe(outcome: Outcome) {
  switch (outcome.status) {
    case "sent":
      return `Sent to ${outcome.sentCount ?? outcome.recipientCount ?? 0} subscribers.`;
    case "incomplete":
      return `Sending is under way: ${outcome.sentCount ?? 0} sent so far. It continues on its own; reload in a minute, and use Resume sending if it says it did not finish.`;
    case "failed":
      return "The email could not be delivered to any subscriber. Check Sender, then use Resume sending.";
    case "duplicate":
    case "already_complete":
      return "This email was already sent, so nobody was emailed again.";
    case "not_publishable":
      return "This teaching is not published, so nothing was sent.";
    case "skipped_language":
      return "Español teachings are not emailed.";
    default:
      return "Done.";
  }
}

export function SendTeachingEmailButton({ teachingId, label, confirmMessage }: { teachingId: string; label: string; confirmMessage: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function send() {
    if (!window.confirm(confirmMessage)) return;
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/teaching/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teaching_id: teachingId }),
      });
      const outcome = (await response.json().catch(() => ({}))) as Outcome;
      if (!response.ok) setMessage({ text: outcome.error ?? "The email could not be sent.", error: true });
      else setMessage({ text: describe(outcome), error: outcome.status === "failed" });
      router.refresh();
    } catch {
      setMessage({ text: "The email could not be sent. Reload the page to see how far it got before trying again.", error: true });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <button type="button" onClick={send} disabled={pending} className="admin-primary-button">
        <span>{pending ? "Sending..." : label}</span>
      </button>
      {message ? <p role={message.error ? "alert" : "status"} className={`text-sm font-bold ${message.error ? "text-[#a2472c]" : "text-[#326048]"}`}>{message.text}</p> : null}
    </div>
  );
}
