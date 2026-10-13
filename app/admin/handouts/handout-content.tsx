import { handoutSections, type HandoutBlock, type HandoutInline } from "@/lib/teaching-handouts";

// Renders a stored handout the way it is laid out in Word: section title, subtitle, titled paragraphs,
// bullets and a closing line. Pure markup with no hooks, and only plain React text, never raw HTML.

export function renderHandoutInlines(inlines: HandoutInline[]) {
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

function Block({ block }: { block: HandoutBlock }) {
  switch (block.type) {
    case "paragraph_title":
      return <h3 className="mt-6 text-sm font-black uppercase tracking-wider text-[#946332]">{renderHandoutInlines(block.inlines)}</h3>;
    case "paragraph":
      return <p className="mt-2 leading-7 text-[#243126]">{renderHandoutInlines(block.inlines)}</p>;
    case "tagline":
      return <p className="mt-5 text-center italic leading-7 text-[#607066]">{renderHandoutInlines(block.inlines)}</p>;
    case "list":
      return (
        <ul className="mt-2 list-disc space-y-2 pl-6 leading-7 text-[#243126] marker:text-[#946332]">
          {block.items.map((item, index) => (
            <li key={index}>{renderHandoutInlines(item.inlines)}</li>
          ))}
        </ul>
      );
    default:
      return null;
  }
}

export function HandoutContent({ blocks }: { blocks: unknown }) {
  const sections = handoutSections(blocks);
  return (
    <div className="max-w-3xl">
      {sections.map((section, index) => (
        <section key={index} className={index ? "mt-10 border-t border-[#284a3b]/10 pt-6" : ""}>
          {section.title ? <h2 className="text-2xl font-extrabold tracking-tight text-[#243d31]">{renderHandoutInlines(section.title)}</h2> : null}
          {section.subtitle ? <p className="mt-1 font-bold text-[#607066]">{renderHandoutInlines(section.subtitle)}</p> : null}
          {section.body.map((block, blockIndex) => (
            <Block key={blockIndex} block={block} />
          ))}
        </section>
      ))}
    </div>
  );
}
