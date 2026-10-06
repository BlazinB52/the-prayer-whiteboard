import { emailCategoryLabel, type EmailCategory } from "./email-categories.ts";

type Language = "en" | "es";

const BRAND = "The Prayer Whiteboard";

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function button(label: string, href: string) {
  const safeHref = escapeHtml(href);
  return `<a href="${safeHref}" style="display:inline-block;border-radius:14px;background:#244a3a;color:#ffffff;font-weight:800;text-decoration:none;padding:14px 22px;">${escapeHtml(label)}</a>`;
}

// An empty title omits the large heading (the teaching email names its title inline instead).
// letterhead, when given, replaces the small brand line at the top of the card.
export function shell(title: string, body: string, letterhead?: string) {
  const brandLine = letterhead ?? `<p style="margin:0 0 12px;color:#946332;font-size:12px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;">${BRAND}</p>`;
  const heading = title ? `<h1 style="margin:0 0 18px;color:#243d31;font-size:28px;line-height:1.16;">${escapeHtml(title)}</h1>` : "";
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f7f2e8;color:#243126;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f2e8;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fffdf8;border:1px solid rgba(40,74,59,0.12);border-radius:18px;">
            <tr>
              <td style="padding:28px 24px;">
                ${brandLine}
                ${heading}
                ${body}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function greeting(firstName: string, language: Language = "en") {
  if (language === "es") return firstName ? `Hola ${escapeHtml(firstName)},` : "Hola,";
  return firstName ? `Hi ${escapeHtml(firstName)},` : "Hello,";
}

export function textGreeting(firstName: string, language: Language = "en") {
  if (language === "es") return firstName ? `Hola ${firstName},` : "Hola,";
  return firstName ? `Hi ${firstName},` : "Hello,";
}

function categoryList(categories: EmailCategory[], language: Language = "en") {
  return categories.map((category) => `<li>${escapeHtml(emailCategoryLabel(category, language))}</li>`).join("");
}

function categoryText(categories: EmailCategory[], language: Language = "en") {
  return categories.map((category) => `- ${emailCategoryLabel(category, language)}`).join("\n");
}

export function buildConfirmationEmail(input: { firstName: string; categories: EmailCategory[]; confirmationUrl: string; expiresAt: string; language?: Language }) {
  if (input.language === "es") return buildConfirmationEmailEs(input);
  const expires = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "short" }).format(new Date(input.expiresAt));
  const subject = "Confirm your Prayer Whiteboard email subscription";
  const html = shell("Confirm your email subscription", `
    <p style="margin:0 0 16px;line-height:1.65;">${greeting(input.firstName)}</p>
    <p style="margin:0 0 16px;line-height:1.65;">Please confirm that you want to receive the Prayer Whiteboard email updates you selected.</p>
    <p style="margin:24px 0;">${button("Confirm My Subscription", input.confirmationUrl)}</p>
    <p style="margin:0 0 10px;line-height:1.65;">Requested email categories:</p>
    <ul style="margin:0 0 16px;padding-left:22px;line-height:1.65;">${categoryList(input.categories)}</ul>
    <p style="margin:0 0 16px;line-height:1.65;">This link expires on ${escapeHtml(expires)}. If you did not request this subscription, you can ignore this message.</p>
    <p style="margin:0;line-height:1.65;color:#607066;">If you have trouble finding future Prayer Whiteboard emails, please check Junk, Spam, or Promotions.</p>
  `);
  const text = `${textGreeting(input.firstName)}

Please confirm that you want to receive the Prayer Whiteboard email updates you selected.

Confirm My Subscription:
${input.confirmationUrl}

Requested email categories:
${categoryText(input.categories)}

This link expires on ${expires}. If you did not request this subscription, you can ignore this message.

If you have trouble finding future Prayer Whiteboard emails, please check Junk, Spam, or Promotions.`;
  return { subject, html, text };
}

export function buildPreferenceManagementEmail(input: { firstName: string; managementUrl: string; expiresAt: string; language?: Language }) {
  if (input.language === "es") return buildPreferenceManagementEmailEs(input);
  const expires = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "short" }).format(new Date(input.expiresAt));
  const subject = "Your secure Prayer Whiteboard preference link";
  const html = shell("Manage your email preferences", `
    <p style="margin:0 0 16px;line-height:1.65;">${greeting(input.firstName)}</p>
    <p style="margin:0 0 16px;line-height:1.65;">Use this secure link to manage your Prayer Whiteboard email preferences.</p>
    <p style="margin:24px 0;">${button("Manage Email Preferences", input.managementUrl)}</p>
    <p style="margin:0 0 16px;line-height:1.65;">This link is temporary, single-use, and expires on ${escapeHtml(expires)}.</p>
    <p style="margin:0;line-height:1.65;color:#607066;">If you did not request this link, you can ignore this message.</p>
  `);
  const text = `${textGreeting(input.firstName)}

Use this secure link to manage your Prayer Whiteboard email preferences.

Manage Email Preferences:
${input.managementUrl}

This link is temporary, single-use, and expires on ${expires}.

If you did not request this link, you can ignore this message.`;
  return { subject, html, text };
}

function expiryEs(expiresAt: string) {
  return new Intl.DateTimeFormat("es", { dateStyle: "long", timeStyle: "short" }).format(new Date(expiresAt));
}

function buildConfirmationEmailEs(input: { firstName: string; categories: EmailCategory[]; confirmationUrl: string; expiresAt: string }) {
  const expires = expiryEs(input.expiresAt);
  const subject = "Confirmá tu suscripción por correo de The Prayer Whiteboard";
  const html = shell("Confirmá tu suscripción por correo", `
    <p style="margin:0 0 16px;line-height:1.65;">${greeting(input.firstName, "es")}</p>
    <p style="margin:0 0 16px;line-height:1.65;">Por favor, confirmá que querés recibir las actualizaciones por correo de The Prayer Whiteboard que seleccionaste.</p>
    <p style="margin:24px 0;">${button("Confirmar mi suscripción", input.confirmationUrl)}</p>
    <p style="margin:0 0 10px;line-height:1.65;">Categorías de correo solicitadas:</p>
    <ul style="margin:0 0 16px;padding-left:22px;line-height:1.65;">${categoryList(input.categories, "es")}</ul>
    <p style="margin:0 0 16px;line-height:1.65;">Este enlace vence el ${escapeHtml(expires)}. Si no solicitaste esta suscripción, podés ignorar este mensaje.</p>
    <p style="margin:0;line-height:1.65;color:#607066;">Si no encontrás los próximos correos de The Prayer Whiteboard, revisá las carpetas de correo no deseado, spam o promociones.</p>
  `);
  const text = `${textGreeting(input.firstName, "es")}

Por favor, confirmá que querés recibir las actualizaciones por correo de The Prayer Whiteboard que seleccionaste.

Confirmar mi suscripción:
${input.confirmationUrl}

Categorías de correo solicitadas:
${categoryText(input.categories, "es")}

Este enlace vence el ${expires}. Si no solicitaste esta suscripción, podés ignorar este mensaje.

Si no encontrás los próximos correos de The Prayer Whiteboard, revisá las carpetas de correo no deseado, spam o promociones.`;
  return { subject, html, text };
}

function buildPreferenceManagementEmailEs(input: { firstName: string; managementUrl: string; expiresAt: string }) {
  const expires = expiryEs(input.expiresAt);
  const subject = "Tu enlace seguro de preferencias de The Prayer Whiteboard";
  const html = shell("Administrá tus preferencias de correo", `
    <p style="margin:0 0 16px;line-height:1.65;">${greeting(input.firstName, "es")}</p>
    <p style="margin:0 0 16px;line-height:1.65;">Usá este enlace seguro para administrar tus preferencias de correo de The Prayer Whiteboard.</p>
    <p style="margin:24px 0;">${button("Administrar mis preferencias de correo", input.managementUrl)}</p>
    <p style="margin:0 0 16px;line-height:1.65;">Este enlace es temporal, de un solo uso, y vence el ${escapeHtml(expires)}.</p>
    <p style="margin:0;line-height:1.65;color:#607066;">Si no solicitaste este enlace, podés ignorar este mensaje.</p>
  `);
  const text = `${textGreeting(input.firstName, "es")}

Usá este enlace seguro para administrar tus preferencias de correo de The Prayer Whiteboard.

Administrar mis preferencias de correo:
${input.managementUrl}

Este enlace es temporal, de un solo uso, y vence el ${expires}.

Si no solicitaste este enlace, podés ignorar este mensaje.`;
  return { subject, html, text };
}
