export type SenderReactivationInput = {
  apiKey: string;
  email: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
};

export type SenderReactivationResult = { ok: true } | { ok: false; error: string };

// Sender's suppression is a hard stop, not a soft flag: once a channel status
// is UNSUBSCRIBED/BOUNCED/SPAM_REPORTED, every further send to that address is
// rejected forever, with no self-service way back in. This clears it, but only
// the transactional channel — the one channel this app actually sends through.
export async function reactivateSenderSubscriber(input: SenderReactivationInput): Promise<SenderReactivationResult> {
  const apiKey = input.apiKey.replace(/^﻿+|﻿+$/g, "").trim();
  const email = input.email.trim().toLowerCase();
  if (!apiKey || !email) return { ok: false, error: "Sender reactivation is not configured." };

  const fetcher = input.fetcher ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 8000);

  try {
    const response = await fetcher(`https://api.sender.net/v2/subscribers/${encodeURIComponent(email)}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ transactional_email_status: "ACTIVE" }),
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, error: `Sender reactivation failed with status ${response.status}.` };
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error && error.name === "AbortError" ? "Sender reactivation timed out." : "Sender reactivation request failed.",
    };
  } finally {
    clearTimeout(timeout);
  }
}
