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

export function buildTeachingEmail(input: {
  firstName: string;
  title: string;
  summary: string | null;
  teachingUrl: string;
  logoUrl?: string;
  preferencesUrl: string;
  copyrightDisclaimer?: EmailCopyrightDisclaimer;
}) {
  const summaryHtml = sectionHtml(input.summary, "margin:0 0 16px;line-height:1.7;font-size:17px;color:#385245;");
  const summaryText = sectionText(input.summary);

  // Centered letterhead logo with roughly four lines of space before the greeting.
  const letterhead = input.logoUrl
    ? `<div style="text-align:center;margin:0 0 72px;"><img src="${escapeHtml(input.logoUrl)}" alt="The Prayer Whiteboard — Prayer changes things. The Word changes us." width="360" style="display:inline-block;width:100%;max-width:360px;height:auto;border:0;" /></div>`
    : undefined;

  const subject = `New teaching: ${input.title}`;
  const html = shell("", `
    <p style="margin:0 0 16px;line-height:1.65;">${greeting(input.firstName)}</p>
    <p style="margin:0 0 20px;line-height:1.65;">A new teaching has been published on The Prayer Whiteboard — <strong><em>${escapeHtml(input.title)}</em></strong>.</p>
    ${summaryHtml}
    <p style="margin:28px 0 0;">${button("Read the Full Teaching", input.teachingUrl)}</p>
    <hr style="border:0;border-top:1px solid rgba(40,74,59,0.15);margin:28px 0 16px;" />
    <p style="margin:0;line-height:1.65;color:#607066;font-size:13px;">You are receiving this because you subscribed to Prayer Whiteboard New Teachings. <a href="${escapeHtml(input.preferencesUrl)}" style="color:#244a3a;">Manage your email preferences or unsubscribe</a>.</p>
    ${input.copyrightDisclaimer?.html ?? ""}
  `, letterhead);

  const text = [
    textGreeting(input.firstName),
    "",
    `A new teaching has been published on The Prayer Whiteboard — ${input.title}.`,
    summaryText ? `\n${summaryText}` : "",
    "",
    "Read the full teaching:",
    input.teachingUrl,
    "",
    "---",
    "You are receiving this because you subscribed to Prayer Whiteboard New Teachings.",
    `Manage your email preferences or unsubscribe: ${input.preferencesUrl}`,
    input.copyrightDisclaimer?.text ? `\n${input.copyrightDisclaimer.text}` : "",
  ].filter((line) => line !== "").join("\n");

  return { subject, html, text };
}
