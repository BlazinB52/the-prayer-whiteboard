import { button, escapeHtml, greeting, shell, textGreeting } from "./subscription-email-content.ts";

function firstNameOf(name: string) {
  return name.trim().split(/\s+/)[0] ?? "";
}

export function buildContentManagerInviteEmail(input: { name: string; linkUrl: string; signInUrl: string }) {
  const firstName = firstNameOf(input.name);
  const subject = "You have been given Content Management access to The Prayer Whiteboard";
  const html = shell("You have Content Management access", `
    <p style="margin:0 0 16px;line-height:1.65;">${greeting(firstName)}</p>
    <p style="margin:0 0 16px;line-height:1.65;">You have been given access to the Content Management area of The Prayer Whiteboard, where you can manage the Points of Agreement prayer guide.</p>
    <p style="margin:0 0 16px;line-height:1.65;">Use the button below to set up your password. After that, sign in with this email address and your password.</p>
    <p style="margin:24px 0;">${button("Set Up My Password", input.linkUrl)}</p>
    <p style="margin:0 0 16px;line-height:1.65;">This link can be used once and expires after a short time. If it has expired, ask the administrator to send a new one.</p>
    <p style="margin:0 0 16px;line-height:1.65;">To sign in later, go to <a href="${escapeHtml(input.signInUrl)}" style="color:#244a3a;font-weight:700;">${escapeHtml(input.signInUrl)}</a>.</p>
    <p style="margin:0;line-height:1.65;color:#607066;">If you were not expecting this, you can ignore this message.</p>
  `);
  const text = `${textGreeting(firstName)}

You have been given access to the Content Management area of The Prayer Whiteboard, where you can manage the Points of Agreement prayer guide.

Use this link to set up your password. After that, sign in with this email address and your password.

Set Up My Password:
${input.linkUrl}

This link can be used once and expires after a short time. If it has expired, ask the administrator to send a new one.

To sign in later, go to ${input.signInUrl}

If you were not expecting this, you can ignore this message.`;
  return { subject, html, text };
}

export function buildContentManagerPasswordResetEmail(input: { name: string; linkUrl: string }) {
  const firstName = firstNameOf(input.name);
  const subject = "Reset your Prayer Whiteboard password";
  const html = shell("Reset your password", `
    <p style="margin:0 0 16px;line-height:1.65;">${greeting(firstName)}</p>
    <p style="margin:0 0 16px;line-height:1.65;">The administrator sent you a link to reset your Prayer Whiteboard Content Management password.</p>
    <p style="margin:24px 0;">${button("Choose a New Password", input.linkUrl)}</p>
    <p style="margin:0 0 16px;line-height:1.65;">This link can be used once and expires after a short time.</p>
    <p style="margin:0;line-height:1.65;color:#607066;">If you did not expect this, you can ignore this message. Your current password will keep working.</p>
  `);
  const text = `${textGreeting(firstName)}

The administrator sent you a link to reset your Prayer Whiteboard Content Management password.

Choose a New Password:
${input.linkUrl}

This link can be used once and expires after a short time.

If you did not expect this, you can ignore this message. Your current password will keep working.`;
  return { subject, html, text };
}
