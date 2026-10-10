import type { ReactNode } from "react";
import { formatInlineText } from "@/app/formatted-text";
import { groupScriptureEntries, stripWrappingQuotes } from "@/lib/anchor-scripture-format";

// The one way a Bible verse is shown on the site: the reference in bold, the verse directly under it
// in italics, and a gold line down the left edge. Use this wherever a verse appears so they all match.
//   tone "dark" is for verses on a dark background.
//   size "sm" is for tight spaces such as a card.

const TONE = {
  light: { border: "border-[#c99a52]", text: "" },
  dark: { border: "border-[#f0cb83]", text: "text-white" },
} as const;

const SIZE = {
  base: { reference: "text-base", verse: "text-lg leading-8", pad: "pl-5" },
  sm: { reference: "text-sm", verse: "text-sm leading-6", pad: "pl-3" },
} as const;

export function ScriptureBlock({
  reference,
  children,
  tone = "light",
  size = "base",
  className = "",
}: {
  reference?: ReactNode;
  children: ReactNode;
  tone?: keyof typeof TONE;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const hasReference = reference !== null && reference !== undefined && reference !== "";
  return (
    <blockquote className={`scripture-block min-w-0 border-l-4 ${SIZE[size].pad} ${TONE[tone].border} ${TONE[tone].text} ${className}`}>
      {hasReference ? <p className={`font-extrabold ${SIZE[size].reference}`}>{reference}</p> : null}
      {children ? <div className={`${hasReference ? "mt-1 " : ""}space-y-3 whitespace-pre-wrap break-words italic ${SIZE[size].verse}`}>{children}</div> : null}
    </blockquote>
  );
}

/** A list of verses stored as text lines, grouped into reference plus verse and shown in the standard style. */
export function ScriptureList({ entries, tone, size }: { entries: string[]; tone?: keyof typeof TONE; size?: keyof typeof SIZE }) {
  const grouped = groupScriptureEntries(entries);
  return (
    <div className="space-y-6">
      {grouped.map((entry, index) => (
        <ScriptureBlock key={`${index}-${entry.reference ?? ""}-${entry.quote.slice(0, 24)}`} tone={tone} size={size} reference={entry.reference ? formatInlineText(entry.reference, { links: true }) : null}>
          {entry.quote ? formatInlineText(stripWrappingQuotes(entry.quote), { links: true }) : null}
        </ScriptureBlock>
      ))}
    </div>
  );
}
