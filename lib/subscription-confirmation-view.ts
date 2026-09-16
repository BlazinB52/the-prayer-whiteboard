import { EMAIL_CATEGORY_LABELS, type EmailCategory } from "./email-categories.ts";

export type ConfirmationStatus = "confirmed" | "already_confirmed" | "expired" | "invalid" | "not_found" | "used" | "valid";

export function confirmationCopy(status: ConfirmationStatus) {
  if (status === "confirmed" || status === "already_confirmed") {
    return {
      title: "Subscription confirmed!",
      body: "Your email preferences are active. You are subscribed to:",
      href: "/email-preferences",
      link: "Manage preferences",
      confirmed: true,
    };
  }
  if (status === "expired") return { title: "This confirmation link expired.", body: "For security, confirmation links expire after 72 hours. Please subscribe again to receive a new confirmation email.", href: "/subscribe", link: "Request a new link", confirmed: false };
  return { title: "This confirmation link is invalid.", body: "Please request a fresh subscription link if you still want to receive Prayer Whiteboard emails.", href: "/subscribe", link: "Subscribe", confirmed: false };
}

export function categoryLabels(categories: EmailCategory[]) {
  return categories.map((category) => EMAIL_CATEGORY_LABELS[category]);
}
