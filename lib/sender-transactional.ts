import "server-only";

import { sendSenderTransactionalEmail as sendCore, type SenderTransactionalInput } from "@/lib/sender-transactional-core";

export async function sendSenderTransactionalEmail(input: Omit<SenderTransactionalInput, "apiKey" | "fromEmail" | "fromName">) {
  return sendCore({
    ...input,
    apiKey: process.env.SENDER_API_KEY ?? "",
    fromEmail: process.env.SENDER_FROM_EMAIL ?? "",
    fromName: process.env.SENDER_FROM_NAME ?? "The Prayer Whiteboard",
  });
}
