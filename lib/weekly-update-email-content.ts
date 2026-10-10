import { button, escapeHtml, shell } from "./subscription-email-content.ts";
import type { EmailCopyrightDisclaimer } from "./copyright-disclaimer-format.ts";
import type { WeeklyUpdateBlock, WeeklyUpdateInline } from "./weekly-update-docx.ts";

// Mirrors app/weekly-update/weekly-update-content.tsx so the email matches the
// published page. Blocks come from converted_content; body_markdown is the
// fallback for updates converted before structured blocks existed.

const STORED_LINK = /\[([^\]\n]+)\]\(([^\s)]+)\)/g;

function safeHttpUrl(value: string) {
  if (!/^https?:\/\//i.test(value)) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

// Escapes the text, and turns the stored [label](address) form into a real link. Only http and https
// addresses become links; anything else is shown as its label.
export function linkedHtml(text: string) {
  let html = "";
  let last = 0;
  STORED_LINK.lastIndex = 0;
  for (let match = STORED_LINK.exec(text); match; match = STORED_LINK.exec(text)) {
    html += escapeHtml(text.slice(last, match.index));
    const url = safeHttpUrl(match[2]);
    html += url
      ? `<a href="${escapeHtml(url)}" style="color:#244a3a;text-decoration:underline;">${escapeHtml(match[1])}</a>`
      : escapeHtml(match[1]);
    last = match.index + match[0].length;
  }
  return html + escapeHtml(text.slice(last));
}

function plainLinkText(text: string) {
  return text.replace(STORED_LINK, (_match, label: string, url: string) => (label === url ? url : `${label} (${url})`));
}

function inlineHtml(children: WeeklyUpdateInline[]) {
  return children
    .map((child) => {
      let html = linkedHtml(child.text);
      if (child.bold) html = `<strong>${html}</strong>`;
      if (child.italic) html = `<em>${html}</em>`;
      return html;
    })
    .join("");
}

function inlineText(children: WeeklyUpdateInline[]) {
  return plainLinkText(children.map((child) => child.text).join(""));
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
    return `<h${block.level} style="margin:20px 0 6px;color:#243d31;font-size:${size}px;font-weight:bold;line-height:1.25;">${inlineHtml(block.children)}</h${block.level}>`;
  }
  if (block.type === "list") {
    const items = block.items.map((item) => `<li style="margin:0 0 8px;">${inlineHtml(item)}</li>`).join("");
    return `<ul style="margin:0 0 10px;padding-left:22px;line-height:1.65;">${items}</ul>`;
  }
  if (block.type === "quote") {
    return `<blockquote style="margin:0 0 10px;padding:4px 0 4px 18px;border-left:4px solid #c99450;color:#385245;font-weight:bold;line-height:1.7;">${inlineHtml(block.children)}</blockquote>`;
  }
  return `<p style="margin:0 0 10px;line-height:1.7;">${inlineHtml(block.children)}</p>`;
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

// Wording for each language. Español uses the Salvadoran voseo, like the other Español emails.
const COPY = {
  en: {
    button: "Read It Online",
    textLink: "Read it online:",
    reason: "You are receiving this because you subscribed to Prayer Whiteboard Weekly Updates.",
    manage: "Manage your email preferences or unsubscribe",
  },
  es: {
    button: "Leer en línea",
    textLink: "Leé en línea:",
    reason: "Recibís este mensaje porque te suscribiste a las Actualizaciones semanales de Prayer Whiteboard.",
    manage: "Administrá tus preferencias de correo o cancelá tu suscripción",
  },
} as const;

export function buildWeeklyUpdateEmail(input: {
  title: string;
  bodyMarkdown: string;
  convertedContent: unknown;
  weeklyUpdateUrl: string;
  preferencesUrl: string;
  copyrightDisclaimer?: EmailCopyrightDisclaimer;
  language?: "en" | "es";
}) {
  const copy = COPY[input.language ?? "en"];
  const blocks = readBlocks(input.convertedContent);
  const bodyHtml = blocks.length
    ? blocks.map(blockHtml).join("")
    : paragraphsFromMarkdown(input.bodyMarkdown).map((paragraph) => `<p style="margin:0 0 16px;line-height:1.7;">${escapeHtml(paragraph)}</p>`).join("");
  const bodyText = blocks.length
    ? blocks.map(blockText).join("\n\n")
    : paragraphsFromMarkdown(input.bodyMarkdown).join("\n\n");

  const subject = input.title;
  const html = shell(input.title, `
    ${bodyHtml}
    <p style="margin:28px 0 0;">${button(copy.button, input.weeklyUpdateUrl)}</p>
    <hr style="border:0;border-top:1px solid rgba(40,74,59,0.15);margin:28px 0 16px;" />
    <p style="margin:0;line-height:1.65;color:#607066;font-size:13px;">${copy.reason} <a href="${escapeHtml(input.preferencesUrl)}" style="color:#244a3a;">${copy.manage}</a>.</p>
    ${input.copyrightDisclaimer?.html ?? ""}
  `);
  const text = [
    `${bodyText}

${copy.textLink}
${input.weeklyUpdateUrl}

---
${copy.reason}
${copy.manage}: ${input.preferencesUrl}`,
    input.copyrightDisclaimer?.text ? `\n${input.copyrightDisclaimer.text}` : "",
  ].filter((line) => line !== "").join("\n");

  return { subject, html, text };
}
