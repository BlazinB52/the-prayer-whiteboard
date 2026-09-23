import type { ReactNode } from "react";

const EMPHASIS_PATTERN = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
const LINK_PATTERN = /\[([^\]\n]+)\]\(([^\s)]+)\)/g;
const BULLET_PATTERN = /^-\s+(.+)$/;
const BARE_URL_PATTERN = /https?:\/\/[^\s<]+/g;

type FormatInlineTextOptions = {
  links?: boolean;
};

export type FormattedTextBlock =
  | { type: "paragraph"; text: string }
  | { type: "bullet-list"; items: string[] };

export function normalizeSafeLinkUrl(url: unknown) {
  const value = String(url ?? "").trim();
  if (!/^https?:\/\//i.test(value)) return null;

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

export function createStoredLink(text: unknown, url: unknown) {
  const label = String(text ?? "").trim();
  const safeUrl = normalizeSafeLinkUrl(url);
  if (!label || !safeUrl) return null;
  return `[${label}](${safeUrl})`;
}

export function findStoredLinkAtSelection(source: string, selectionStart: number, selectionEnd: number) {
  LINK_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = LINK_PATTERN.exec(source)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (selectionStart >= start && selectionEnd <= end) {
      return {
        start,
        end,
        text: match[1],
        url: match[2],
      };
    }
  }

  return null;
}

export function replaceRangeWithStoredLink(source: string, selectionStart: number, selectionEnd: number, text: unknown, url: unknown) {
  const storedLink = createStoredLink(text, url);
  if (!storedLink) return null;
  return `${source.slice(0, selectionStart)}${storedLink}${source.slice(selectionEnd)}`;
}

export function removeStoredLink(source: string, selectionStart: number, selectionEnd: number) {
  const link = findStoredLinkAtSelection(source, selectionStart, selectionEnd);
  if (!link) return source;
  return `${source.slice(0, link.start)}${link.text}${source.slice(link.end)}`;
}

export function toggleStoredBulletLines(source: string, selectionStart: number, selectionEnd: number) {
  const lineStart = source.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
  const nextLineBreak = source.indexOf("\n", selectionEnd);
  const lineEnd = nextLineBreak === -1 ? source.length : nextLineBreak;
  const selectedBlock = source.slice(lineStart, lineEnd);
  const lines = selectedBlock.split("\n");
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
  const shouldRemoveBullets = nonEmptyLines.length > 0 && nonEmptyLines.every((line) => BULLET_PATTERN.test(line.trim()));
  const replacement = lines.map((line) => {
    if (!line.trim()) return line;
    if (shouldRemoveBullets) return line.replace(/^(\s*)-\s+/, "$1");
    if (BULLET_PATTERN.test(line.trim())) return line;
    return line.replace(/^(\s*)/, "$1- ");
  }).join("\n");

  return {
    value: `${source.slice(0, lineStart)}${replacement}${source.slice(lineEnd)}`,
    selectionStart: lineStart,
    selectionEnd: lineStart + replacement.length,
  };
}

export function splitFormattedTextBlocks(value: unknown): FormattedTextBlock[] {
  const blocks: FormattedTextBlock[] = [];
  let paragraphLines: string[] = [];
  let bulletItems: string[] = [];

  const flushParagraph = () => {
    const text = paragraphLines.join("\n").trim();
    if (text) blocks.push({ type: "paragraph", text });
    paragraphLines = [];
  };
  const flushBullets = () => {
    if (bulletItems.length) blocks.push({ type: "bullet-list", items: bulletItems });
    bulletItems = [];
  };

  for (const rawLine of String(value ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushBullets();
      continue;
    }

    const bullet = line.match(BULLET_PATTERN);
    if (bullet) {
      flushParagraph();
      bulletItems.push(bullet[1].trim());
      continue;
    }

    flushBullets();
    flushParagraph();
    paragraphLines.push(rawLine);
    flushParagraph();
  }

  flushParagraph();
  flushBullets();
  return blocks;
}

export function FormattedTextBlocks({
  text,
  links = false,
  className = "space-y-3",
  paragraphClassName = "whitespace-pre-wrap",
  listClassName = "list-disc space-y-2 pl-6",
}: {
  text: unknown;
  links?: boolean;
  className?: string;
  paragraphClassName?: string;
  listClassName?: string;
}) {
  const blocks = splitFormattedTextBlocks(text);
  if (!blocks.length) return null;

  return (
    <div className={className}>
      {blocks.map((block, index) => {
        if (block.type === "bullet-list") {
          return (
            <ul key={`list-${index}`} className={listClassName}>
              {block.items.map((item, itemIndex) => <li key={`${itemIndex}-${item}`}>{formatInlineText(item, { links })}</li>)}
            </ul>
          );
        }

        return <p key={`paragraph-${index}-${block.text.slice(0, 20)}`} className={paragraphClassName}>{formatInlineText(block.text, { links })}</p>;
      })}
    </div>
  );
}

export function formatInlineText(text: unknown, options: FormatInlineTextOptions = {}): ReactNode[] {
  const source = String(text ?? "");
  if (options.links) return formatInlineTextWithLinks(source);

  return formatEmphasis(source);
}

function formatInlineTextWithLinks(source: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  LINK_PATTERN.lastIndex = 0;
  while ((match = LINK_PATTERN.exec(source)) !== null) {
    if (match.index > lastIndex) parts.push(...formatBareLinks(source.slice(lastIndex, match.index), lastIndex));

    const label = match[1];
    const safeUrl = normalizeSafeLinkUrl(match[2]);
    if (safeUrl) {
      parts.push(
        <a key={`${match.index}-${safeUrl}`} href={safeUrl} target="_blank" rel="noopener noreferrer" className="formatted-link">
          {formatEmphasis(label)}
        </a>,
      );
    } else {
      parts.push(...formatEmphasis(label));
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < source.length) parts.push(...formatBareLinks(source.slice(lastIndex), lastIndex));
  return parts.length ? parts : [source];
}

function formatBareLinks(source: string, offset = 0): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  BARE_URL_PATTERN.lastIndex = 0;
  while ((match = BARE_URL_PATTERN.exec(source)) !== null) {
    if (match.index > lastIndex) parts.push(...formatEmphasis(source.slice(lastIndex, match.index)));
    const url = match[0].replace(/[.,;:!?)]$/, "");
    const trailing = match[0].slice(url.length);
    const safeUrl = normalizeSafeLinkUrl(url);
    if (safeUrl) {
      parts.push(
        <a key={`${offset + match.index}-${safeUrl}`} href={safeUrl} target="_blank" rel="noopener noreferrer" className="formatted-link">
          {safeUrl}
        </a>,
      );
    } else {
      parts.push(...formatEmphasis(url));
    }
    if (trailing) parts.push(...formatEmphasis(trailing));
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < source.length) parts.push(...formatEmphasis(source.slice(lastIndex)));
  return parts.length ? parts : [source];
}

function formatEmphasis(source: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  EMPHASIS_PATTERN.lastIndex = 0;
  while ((match = EMPHASIS_PATTERN.exec(source)) !== null) {
    if (match.index > lastIndex) parts.push(source.slice(lastIndex, match.index));

    const token = match[0];
    if (token.startsWith("**")) {
      parts.push(<strong key={`${match.index}-${token}`}>{token.slice(2, -2)}</strong>);
    } else {
      parts.push(<em key={`${match.index}-${token}`}>{token.slice(1, -1)}</em>);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < source.length) parts.push(source.slice(lastIndex));
  return parts.length ? parts : [source];
}
