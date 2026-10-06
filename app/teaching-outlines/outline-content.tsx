import type { OutlineBlock, OutlineInline, OutlineListItem } from "@/lib/teaching-outlines";

// Renders a stored outline. Pure markup with no hooks, so it works in both
// server and client components (admin preview today, a public page later).
// Everything is plain React text, never raw HTML, so uploaded documents cannot
// inject markup.

// Teacher outlines tend to open lines with a short label ("Ask:", "Teacher
// note:"). Word files rarely bold those, so they are detected and emphasised
// here instead of asking authors to format anything.
const LEAD_LABEL = /^(\p{Lu}[\p{L}' ]{1,28}):(\s+)(?=\S)/u;

// English and Español (El Salvador) labels, matched on the lowercase label.
const TEACHER_NOTE = /^(teacher note|nota (para|del|de la) (el |la )?(maestr|docent|profesor|facilitad))/;
const TRANSITION = /^(transition|transici)/;
const PROMPT = /^(discuss|apply|ask|read|review|discut|convers|aplic|pregunt|le[eé]:|lectura|repas)/;

function splitLeadLabel(inlines: OutlineInline[]): { label: string | null; rest: OutlineInline[] } {
  const first = inlines[0];
  if (!first || first.bold || first.href) return { label: null, rest: inlines };
  const match = LEAD_LABEL.exec(first.text);
  if (!match || match[1].trim().split(/\s+/).length > 3) return { label: null, rest: inlines };
  const rest = [{ ...first, text: first.text.slice(match[0].length) }, ...inlines.slice(1)].filter((inline) => inline.text);
  return { label: `${match[1]}:`, rest };
}

function renderInlines(inlines: OutlineInline[]) {
  return inlines.map((inline, index) => {
    let node: React.ReactNode = inline.text;
    if (inline.italic) node = <em>{node}</em>;
    if (inline.bold) node = <strong className="font-extrabold text-[#243d31]">{node}</strong>;
    if (inline.href) {
      node = (
        <a href={inline.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#946332] underline decoration-[#946332]/40 underline-offset-2 hover:text-[#a85e32]">
          {node}
        </a>
      );
    }
    return <span key={index}>{node}</span>;
  });
}

function Paragraph({ inlines }: { inlines: OutlineInline[] }) {
  const { label, rest } = splitLeadLabel(inlines);
  const key = label?.toLowerCase() ?? "";
  const body = (
    <>
      {label ? <strong className="font-extrabold text-[#243d31]">{label} </strong> : null}
      {renderInlines(rest)}
    </>
  );

  if (TEACHER_NOTE.test(key)) {
    return <p className="mt-4 rounded-xl border border-[#c49a3a]/40 bg-[#fbf4e1] px-4 py-3 text-[15px] leading-7 text-[#5e4a14]">{body}</p>;
  }
  if (TRANSITION.test(key)) {
    return <p className="mt-4 text-[15px] italic leading-7 text-[#607066]">{body}</p>;
  }
  if (PROMPT.test(key)) {
    return <p className="mt-4 border-l-4 border-[#326048]/40 pl-4 leading-7 text-[#243126]">{body}</p>;
  }
  return <p className="mt-4 leading-7 text-[#243126]">{body}</p>;
}

function List({ items }: { items: OutlineListItem[] }) {
  // Items are grouped into runs of the same kind so bullets and numbers
  // are never mixed inside one <ul>/<ol>.
  const groups: OutlineListItem[][] = [];
  for (const item of items) {
    const group = groups[groups.length - 1];
    if (group && group[0].ordered === item.ordered) group.push(item);
    else groups.push([item]);
  }
  return (
    <>
      {groups.map((group, groupIndex) => {
        const Tag = group[0].ordered ? "ol" : "ul";
        return (
          <Tag key={groupIndex} className={`mt-3 space-y-2 leading-7 text-[#243126] ${group[0].ordered ? "list-decimal" : "list-disc"} pl-6 marker:text-[#946332]`}>
            {group.map((item, index) => (
              <li key={index} style={item.level ? { marginLeft: `${item.level * 1.25}rem` } : undefined}>
                {renderInlines(item.inlines)}
              </li>
            ))}
          </Tag>
        );
      })}
    </>
  );
}

function Block({ block }: { block: OutlineBlock }) {
  if (block.type === "heading") {
    if (block.level === 1) {
      return <h2 className="mt-10 border-t border-[#284a3b]/10 pt-6 text-2xl font-extrabold tracking-tight text-[#243d31]">{renderInlines(block.inlines)}</h2>;
    }
    if (block.level === 2) {
      return <h3 className="mt-6 text-sm font-black uppercase tracking-wider text-[#946332]">{renderInlines(block.inlines)}</h3>;
    }
    return <h4 className="mt-5 text-lg font-extrabold text-[#385245]">{renderInlines(block.inlines)}</h4>;
  }
  if (block.type === "list") return <List items={block.items} />;
  if (block.type === "table") {
    return (
      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-left text-[15px] leading-6">
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => {
                  const Cell = rowIndex === 0 ? "th" : "td";
                  return (
                    <Cell key={cellIndex} className={`border border-[#284a3b]/15 px-3 py-2 align-top text-[#243126] ${rowIndex === 0 ? "bg-[#e7efe9] font-extrabold" : ""}`}>
                      {renderInlines(cell)}
                    </Cell>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return <Paragraph inlines={block.inlines} />;
}

export function OutlineContent({ blocks }: { blocks: OutlineBlock[] }) {
  return (
    <div className="max-w-3xl">
      {blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
  );
}
