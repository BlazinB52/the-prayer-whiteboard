import "server-only";

import { syncSenderSubscriberGroups } from "@/lib/sender-subscriber-groups-core";

export function syncSubscriberToSenderGroups(input: { email: string; firstName: string; groupIds: string[] }) {
  return syncSenderSubscriberGroups({
    ...input,
    apiKey: process.env.SENDER_API_KEY ?? "",
  });
}
