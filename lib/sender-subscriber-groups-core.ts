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

export type SenderGroupReconcileInput = {
  apiKey: string;
  email: string;
  firstName: string;
  /** The groups this subscriber should be in. */
  desiredGroupIds: string[];
  /** Every group the app manages. A subscriber is only ever removed from a group in this list. */
  managedGroupIds: string[];
  timeoutMs?: number;
  fetcher?: typeof fetch;
};

export type SenderGroupReconcileResult =
  | { ok: true; subscriberId: string | null; added: string[]; removed: string[] }
  | { ok: false; error: string };

/**
 * Makes one Sender subscriber's managed groups match exactly what they chose: groups they should be
 * in are added, managed groups they should not be in are removed, and groups the app does not manage
 * are never touched. There is one Sender record per email address, however many groups it is in.
 */
export async function reconcileSenderSubscriberGroups(input: SenderGroupReconcileInput): Promise<SenderGroupReconcileResult> {
  const apiKey = input.apiKey.replace(/^﻿+|﻿+$/g, "").trim();
  const email = input.email.trim().toLowerCase();
  const firstName = input.firstName.trim();
  const desired = [...new Set(input.desiredGroupIds.filter(Boolean))];
  const managed = new Set(input.managedGroupIds.filter(Boolean));
  if (!apiKey || !email) return { ok: false, error: "Sender subscriber sync is not configured." };

  const fetcher = input.fetcher ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 12000);
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
      // Not in Sender at all: nothing to remove, and nothing to create unless there are groups to join.
      if (!desired.length) return { ok: true, subscriberId: null, added: [], removed: [] };
      const created = await request(SENDER_SUBSCRIBERS_ENDPOINT, {
        method: "POST",
        body: JSON.stringify({ email, firstname: firstName, groups: desired, trigger_automation: true }),
      });
      if (!created.ok) return { ok: false, error: safeError(created.status) };
      const payload = await created.json().catch(() => null) as { data?: { id?: unknown }; id?: unknown } | null;
      const subscriberId = typeof payload?.data?.id === "string" ? payload.data.id : typeof payload?.id === "string" ? payload.id : null;
      return { ok: true, subscriberId, added: desired, removed: [] };
    }
    if (!lookup.ok) return { ok: false, error: safeError(lookup.status) };

    const record = await lookup.json().catch(() => null) as { data?: { id?: unknown; subscriber_tags?: { id?: unknown }[] }; id?: unknown } | null;
    const data = record?.data ?? (record as { id?: unknown; subscriber_tags?: { id?: unknown }[] } | null);
    const subscriberId = typeof data?.id === "string" ? data.id : null;
    const current = new Set((data?.subscriber_tags ?? []).map((tag) => tag?.id).filter((id): id is string => typeof id === "string"));

    const toAdd = desired.filter((groupId) => !current.has(groupId));
    const toRemove = [...current].filter((groupId) => managed.has(groupId) && !desired.includes(groupId));

    for (const groupId of toAdd) {
      const added = await request(`${SENDER_SUBSCRIBERS_ENDPOINT}/groups/${encodeURIComponent(groupId)}`, {
        method: "POST",
        body: JSON.stringify({ subscribers: [email], trigger_automation: true }),
      });
      if (!added.ok) return { ok: false, error: safeError(added.status) };
    }
    for (const groupId of toRemove) {
      // Removing someone from a group is not a reason to fire a Sender automation.
      const removed = await request(`${SENDER_SUBSCRIBERS_ENDPOINT}/groups/${encodeURIComponent(groupId)}`, {
        method: "DELETE",
        body: JSON.stringify({ subscribers: [email], trigger_automation: false }),
      });
      if (!removed.ok) return { ok: false, error: safeError(removed.status) };
    }

    return { ok: true, subscriberId, added: toAdd, removed: toRemove };
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
