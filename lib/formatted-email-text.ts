import { escapeHtml } from "./subscription-email-content.ts";

// Email versions of the website's simple text formatting, so a devotional looks the same in the
// inbox as it does on the page: **bold**, *italic*, [label](https://address) links, and lines that
// start with "- " as a bulleted list. The syntax matches app/formatted-text.tsx.

const EMPHASIS_PATTERN = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
const LINK_PATTERN = /\[([^\]\n]+)\]\(([^\s)]+)\)/g;
const BULLET_PATTERN = /^-\s+(.+)$/;
const LINK_STYLE = "color:#244a3a;text-decoration:underline;";

function safeHttpUrl(value: string) {
  if (!/^https?:\/\//i.test(value)) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

function emphasisHtml(text: string) {
  return text
    .split(EMPHASIS_PATTERN)
    .map((part) => {
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return `<strong>${escapeHtml(part.slice(2, -2))}</strong>`;
      if (part.startsWith("*") && part.endsWith("*") && part.length > 2) return `<em>${escapeHtml(part.slice(1, -1))}</em>`;
      return escapeHtml(part);
    })
    .join("");
}

/** One line of formatted text as email HTML. Only http and https addresses become links. */
export function formattedInlineHtml(text: string) {
  let html = "";
  let last = 0;
  LINK_PATTERN.lastIndex = 0;
  for (let match = LINK_PATTERN.exec(text); match; match = LINK_PATTERN.exec(text)) {
    html += emphasisHtml(text.slice(last, match.index));
    const url = safeHttpUrl(match[2]);
    html += url ? `<a href="${escapeHtml(url)}" style="${LINK_STYLE}">${emphasisHtml(match[1])}</a>` : emphasisHtml(match[1]);
    last = match.index + match[0].length;
  }
  return html + emphasisHtml(text.slice(last));
}

/** One line of formatted text as plain text: markers removed, links written as "label (address)". */
export function formattedInlineText(text: string) {
  return text
    .replace(LINK_PATTERN, (_whole, label: string, url: string) => (safeHttpUrl(url) ? `${label} (${url})` : label))
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1");
}

type Block = { type: "paragraph"; text: string } | { type: "bullets"; items: string[] };

function splitBlocks(value: string): Block[] {
  const blocks: Block[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) blocks.push({ type: "bullets", items: bullets });
    bullets = [];
  };
  for (const rawLine of value.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      flush();
      continue;
    }
    const bullet = line.match(BULLET_PATTERN);
    if (bullet) {
      bullets.push(bullet[1].trim());
      continue;
    }
    flush();
    blocks.push({ type: "paragraph", text: line });
  }
  flush();
  return blocks;
}

/** A block of formatted text as email HTML: one paragraph per line, bullet lines grouped into a list. */
export function formattedBlocksHtml(value: string) {
  return splitBlocks(value)
    .map((block) => block.type === "bullets"
      ? `<ul style="margin:0 0 10px;padding-left:22px;line-height:1.7;">${block.items.map((item) => `<li style="margin:0 0 6px;">${formattedInlineHtml(item)}</li>`).join("")}</ul>`
      : `<p style="margin:0 0 10px;line-height:1.7;">${formattedInlineHtml(block.text)}</p>`)
    .join("");
}

/** A block of formatted text as plain text. */
export function formattedBlocksText(value: string) {
  return splitBlocks(value)
    .map((block) => block.type === "bullets"
      ? block.items.map((item) => `- ${formattedInlineText(item)}`).join("\n")
      : formattedInlineText(block.text))
    .join("\n\n");
}
