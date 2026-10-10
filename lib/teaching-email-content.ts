import { button, escapeHtml, greeting, shell, textGreeting } from "./subscription-email-content.ts";
import type { EmailCopyrightDisclaimer } from "./copyright-disclaimer-format.ts";

// summary is nullable on public.teachings, so it is omitted rather than rendered empty.
function paragraphs(value: string) {
  return value.replace(/\r\n?/g, "\n").split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
}

function sectionHtml(value: string | null | undefined, style: string) {
  if (!value?.trim()) return "";
  return paragraphs(value).map((paragraph) => `<p style="${style}">${escapeHtml(paragraph)}</p>`).join("");
}

function sectionText(value: string | null | undefined) {
  if (!value?.trim()) return "";
  return paragraphs(value).join("\n\n");
}

// Wording for each language. Español uses the Salvadoran voseo, like the Español confirmation and
// preferences emails ("Usá este enlace", "Administrá tus preferencias").
const COPY = {
  en: {
    logoAlt: "The Prayer Whiteboard — Prayer changes things. The Word changes us.",
    subject: (title: string) => `New teaching: ${title}`,
    announce: (titleHtml: string) => `A new teaching has been published on The Prayer Whiteboard — ${titleHtml}.`,
    button: "Read the Full Teaching",
    textLink: "Read the full teaching:",
    reason: "You are receiving this because you subscribed to Prayer Whiteboard New Teachings.",
    manage: "Manage your email preferences or unsubscribe",
  },
  es: {
    logoAlt: "The Prayer Whiteboard — La oración cambia las cosas. La Palabra nos cambia a nosotros.",
    subject: (title: string) => `Nueva enseñanza: ${title}`,
    announce: (titleHtml: string) => `Se publicó una nueva enseñanza en The Prayer Whiteboard: ${titleHtml}.`,
    button: "Leer la enseñanza completa",
    textLink: "Leé la enseñanza completa:",
    reason: "Recibís este mensaje porque te suscribiste a Nuevas enseñanzas de Prayer Whiteboard.",
    manage: "Administrá tus preferencias de correo o cancelá tu suscripción",
  },
} as const;

export function buildTeachingEmail(input: {
  firstName: string;
  title: string;
  summary: string | null;
  teachingUrl: string;
  logoUrl?: string;
  preferencesUrl: string;
  copyrightDisclaimer?: EmailCopyrightDisclaimer;
  language?: "en" | "es";
}) {
  const language = input.language ?? "en";
  const copy = COPY[language];
  const summaryHtml = sectionHtml(input.summary, "margin:0 0 16px;line-height:1.7;font-size:17px;color:#385245;");
  const summaryText = sectionText(input.summary);

  // Centered letterhead logo with roughly four lines of space before the greeting.
  const letterhead = input.logoUrl
    ? `<div style="text-align:center;margin:0 0 72px;"><img src="${escapeHtml(input.logoUrl)}" alt="${escapeHtml(copy.logoAlt)}" width="360" style="display:inline-block;width:100%;max-width:360px;height:auto;border:0;" /></div>`
    : undefined;

  const subject = copy.subject(input.title);
  // Español emails open with just "Hola," and never use a name; English emails greet by first name.
  const greetingName = language === "es" ? "" : input.firstName;
  const html = shell("", `
    <p style="margin:0 0 16px;line-height:1.65;">${greeting(greetingName, language)}</p>
    <p style="margin:0 0 20px;line-height:1.65;">${copy.announce(`<strong><em>${escapeHtml(input.title)}</em></strong>`)}</p>
    ${summaryHtml}
    <p style="margin:28px 0 0;">${button(copy.button, input.teachingUrl)}</p>
    <hr style="border:0;border-top:1px solid rgba(40,74,59,0.15);margin:28px 0 16px;" />
    <p style="margin:0;line-height:1.65;color:#607066;font-size:13px;">${copy.reason} <a href="${escapeHtml(input.preferencesUrl)}" style="color:#244a3a;">${copy.manage}</a>.</p>
    ${input.copyrightDisclaimer?.html ?? ""}
  `, letterhead);

  const text = [
    textGreeting(greetingName, language),
    "",
    copy.announce(input.title),
    summaryText ? `\n${summaryText}` : "",
    "",
    copy.textLink,
    input.teachingUrl,
    "",
    "---",
    copy.reason,
    `${copy.manage}: ${input.preferencesUrl}`,
    input.copyrightDisclaimer?.text ? `\n${input.copyrightDisclaimer.text}` : "",
  ].filter((line) => line !== "").join("\n");

  return { subject, html, text };
}
