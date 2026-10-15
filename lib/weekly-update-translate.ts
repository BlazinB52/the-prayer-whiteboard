// "Translate to Español" for a weekly update: turns the English update's blocks into translatable segments, hands them to
// the same translator the teachings and handouts use (so the Spanish Translation Rules apply), and builds the Español
// blocks back in exactly the same shape. Bold and italic travel as **bold** and *italic*, so a bold lead-in comes back as
// a bold lead-in; a link written as [label](https://address) is plain text in an update and travels as it is. Nothing here
// touches the database.

import type { TranslationSegment } from "./teaching-auto-translate.ts";
import type { WeeklyUpdateBlock, WeeklyUpdateInline } from "./weekly-update-docx.ts";

export const WEEKLY_UPDATE_TITLE_LIMIT = 180;

// Each request carries a few paragraphs, not the whole letter, so a long letter is translated in parallel pieces.
const GROUP_MAX_SEGMENTS = 12;
const GROUP_MAX_CHARACTERS = 3500;

/** A run of text as wording: **bold**, *italic*, ***both***. */
export function inlinesToMarkup(inlines: WeeklyUpdateInline[]): string {
  return inlines
    .map((inline) => {
      // Spaces at the edge of a bold or italic piece go outside the marks, so the marks hug the words as the translator expects.
      const [, before, text, after] = inline.text.match(/^(\s*)([\s\S]*?)(\s*)$/) ?? ["", "", inline.text, ""];
      if (!text) return inline.text;
      if (inline.bold && inline.italic) return `${before}***${text}***${after}`;
      if (inline.bold) return `${before}**${text}**${after}`;
      if (inline.italic) return `${before}*${text}*${after}`;
      return inline.text;
    })
    .join("");
}

/** The reverse. Neighbouring pieces that look the same are joined. */
export function markupToInlines(markup: string): WeeklyUpdateInline[] {
  const pattern = /\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|\*([^*]+)\*|([^*]+|\*)/g;
  const out: WeeklyUpdateInline[] = [];
  for (const match of markup.matchAll(pattern)) {
    let inline: WeeklyUpdateInline;
    if (match[1] !== undefined) inline = { text: match[1], bold: true, italic: true };
    else if (match[2] !== undefined) inline = { text: match[2], bold: true };
    else if (match[3] !== undefined) inline = { text: match[3], italic: true };
    else inline = { text: match[4] };
    const last = out[out.length - 1];
    if (last && Boolean(last.bold) === Boolean(inline.bold) && Boolean(last.italic) === Boolean(inline.italic)) last.text += inline.text;
    else out.push(inline);
  }
  return out.filter((inline) => inline.text.length > 0);
}

export type WeeklyUpdateTranslationPlan = {
  groups: TranslationSegment[][];
  /** Builds the Español title and blocks from the translated segments. */
  apply: (translated: Map<string, string>) => { title: string; blocks: WeeklyUpdateBlock[] };
};

/**
 * One group for the title, then groups of up to a dozen segments (about 3,500 characters), starting a new group at a
 * heading when the current one is getting full. A segment id is the block's position (b3) or a list item's (b5_i2).
 */
export function planWeeklyUpdateTranslation(title: string, blocks: WeeklyUpdateBlock[]): WeeklyUpdateTranslationPlan {
  const groups: TranslationSegment[][] = [[{ id: "update.title", kind: "heading", text: title, limit: WEEKLY_UPDATE_TITLE_LIMIT }]];
  let current: TranslationSegment[] = [];
  let characters = 0;
  const push = (segment: TranslationSegment) => {
    const startsHeading = segment.kind === "heading" && current.length > 0 && (characters > GROUP_MAX_CHARACTERS / 2 || current.length >= GROUP_MAX_SEGMENTS / 2);
    if (current.length >= GROUP_MAX_SEGMENTS || characters + segment.text.length > GROUP_MAX_CHARACTERS || startsHeading) {
      current = [];
      characters = 0;
    }
    if (!current.length) groups.push(current);
    current.push(segment);
    characters += segment.text.length;
  };

  blocks.forEach((block, index) => {
    const position = index + 1;
    if (block.type === "divider") return;
    if (block.type === "list") {
      block.items.forEach((item, itemIndex) => {
        const text = inlinesToMarkup(item);
        if (text.trim()) push({ id: `b${position}_i${itemIndex + 1}`, kind: "text", text });
      });
      return;
    }
    const text = inlinesToMarkup(block.children);
    if (!text.trim()) return;
    push({ id: `b${position}`, kind: block.type === "heading" ? "heading" : "text", text });
  });

  const apply = (translated: Map<string, string>) => {
    const titleText = (translated.get("update.title") ?? title).trim();
    const out: WeeklyUpdateBlock[] = blocks.map((block, index): WeeklyUpdateBlock => {
      const position = index + 1;
      if (block.type === "divider") return block;
      if (block.type === "list") {
        return {
          type: "list",
          items: block.items.map((item, itemIndex) => {
            const value = translated.get(`b${position}_i${itemIndex + 1}`);
            return value ? markupToInlines(value) : item;
          }),
        };
      }
      const value = translated.get(`b${position}`);
      if (!value) return block;
      return { ...block, children: markupToInlines(value) } as WeeklyUpdateBlock;
    });
    return { title: titleText, blocks: out };
  };

  return { groups, apply };
}
