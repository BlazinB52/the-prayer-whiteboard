import type { ReactNode } from "react";
import { CopyBlock } from "./readme-button";

// A small renderer for the handout guide only: headings, paragraphs, bullets, numbered and
// checkbox lists, tables, block quotes, fenced code, rules, and **bold** / `code` inline.

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={index} className="text-[#243d31]">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) return <code key={index} className="rounded bg-[#f4efe3] px-1 py-0.5 text-[0.85em]">{part.slice(1, -1)}</code>;
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) return <em key={index}>{part.slice(1, -1)}</em>;
    return part;
  });
}

function tableCells(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

export function GuideMarkdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^(`{3,})/);

    if (fence) {
      const closer = fence[1];
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith(closer)) body.push(lines[i++]);
      i += 1;
      out.push(<CopyBlock key={key++} text={body.join("\n")} />);
    } else if (!line.trim()) {
      i += 1;
    } else if (/^---+$/.test(line.trim())) {
      out.push(<hr key={key++} className="border-[#284a3b]/10" />);
      i += 1;
    } else if (/^#{1,4}\s/.test(line)) {
      const level = line.match(/^#+/)![0].length;
      const text = line.replace(/^#+\s*/, "");
      const cls = level === 1 ? "text-2xl font-extrabold text-[#243d31]" : level === 2 ? "pt-2 text-xl font-extrabold text-[#243d31]" : "pt-1 text-base font-extrabold text-[#946332]";
      out.push(<h2 key={key++} className={cls}>{inline(text)}</h2>);
      i += 1;
    } else if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) rows.push(tableCells(lines[i++]));
      const [head, , ...body] = rows;
      out.push(
        <div key={key++} className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead><tr>{head.map((cell, c) => <th key={c} className="border-b border-[#284a3b]/20 px-2 py-1.5 font-extrabold text-[#243d31]">{inline(cell)}</th>)}</tr></thead>
            <tbody>{body.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c} className="border-b border-[#284a3b]/10 px-2 py-1.5 align-top">{inline(cell)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
    } else if (line.startsWith(">")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) quote.push(lines[i++].replace(/^>\s?/, ""));
      out.push(<blockquote key={key++} className="border-l-4 border-[#c99a52] pl-3 italic">{inline(quote.join(" "))}</blockquote>);
    } else if (/^(- |\d+\.\s)/.test(line)) {
      const ordered = /^\d/.test(line);
      const items: ReactNode[] = [];
      while (i < lines.length && /^(- |\d+\.\s|\s+- )/.test(lines[i])) {
        const nested = /^\s+- /.test(lines[i]);
        const text = lines[i].replace(/^\s*(- |\d+\.\s)/, "");
        const box = text.match(/^\[( |x)\]\s*(.*)$/);
        const body = box ? <><span aria-hidden="true" className="mr-1.5">{box[1] === "x" ? "☑" : "☐"}</span>{inline(box[2])}</> : inline(text);
        items.push(<li key={items.length} className={`${nested ? "ml-5 " : ""}${box ? "list-none" : ""}`}>{body}</li>);
        i += 1;
      }
      const Tag = ordered ? "ol" : "ul";
      out.push(<Tag key={key++} className={`${ordered ? "list-decimal" : "list-disc"} space-y-1 pl-6`}>{items}</Tag>);
    } else {
      const para: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^(#|\||>|- |\d+\.\s|---|`{3})/.test(lines[i])) para.push(lines[i++]);
      out.push(<p key={key++}>{inline(para.join(" "))}</p>);
    }
  }

  return <>{out}</>;
}
