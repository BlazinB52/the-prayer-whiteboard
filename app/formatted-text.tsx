import type { ReactNode } from "react";

const EMPHASIS_PATTERN = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
const LINK_PATTERN = /\[([^\]\n]+)\]\(([^\s)]+)\)/g;

type FormatInlineTextOptions = {
  links?: boolean;
};

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
    if (match.index > lastIndex) parts.push(...formatEmphasis(source.slice(lastIndex, match.index)));

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
