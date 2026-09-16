import type { ReactNode } from "react";
import { formatInlineText } from "@/app/formatted-text";

const URL_PATTERN = /(https?:\/\/[^\s<]+)/g;

function renderLinkedText(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = URL_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(...formatInlineText(text.slice(lastIndex, match.index)));
    const url = match[0].replace(/[.,;:!?)]$/, "");
    const trailing = match[0].slice(url.length);
    parts.push(
      <a key={`${match.index}-${url}`} href={url} className="underline underline-offset-2" rel="noreferrer" target="_blank">
        {url}
      </a>,
    );
    if (trailing) parts.push(...formatInlineText(trailing));
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) parts.push(...formatInlineText(text.slice(lastIndex)));
  return parts;
}

export function ContentFooter({ content }: { content: string | null | undefined }) {
  const paragraphs = String(content ?? "").replace(/\r\n?/g, "\n").split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  if (!paragraphs.length) return null;

  return (
    <footer className="content-footer mt-12 border-t border-[#284a3b]/15 pt-5 text-xs leading-5 text-[#607066] print:text-[9pt] print:leading-snug">
      <div className="space-y-3">
        {paragraphs.map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 24)}`} className="whitespace-pre-wrap">{renderLinkedText(paragraph)}</p>)}
      </div>
    </footer>
  );
}
