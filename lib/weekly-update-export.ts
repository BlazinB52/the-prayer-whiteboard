// "Export for translation" for a weekly update: writes the converted update as a Word file whose paragraph styles
// are the ones the weekly update converter reads (Heading 1 and 2, Normal, List Bullet, Quote), so the translated
// file can be uploaded as a new Español weekly update. The title is not part of the body (the upload form has its
// own Title box); it is in the document's title property, and the translator's instructions are in its comments.

import { publicationFileName } from "./file-names.ts";
import { spanishTranslationRuleLines } from "./spanish-translation-rules.ts";
import { buildDocxPackage, escapeXml, para, run } from "./docx-parts.ts";
import type { WeeklyUpdateBlock, WeeklyUpdateInline } from "./weekly-update-docx.ts";

export const WEEKLY_UPDATE_TRANSLATOR_INSTRUCTIONS = [
  "Translate this weekly update into Español (El Salvador), using the voseo (vos) forms, not neutral Spanish, and following The Prayer Whiteboard's Spanish Translation Rules below.",
  ...spanishTranslationRuleLines(),
  "Translate every paragraph and keep each paragraph's Word style (Heading 1, Heading 2, Normal, List Bullet, Quote). Keep bold, italic and links.",
  "The title of the update is in this file's Title property (File > Info). Translate it too, and type the Spanish title into the Title box when you upload the file.",
  "Accept all tracked changes and delete comments before saving. Save as .docx, and name the file yyyymmdd_es_weekly_update.",
].join("\n");

/** 20261010_es_weekly_update.docx: a date, the language, and the words weekly update. */
export function weeklyUpdateExportFileName(date: string | null, today: Date = new Date()) {
  return publicationFileName(date, "es", "weekly_update", "docx", today);
}

type Links = { id: string; url: string }[];
const LINK = /(\[[^\]\n]+\]\([^\s)]+\))/g;

/** One inline piece (text plus bold/italic) as Word runs. A link written as [label](https://address) becomes a real link. */
function runs(child: WeeklyUpdateInline, links: Links) {
  const base = { b: Boolean(child.bold), i: Boolean(child.italic) };
  return String(child.text ?? "")
    .split(LINK)
    .filter((part) => part !== "")
    .map((part) => {
      const link = part.match(/^\[([^\]\n]+)\]\(([^\s)]+)\)$/);
      if (!link || !/^https?:\/\//i.test(link[2])) return run(link ? link[1] : part, base);
      let entry = links.find((item) => item.url === link[2]);
      if (!entry) {
        entry = { id: `rId${10 + links.length}`, url: link[2] };
        links.push(entry);
      }
      return `<w:hyperlink r:id="${entry.id}"><w:r><w:rPr>${base.b ? "<w:b/>" : ""}${base.i ? "<w:i/>" : ""}<w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr><w:t xml:space="preserve">${escapeXml(link[1])}</w:t></w:r></w:hyperlink>`;
    });
}

const childRuns = (children: WeeklyUpdateInline[] | undefined, links: Links) => (Array.isArray(children) ? children : []).flatMap((child) => runs(child, links));

export function buildWeeklyUpdateTranslationDocx(title: string, blocks: WeeklyUpdateBlock[]) {
  const links: Links = [];
  const body: string[] = [];
  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (block.type === "divider") body.push(para(null, run("---")));
    else if (block.type === "list") for (const item of block.items ?? []) body.push(para("ListBullet", ...childRuns(item, links)));
    else if (block.type === "heading") body.push(para(block.level === 3 ? "Heading2" : "Heading1", ...childRuns(block.children, links)));
    else if (block.type === "quote") body.push(para("Quote", ...childRuns(block.children, links)));
    else body.push(para(null, ...childRuns(block.children, links)));
  }
  return buildDocxPackage({
    bodyXml: body.join(""),
    hyperlinks: links,
    language: "es-SV",
    core: { title: title.trim(), description: WEEKLY_UPDATE_TRANSLATOR_INSTRUCTIONS },
  });
}
