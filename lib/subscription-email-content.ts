import { EMAIL_CATEGORY_LABELS, type EmailCategory } from "./email-categories.ts";

const BRAND = "The Prayer Whiteboard";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function button(label: string, href: string) {
  const safeHref = escapeHtml(href);
  return `<a href="${safeHref}" style="display:inline-block;border-radius:14px;background:#244a3a;color:#ffffff;font-weight:800;text-decoration:none;padding:14px 22px;">${escapeHtml(label)}</a>`;
}

function shell(title: string, body: string) {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f7f2e8;color:#243126;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f2e8;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fffdf8;border:1px solid rgba(40,74,59,0.12);border-radius:18px;">
            <tr>
              <td style="padding:28px 24px;">
                <p style="margin:0 0 12px;color:#946332;font-size:12px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;">${BRAND}</p>
                <h1 style="margin:0 0 18px;color:#243d31;font-size:28px;line-height:1.16;">${escapeHtml(title)}</h1>
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

function greeting(firstName: string) {
  return firstName ? `Hi ${escapeHtml(firstName)},` : "Hello,";
}

function textGreeting(firstName: string) {
  return firstName ? `Hi ${firstName},` : "Hello,";
}

function categoryList(categories: EmailCategory[]) {
  return categories.map((category) => `<li>${escapeHtml(EMAIL_CATEGORY_LABELS[category])}</li>`).join("");
}

function categoryText(categories: EmailCategory[]) {
  return categories.map((category) => `- ${EMAIL_CATEGORY_LABELS[category]}`).join("\n");
}

export function buildConfirmationEmail(input: { firstName: string; categories: EmailCategory[]; confirmationUrl: string; expiresAt: string }) {
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

export function buildPreferenceManagementEmail(input: { firstName: string; managementUrl: string; expiresAt: string }) {
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
