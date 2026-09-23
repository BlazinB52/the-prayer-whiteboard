import "server-only";

import { reactivateSenderSubscriber as reactivateCore } from "@/lib/sender-reactivation-core";

export function reactivateSenderSubscriber(email: string) {
  return reactivateCore({ email, apiKey: process.env.SENDER_API_KEY ?? "" });
}
