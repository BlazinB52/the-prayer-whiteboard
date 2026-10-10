import type { ReactNode } from "react";

// A plain quotation set apart from the body: a gold line down the left edge, slightly indented, with the
// text upright and regular weight. It carries no reference, no Bible translation and no copyright notice
// (use ScriptureBlock for a Bible verse). Every place a Quote section is shown goes through this component.
export function QuoteBlock({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <blockquote className={`quote-block ml-4 min-w-0 border-l-4 border-[#c99a52] pl-5 text-lg leading-8 text-[#243126] ${className}`}>
      <div className="space-y-3 whitespace-pre-wrap break-words">{children}</div>
    </blockquote>
  );
}
