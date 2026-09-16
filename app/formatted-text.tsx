import type { ReactNode } from "react";

const EMPHASIS_PATTERN = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;

export function formatInlineText(text: unknown): ReactNode[] {
  const source = String(text ?? "");
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
