export type SubscriberStatus = "pending" | "confirmed" | "unsubscribed" | "suppressed";
export type ConfirmationEvidence = "double_opt_in_confirmed" | "legacy_devotional_imported" | "unsubscribed" | null;

export function hasConfirmedSubscriptionState(status: SubscriberStatus, latestEvidence: ConfirmationEvidence) {
  if (status === "confirmed") return true;
  if (status !== "pending") return false;
  return latestEvidence === "double_opt_in_confirmed" || latestEvidence === "legacy_devotional_imported";
}
