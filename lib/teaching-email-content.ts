import { button, escapeHtml, greeting, shell, textGreeting } from "./subscription-email-content.ts";

// summary and introduction are both nullable on public.teachings, so each
// section is omitted rather than rendered empty.
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
  introduction: string | null;
  teachingUrl: string;
  preferencesUrl: string;
}) {
  const summaryHtml = sectionHtml(input.summary, "margin:0 0 16px;line-height:1.7;font-size:17px;color:#385245;");
  const introductionHtml = sectionHtml(input.introduction, "margin:0 0 16px;line-height:1.7;");
  const summaryText = sectionText(input.summary);
  const introductionText = sectionText(input.introduction);

  const subject = `New teaching: ${input.title}`;
  const html = shell(input.title, `
    <p style="margin:0 0 16px;line-height:1.65;">${greeting(input.firstName)}</p>
    <p style="margin:0 0 20px;line-height:1.65;">A new teaching has been published on The Prayer Whiteboard.</p>
    ${summaryHtml}
    ${introductionHtml}
    <p style="margin:28px 0 0;">${button("Read the Full Teaching", input.teachingUrl)}</p>
    <hr style="border:0;border-top:1px solid rgba(40,74,59,0.15);margin:28px 0 16px;" />
    <p style="margin:0;line-height:1.65;color:#607066;font-size:13px;">You are receiving this because you subscribed to Prayer Whiteboard New Teachings. <a href="${escapeHtml(input.preferencesUrl)}" style="color:#244a3a;">Manage your email preferences or unsubscribe</a>.</p>
  `);

  const text = [
    textGreeting(input.firstName),
    "",
    "A new teaching has been published on The Prayer Whiteboard.",
    "",
    input.title,
    summaryText ? `\n${summaryText}` : "",
    introductionText ? `\n${introductionText}` : "",
    "",
    "Read the full teaching:",
    input.teachingUrl,
    "",
    "---",
    "You are receiving this because you subscribed to Prayer Whiteboard New Teachings.",
    `Manage your email preferences or unsubscribe: ${input.preferencesUrl}`,
  ].filter((line) => line !== "").join("\n");

  return { subject, html, text };
}
