export type SenderGroupSyncInput = {
  apiKey: string;
  email: string;
  firstName: string;
  groupIds: string[];
  timeoutMs?: number;
  fetcher?: typeof fetch;
};

export type SenderGroupSyncResult =
  | { ok: true; subscriberId: string | null }
  | { ok: false; error: string };

const SENDER_SUBSCRIBERS_ENDPOINT = "https://api.sender.net/v2/subscribers";

function safeError(status: number) {
  return `Sender subscriber sync failed with status ${status}.`;
}

export async function syncSenderSubscriberGroups(input: SenderGroupSyncInput): Promise<SenderGroupSyncResult> {
  const apiKey = input.apiKey.replace(/^\uFEFF+|\uFEFF+$/g, "").trim();
  const email = input.email.trim().toLowerCase();
  const firstName = input.firstName.trim();
  const groupIds = [...new Set(input.groupIds.filter(Boolean))];
  if (!apiKey || !email || !groupIds.length) return { ok: false, error: "Sender subscriber sync is not configured." };

  const fetcher = input.fetcher ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 8000);
  const request = (url: string, init: RequestInit = {}) => fetcher(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init.headers,
    },
    signal: controller.signal,
  });

  try {
    const lookup = await request(`${SENDER_SUBSCRIBERS_ENDPOINT}/${encodeURIComponent(email)}`);
    if (lookup.status === 404) {
      const created = await request(SENDER_SUBSCRIBERS_ENDPOINT, {
        method: "POST",
        body: JSON.stringify({
          email,
          firstname: firstName,
          groups: groupIds,
          trigger_automation: true,
        }),
      });
      if (!created.ok) return { ok: false, error: safeError(created.status) };
      const payload = await created.json().catch(() => null) as { data?: { id?: unknown }; id?: unknown } | null;
      const subscriberId = typeof payload?.data?.id === "string"
        ? payload.data.id
        : typeof payload?.id === "string" ? payload.id : null;
      return { ok: true, subscriberId };
    }

    if (!lookup.ok) return { ok: false, error: safeError(lookup.status) };
    const lookupPayload = await lookup.json().catch(() => null) as { data?: { id?: unknown }; id?: unknown } | null;
    const subscriberId = typeof lookupPayload?.data?.id === "string"
      ? lookupPayload.data.id
      : typeof lookupPayload?.id === "string" ? lookupPayload.id : null;

    for (const groupId of groupIds) {
      const added = await request(`${SENDER_SUBSCRIBERS_ENDPOINT}/groups/${encodeURIComponent(groupId)}`, {
        method: "POST",
        body: JSON.stringify({ subscribers: [email], trigger_automation: true }),
      });
      if (!added.ok) return { ok: false, error: safeError(added.status) };
    }

    return { ok: true, subscriberId };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error && error.name === "AbortError"
        ? "Sender subscriber sync timed out."
        : "Sender subscriber sync request failed.",
    };
  } finally {
    clearTimeout(timeout);
  }
}
