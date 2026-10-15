// Reads the text out of a finished handout (a Word file laid out in text boxes) as handout blocks: section titles,
// subtitles, paragraph titles, paragraphs, bullets and closing lines, in the order of the sections. The ordinary handout
// upload cannot read text boxes; this can, so an existing finished handout can be brought into the site and translated.
import type { HandoutBlock, HandoutInline } from "../teaching-handouts.ts";
import { decodeXml, findTextBoxes, roleOf, type TextBox } from "./template.ts";
import { readZip } from "./zip.ts";

function inlinesOf(paragraph: string): HandoutInline[] {
  const inlines: HandoutInline[] = [];
  // A paragraph whose own formatting is bold (a title) is plain text here: the template makes it bold again.
  const markBold = /<w:b\/>/.test(paragraph.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? "");
  for (const run of paragraph.matchAll(/<w:r\b[\s\S]*?<\/w:r>/g)) {
    const text = decodeXml((run[0].match(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g) ?? []).map((piece) => piece.replace(/<[^>]+>/g, "")).join(""));
    if (!text) continue;
    const rPr = run[0].match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] ?? "";
    const inline: HandoutInline = { text };
    if (/<w:b\/>/.test(rPr) && !markBold) inline.bold = true;
    if (/<w:i\/>/.test(rPr)) inline.italic = true;
    const last = inlines[inlines.length - 1];
    if (last && last.bold === inline.bold && last.italic === inline.italic) last.text += text;
    else inlines.push(inline);
  }
  return inlines;
}

const plainOf = (inlines: HandoutInline[]) => {
  const text = inlines.map((inline) => inline.text).join("").replace(/\s+/g, " ").trim();
  return text ? [{ text }] : [];
};

function blocksOfBox(box: TextBox): HandoutBlock[] {
  const blocks: HandoutBlock[] = [];
  box.paragraphs.forEach((paragraph, index) => {
    const role = roleOf(paragraph, index);
    if (!role) return;
    const inlines = inlinesOf(paragraph);
    if (!inlines.length) return;
    if (role === "title") blocks.push({ type: "section_title", inlines: plainOf(inlines) });
    else if (role === "subtitle") blocks.push({ type: "subtitle", inlines: plainOf(inlines) });
    else if (role === "paragraphTitle") blocks.push({ type: "paragraph_title", inlines: plainOf(inlines) });
    else if (role === "tagline") blocks.push({ type: "tagline", inlines: plainOf(inlines) });
    else if (role === "bullet") {
      const last = blocks[blocks.length - 1];
      const item = { level: 0, ordered: false, inlines };
      if (last?.type === "list") last.items.push(item);
      else blocks.push({ type: "list", items: [item] });
    } else blocks.push({ type: "paragraph", inlines });
  });
  return blocks;
}

/** The sections of a finished handout, in section order, plus its caption and footer text. */
export function extractHandout(docx: Buffer, sectionOrder: number[]) {
  const documentXml = readZip(docx).get("word/document.xml")?.toString("utf8");
  if (!documentXml) throw new Error("This is not a Word file.");
  const boxes = findTextBoxes(documentXml);
  const sectionBoxes = boxes.filter((box) => box.kind === "section");
  const sections: HandoutBlock[][] = [];
  sectionBoxes.forEach((box, index) => {
    sections[sectionOrder[index] - 1] = blocksOfBox(box);
  });
  const textOfBox = (box: TextBox | undefined) =>
    (box?.paragraphs ?? []).map((paragraph) => inlinesOf(paragraph).map((inline) => inline.text).join("").trim()).filter(Boolean);
  return {
    blocks: sections.flat(),
    caption: textOfBox(boxes.find((box) => box.kind === "caption")).join(" "),
    footerParagraphs: textOfBox(boxes.find((box) => box.kind === "footer")),
  };
}
