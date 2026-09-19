"use server";

import { checkRateLimit } from "@/lib/rate-limit";
import { requestSubscription } from "@/lib/email-subscriptions";

export type SubscribeState = {
  error?: string;
  submitted?: boolean;
  alreadyConfirmed?: boolean;
};

export async function submitSubscription(_previousState: SubscribeState, formData: FormData): Promise<SubscribeState> {
  const limit = await checkRateLimit("email-subscription", 5, 15 * 60 * 1000);
  if (!limit.allowed) return { error: "Too many subscription attempts. Please wait a few minutes and try again." };

  try {
    return await requestSubscription(formData);
  } catch {
    return { error: "Subscription could not be submitted." };
  }
}
