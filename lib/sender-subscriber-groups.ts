import "server-only";

import { reconcileSenderSubscriberGroups, syncSenderSubscriberGroups } from "@/lib/sender-subscriber-groups-core";

export function syncSubscriberToSenderGroups(input: { email: string; firstName: string; groupIds: string[] }) {
  return syncSenderSubscriberGroups({
    ...input,
    apiKey: process.env.SENDER_API_KEY ?? "",
  });
}

export function reconcileSubscriberSenderGroups(input: { email: string; firstName: string; desiredGroupIds: string[]; managedGroupIds: string[] }) {
  return reconcileSenderSubscriberGroups({
    ...input,
    apiKey: process.env.SENDER_API_KEY ?? "",
  });
}
