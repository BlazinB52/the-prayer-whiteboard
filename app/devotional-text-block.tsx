import { formatInlineText } from "@/app/formatted-text";
import { splitDevotionalTextBlocks } from "@/lib/devotionals";

export function DevotionalTextBlock({
  text,
  className,
  emptyText,
}: {
  text?: string | null;
  className?: string;
  emptyText?: string;
}) {
  const blocks = splitDevotionalTextBlocks(text);
  if (!blocks.length) return emptyText ? <p className={className}>{emptyText}</p> : null;

  return (
    <div className={`space-y-4 ${className ?? ""}`}>
      {blocks.map((block, index) => {
        if (block.type === "bullet-list") {
          return (
            <ul key={`list-${index}`} className="list-disc space-y-0 pl-6 leading-7">
              {block.items.map((item, itemIndex) => <li key={`${itemIndex}-${item}`}>{formatInlineText(item)}</li>)}
            </ul>
          );
        }

        return <p key={`paragraph-${index}`}>{formatInlineText(block.text)}</p>;
      })}
    </div>
  );
}
