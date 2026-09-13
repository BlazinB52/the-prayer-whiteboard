import type { ReactNode } from "react";
import type { WeeklyUpdateBlock, WeeklyUpdateInline } from "@/lib/weekly-update-docx";

function inlineParts(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      parts.push(<strong key={`${match.index}-${token}`}>{token.slice(2, -2)}</strong>);
    } else {
      parts.push(<em key={`${match.index}-${token}`}>{token.slice(1, -1)}</em>);
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function renderChildren(children: WeeklyUpdateInline[]) {
  return children.map((child, index) => {
    let node: ReactNode = child.text;
    if (child.bold) node = <strong>{node}</strong>;
    if (child.italic) node = <em>{node}</em>;
    return <span key={`${index}-${child.text.slice(0, 16)}`}>{node}</span>;
  });
}

function isWeeklyUpdateBlock(value: unknown): value is WeeklyUpdateBlock {
  return Boolean(value && typeof value === "object" && "type" in value);
}

function controlledBlocks(blocks: unknown) {
  return Array.isArray(blocks) && blocks.every(isWeeklyUpdateBlock) ? blocks : [];
}

export function WeeklyUpdateContent({ body, blocks }: { body?: string; blocks?: unknown }) {
  const convertedBlocks = controlledBlocks(blocks);
  if (convertedBlocks.length) {
    return (
      <div className="weekly-update-content space-y-6 text-[#52645a]">
        {convertedBlocks.map((block, index) => {
          if (block.type === "divider") return <hr key={index} className="border-[#284a3b]/15" />;
          if (block.type === "heading") {
            return block.level === 2
              ? <h2 key={index} className="pt-4 text-3xl font-extrabold text-[#243d31]">{renderChildren(block.children)}</h2>
              : <h3 key={index} className="pt-2 text-2xl font-extrabold text-[#243d31]">{renderChildren(block.children)}</h3>;
          }
          if (block.type === "list") {
            return (
              <ul key={index} className="list-disc space-y-2 pl-6 leading-7">
                {block.items.map((item, itemIndex) => <li key={itemIndex}>{renderChildren(item)}</li>)}
              </ul>
            );
          }
          if (block.type === "quote") return <blockquote key={index} className="border-l-4 border-[#c99450] pl-5 text-lg font-bold italic leading-8 text-[#385245]">{renderChildren(block.children)}</blockquote>;
          return <p key={index} className="whitespace-pre-wrap leading-8">{renderChildren(block.children)}</p>;
        })}
      </div>
    );
  }

  const textBody = body ?? "";
  const textBlocks = textBody.replace(/\r\n?/g, "\n").split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);

  return (
    <div className="weekly-update-content space-y-6 text-[#52645a]">
      {textBlocks.map((block, index) => {
        if (/^---+$/.test(block)) return <hr key={index} className="border-[#284a3b]/15" />;
        if (block.startsWith("### ")) return <h3 key={index} className="pt-2 text-2xl font-extrabold text-[#243d31]">{inlineParts(block.slice(4))}</h3>;
        if (block.startsWith("## ")) return <h2 key={index} className="pt-4 text-3xl font-extrabold text-[#243d31]">{inlineParts(block.slice(3))}</h2>;
        if (block.startsWith("# ")) return <h2 key={index} className="pt-4 text-3xl font-extrabold text-[#243d31]">{inlineParts(block.slice(2))}</h2>;
        if (block.split("\n").every((line) => /^[-*]\s+/.test(line.trim()))) {
          return (
            <ul key={index} className="list-disc space-y-2 pl-6 leading-7">
              {block.split("\n").map((line) => <li key={line}>{inlineParts(line.trim().replace(/^[-*]\s+/, ""))}</li>)}
            </ul>
          );
        }
        if (block.split("\n").every((line) => line.trim().startsWith(">"))) {
          return <blockquote key={index} className="border-l-4 border-[#c99450] pl-5 text-lg font-bold italic leading-8 text-[#385245]">{block.split("\n").map((line) => line.trim().replace(/^>\s?/, "")).join(" ")}</blockquote>;
        }
        return <p key={index} className="whitespace-pre-wrap leading-8">{inlineParts(block)}</p>;
      })}
    </div>
  );
}
