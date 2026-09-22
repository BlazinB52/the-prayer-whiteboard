import { button, escapeHtml, greeting, shell, textGreeting } from "./subscription-email-content.ts";
import type { WeeklyUpdateBlock, WeeklyUpdateInline } from "./weekly-update-docx.ts";

// Mirrors app/weekly-update/weekly-update-content.tsx so the email matches the
// published page. Blocks come from converted_content; body_markdown is the
// fallback for updates converted before structured blocks existed.

function inlineHtml(children: WeeklyUpdateInline[]) {
  return children
    .map((child) => {
      let html = escapeHtml(child.text);
      if (child.bold) html = `<strong>${html}</strong>`;
      if (child.italic) html = `<em>${html}</em>`;
      return html;
    })
    .join("");
}

function inlineText(children: WeeklyUpdateInline[]) {
  return children.map((child) => child.text).join("");
}

function isWeeklyUpdateBlock(value: unknown): value is WeeklyUpdateBlock {
  return Boolean(value && typeof value === "object" && "type" in value);
}

function readBlocks(blocks: unknown): WeeklyUpdateBlock[] {
  return Array.isArray(blocks) && blocks.every(isWeeklyUpdateBlock) ? blocks : [];
}

function blockHtml(block: WeeklyUpdateBlock) {
  if (block.type === "divider") return `<hr style="border:0;border-top:1px solid rgba(40,74,59,0.15);margin:24px 0;" />`;
  if (block.type === "heading") {
    const size = block.level === 2 ? 24 : 20;
    return `<h${block.level} style="margin:28px 0 12px;color:#243d31;font-size:${size}px;line-height:1.25;">${inlineHtml(block.children)}</h${block.level}>`;
  }
  if (block.type === "list") {
    const items = block.items.map((item) => `<li style="margin:0 0 8px;">${inlineHtml(item)}</li>`).join("");
    return `<ul style="margin:0 0 16px;padding-left:22px;line-height:1.65;">${items}</ul>`;
  }
  if (block.type === "quote") {
    return `<blockquote style="margin:0 0 16px;padding:4px 0 4px 18px;border-left:4px solid #c99450;color:#385245;font-weight:bold;line-height:1.7;">${inlineHtml(block.children)}</blockquote>`;
  }
  return `<p style="margin:0 0 16px;line-height:1.7;">${inlineHtml(block.children)}</p>`;
}

function blockText(block: WeeklyUpdateBlock) {
  if (block.type === "divider") return "---";
  if (block.type === "heading") return inlineText(block.children).toUpperCase();
  if (block.type === "list") return block.items.map((item) => `- ${inlineText(item)}`).join("\n");
  if (block.type === "quote") return `> ${inlineText(block.children)}`;
  return inlineText(block.children);
}

function paragraphsFromMarkdown(body: string) {
  return body.replace(/\r\n?/g, "\n").split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
}

export function buildWeeklyUpdateEmail(input: {
  firstName: string;
  title: string;
  bodyMarkdown: string;
  convertedContent: unknown;
  weeklyUpdateUrl: string;
  preferencesUrl: string;
}) {
  const blocks = readBlocks(input.convertedContent);
  const bodyHtml = blocks.length
    ? blocks.map(blockHtml).join("")
    : paragraphsFromMarkdown(input.bodyMarkdown).map((paragraph) => `<p style="margin:0 0 16px;line-height:1.7;">${escapeHtml(paragraph)}</p>`).join("");
  const bodyText = blocks.length
    ? blocks.map(blockText).join("\n\n")
    : paragraphsFromMarkdown(input.bodyMarkdown).join("\n\n");

  const subject = input.title;
  const html = shell(input.title, `
    <p style="margin:0 0 16px;line-height:1.65;">${greeting(input.firstName)}</p>
    ${bodyHtml}
    <p style="margin:28px 0 0;">${button("Read It Online", input.weeklyUpdateUrl)}</p>
    <hr style="border:0;border-top:1px solid rgba(40,74,59,0.15);margin:28px 0 16px;" />
    <p style="margin:0;line-height:1.65;color:#607066;font-size:13px;">You are receiving this because you subscribed to Prayer Whiteboard Weekly Updates. <a href="${escapeHtml(input.preferencesUrl)}" style="color:#244a3a;">Manage your email preferences or unsubscribe</a>.</p>
  `);
  const text = `${textGreeting(input.firstName)}

${bodyText}

Read it online:
${input.weeklyUpdateUrl}

---
You are receiving this because you subscribed to Prayer Whiteboard Weekly Updates.
Manage your email preferences or unsubscribe: ${input.preferencesUrl}`;

  return { subject, html, text };
}
