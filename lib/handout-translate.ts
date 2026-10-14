// "Translate to Español" for a handout: turns the English handout's blocks into translatable segments, hands them to
// the same translator the teachings use (so the Spanish Translation Rules apply), and builds the Español blocks back
// in exactly the same shape. Bold, italic and links travel as **bold**, *italic* and [label](https://address), so a
// bold lead-in comes back as a bold lead-in. Nothing here touches the database.

import type { TranslationSegment } from "./teaching-auto-translate.ts";
import type { HandoutBlock, HandoutInline, HandoutListItem } from "./teaching-handouts.ts";

export const HANDOUT_TITLE_LIMIT = 200;

// --- inlines <-> markup --------------------------------------------------------------------------------------------

/** A run of text as wording: **bold**, *italic*, ***both***, [label](https://address). */
export function inlinesToMarkup(inlines: HandoutInline[]): string {
  return inlines
    .map((inline) => {
      const text = inline.text;
      if (inline.href) return `[${text}](${inline.href})`;
      if (inline.bold && inline.italic) return `***${text}***`;
      if (inline.bold) return `**${text}**`;
      if (inline.italic) return `*${text}*`;
      return text;
    })
    .join("");
}

/** The reverse. Only http(s) addresses become links. Neighbouring pieces that look the same are joined. */
export function markupToInlines(markup: string): HandoutInline[] {
  const pattern = /\[([^\][*]+)\]\((https?:\/\/[^\s()]+)\)|\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|\*([^*]+)\*|([^*[]+|\[|\*)/g;
  const out: HandoutInline[] = [];
  for (const match of markup.matchAll(pattern)) {
    let inline: HandoutInline;
    if (match[1] !== undefined) inline = { text: match[1], href: match[2] };
    else if (match[3] !== undefined) inline = { text: match[3], bold: true, italic: true };
    else if (match[4] !== undefined) inline = { text: match[4], bold: true };
    else if (match[5] !== undefined) inline = { text: match[5], italic: true };
    else inline = { text: match[6] };
    const last = out[out.length - 1];
    if (last && last.bold === inline.bold && last.italic === inline.italic && last.href === inline.href) last.text += inline.text;
    else out.push(inline);
  }
  return out.filter((inline) => inline.text.length > 0);
}

// --- segments ------------------------------------------------------------------------------------------------------

// A line that is only a Scripture reference, such as "2 Corinthians 3:18": the translator changes only the book name.
const REFERENCE_ONLY = /^(?:[1-3]\s)?\p{L}[\p{L}.]*(?:\s\p{L}[\p{L}.]*)?\s\d{1,3}:\d{1,3}(?:[-–]\d{1,3})?(?:\s*[;,]\s*(?:[1-3]\s)?\p{L}[\p{L}.]*\s\d{1,3}:\d{1,3}(?:[-–]\d{1,3})?)*$/u;

const plain = (inlines: HandoutInline[]) => inlines.map((inline) => inline.text).join("");
const isAllCaps = (value: string) => /\p{L}/u.test(value) && value === value.toLocaleUpperCase("en-US");

export type HandoutTranslationPlan = {
  groups: TranslationSegment[][];
  /** Builds the Español title and blocks from the translated segments. */
  apply: (translated: Map<string, string>) => { title: string; blocks: HandoutBlock[] };
};

/**
 * One group for the title, then one group per section, so each request is small and the sections are translated
 * at the same time. A segment id is the block's position (b3) or a list item's (b5_i2).
 */
export function planHandoutTranslation(title: string, blocks: HandoutBlock[]): HandoutTranslationPlan {
  const groups: TranslationSegment[][] = [[{ id: "handout.title", kind: "heading", text: title, limit: HANDOUT_TITLE_LIMIT }]];
  let current: TranslationSegment[] | null = null;
  const headings = new Set<string>();

  blocks.forEach((block, index) => {
    const position = index + 1;
    if (block.type === "section_title" || !current) {
      current = [];
      groups.push(current);
    }
    if (block.type === "list") {
      block.items.forEach((item, itemIndex) => current!.push({ id: `b${position}_i${itemIndex + 1}`, kind: "text", text: inlinesToMarkup(item.inlines) }));
      return;
    }
    const text = inlinesToMarkup(block.inlines);
    if (!text.trim()) return;
    if (block.type === "section_title" || block.type === "subtitle" || block.type === "paragraph_title") {
      current.push({ id: `b${position}`, kind: "heading", text });
      if (isAllCaps(plain(block.inlines))) headings.add(`b${position}`);
    } else if (block.type === "tagline" && REFERENCE_ONLY.test(text.trim())) {
      current.push({ id: `b${position}`, kind: "scripture_reference", text });
    } else {
      current.push({ id: `b${position}`, kind: "text", text });
    }
  });

  const apply = (translated: Map<string, string>) => {
    const titleText = (translated.get("handout.title") ?? title).trim();
    const out: HandoutBlock[] = blocks.map((block, index): HandoutBlock => {
      const position = index + 1;
      if (block.type === "list") {
        const items: HandoutListItem[] = block.items.map((item, itemIndex) => {
          const value = translated.get(`b${position}_i${itemIndex + 1}`);
          return { ...item, inlines: value ? markupToInlines(value) : item.inlines };
        });
        return { type: "list", items };
      }
      let value = translated.get(`b${position}`);
      if (!value) return block;
      // The Word template shows titles in capitals. When the English title was typed in capitals, so is the Español one.
      if (headings.has(`b${position}`)) value = value.toLocaleUpperCase("es-SV");
      if (block.type === "section_title" || block.type === "subtitle" || block.type === "paragraph_title" || block.type === "tagline") {
        const text = plain(markupToInlines(value)).trim();
        return { type: block.type, inlines: text ? [{ text }] : block.inlines };
      }
      return { type: "paragraph", inlines: markupToInlines(value) };
    });
    return { title: titleText, blocks: out };
  };

  return { groups, apply };
}
