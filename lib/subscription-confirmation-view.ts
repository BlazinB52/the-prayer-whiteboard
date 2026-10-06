import { emailCategoryLabel, type EmailCategory } from "./email-categories.ts";

export type ConfirmationStatus = "confirmed" | "already_confirmed" | "expired" | "invalid" | "not_found" | "used" | "valid";

export function confirmationCopy(status: ConfirmationStatus, language: "en" | "es" = "en") {
  if (language === "es") {
    if (status === "confirmed" || status === "already_confirmed") {
      return { title: "¡Suscripción confirmada!", body: "Tus preferencias de correo están activas. Estás suscrito a:", href: "/espanol/preferencias", link: "Administrar preferencias", confirmed: true };
    }
    if (status === "expired") return { title: "Este enlace de confirmación venció.", body: "Por seguridad, los enlaces de confirmación vencen a las 72 horas. Volvé a suscribirte para recibir un nuevo correo de confirmación.", href: "/espanol/suscribirse", link: "Solicitar un nuevo enlace", confirmed: false };
    return { title: "Este enlace de confirmación no es válido.", body: "Solicitá un nuevo enlace de suscripción si todavía querés recibir los correos de The Prayer Whiteboard.", href: "/espanol/suscribirse", link: "Suscribirse", confirmed: false };
  }
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

export function categoryLabels(categories: EmailCategory[], language: "en" | "es" = "en") {
  return categories.map((category) => emailCategoryLabel(category, language));
}
