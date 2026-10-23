// "Export for translation": writes an existing teaching as a Word file laid out exactly the way the Teaching
// DOCX importer reads it, so the translated file can be uploaded straight back to create a new draft.
//
// What is carried: the title, Central Theme, Introduction, Short Summary, the homepage teasers, every category
// and section in order (visible section titles as Heading 2, paragraphs, bullets, Takeaway, Quote and Scripture
// Quote), with bold, italic and links. What is not: whiteboards, the footer, highlighted-section boxes, and the
// grouping of a bullets section's introduction and conclusion (they come back as their own paragraphs).
// The file also records which teaching it came from (a custom document property), so the import can offer to
// link the new draft to it, and carries the translator's instructions in the document properties, where they
// can never be imported as teaching text.

import { publicationFileName } from "./file-names.ts";
import { spanishTranslationRuleLines } from "./spanish-translation-rules.ts";
import { buildDocxPackage, escapeXml, para, run } from "./docx-parts.ts";

export type ExportTeaching = {
  id: string;
  title: string;
  central_theme: string | null;
  introduction: string | null;
  summary: string | null;
  teaser_1_heading: string | null;
  teaser_1_text: string | null;
  teaser_2_heading: string | null;
  teaser_2_text: string | null;
  teaching_type: string | null;
  language: string | null;
  gathering_date: string | null;
};
export type ExportCategory = { id: string; title: string; sort_order: number };
export type ExportSection = { id: string; category_id: string; title: string; content: unknown; sort_order: number };

export const TRANSLATOR_INSTRUCTIONS = [
  "Translate this teaching into Español (El Salvador), using the voseo (vos) forms, not neutral Spanish, and following The Prayer Whiteboard's Spanish Translation Rules below.",
  ...spanishTranslationRuleLines(),
  "Translate every paragraph and keep each paragraph's Word style (Title, Heading 1, Heading 2, Normal, Scripture Quote, List Bullet, Quote, Takeaway). Keep bold, italic and links.",
  "Leave the short Heading 1 labels in English: Central Theme, Introduction, Short Summary, and the Homepage Teaser labels. They tell the website where each part goes. Everything under them is translated.",
  "Each Scripture Quote paragraph reads: Reference (VERSION) — “verse”. Translate the book name, replace the verse with the published RVR1960 or NVI text of that passage, and put that version in parentheses.",
  "Accept all tracked changes and delete comments before saving. Save as .docx, and name the file yyyymmdd_es_teaching (for example 20261010_es_teaching).",
].join("\n");

/** 20261010_en_teaching.docx: the teaching date, the language of the teaching being exported, and the word teaching. */
export function exportFileName(gatheringDate: string | null, language: string | null = null, today: Date = new Date()) {
  return publicationFileName(gatheringDate, language?.toLowerCase().startsWith("es") ? "es" : "en", "teaching", "docx", today);
}

type Links = { id: string; url: string }[];

const INLINE = /(\[[^\]\n]+\]\([^\s)]+\)|\*\*[^*]+\*\*|\*[^*]+\*)/g;

/** The website's stored text (**bold**, *italic*, [label](https://address)) as Word runs. */
function formattedRuns(value: string, links: Links, base: { b?: boolean; i?: boolean } = {}) {
  return value
    .split(INLINE)
    .filter((part) => part !== "")
    .map((part) => {
      const link = part.match(/^\[([^\]\n]+)\]\(([^\s)]+)\)$/);
      if (link) {
        const url = link[2];
        if (!/^https?:\/\//i.test(url)) return run(link[1], base);
        let entry = links.find((item) => item.url === url);
        if (!entry) {
          entry = { id: `rId${10 + links.length}`, url };
          links.push(entry);
        }
        return `<w:hyperlink r:id="${entry.id}"><w:r><w:rPr>${base.b ? "<w:b/>" : ""}${base.i ? "<w:i/>" : ""}<w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr><w:t xml:space="preserve">${escapeXml(link[1])}</w:t></w:r></w:hyperlink>`;
      }
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return run(part.slice(2, -2), { ...base, b: true });
      if (part.startsWith("*") && part.endsWith("*") && part.length > 2) return run(part.slice(1, -1), { ...base, i: true });
      return run(part, base);
    });
}

const lines = (value: unknown) => String(value ?? "").replace(/\r\n?/g, "\n").split("\n").map((line) => line.trim()).filter(Boolean);
const text = (value: unknown) => String(value ?? "").trim();

function paragraphs(styleId: string | null, value: unknown, links: Links) {
  return lines(value).map((line) => para(styleId, ...formattedRuns(line, links)));
}

function sectionXml(section: ExportSection, links: Links) {
  const content = section.content && typeof section.content === "object" ? (section.content as Record<string, unknown>) : {};
  const out: string[] = [];
  if (content.showTitle !== false && text(section.title)) out.push(para("Heading2", run(text(section.title))));

  const format = String(content.format ?? "paragraph");
  if (format === "bullets") {
    out.push(...paragraphs(null, content.introduction, links));
    for (const bullet of Array.isArray(content.bullets) ? content.bullets : []) out.push(para("ListBullet", ...formattedRuns(String(bullet), links)));
    out.push(...paragraphs(null, content.conclusion, links));
  } else if (format === "scripture") {
    out.push(...paragraphs(null, content.introduction, links));
    const quotation = lines(content.quotation).join(" ");
    const wrapped = /^["“]/.test(quotation) ? quotation : `“${quotation}”`;
    out.push(para("ScriptureQuote", run(`${text(content.reference)} (${text(content.translation)})`, { b: true }), run(" — "), ...formattedRuns(wrapped, links, { i: true })));
  } else if (format === "takeaway") {
    out.push(...paragraphs("Takeaway", content.text, links));
  } else if (format === "quote") {
    out.push(...paragraphs("Quote", content.text, links));
  } else {
    out.push(...paragraphs(null, content.text, links));
  }
  return out;
}

export function buildTeachingTranslationDocx(teaching: ExportTeaching, categories: ExportCategory[], sections: ExportSection[]) {
  const links: Links = [];
  const body: string[] = [para("Title", run(text(teaching.title)))];

  const labelled = (label: string, value: unknown, many = false) => {
    body.push(para("Heading1", run(label)));
    const content = many ? paragraphs(null, value, links) : paragraphs(null, String(value ?? "").replace(/\s*\n+\s*/g, " "), links);
    body.push(...content);
  };

  labelled("Central Theme", teaching.central_theme);
  labelled("Introduction", teaching.introduction, true);
  labelled("Short Summary", teaching.summary);
  if (text(teaching.teaser_1_heading)) labelled("Homepage Teaser 1 Heading", teaching.teaser_1_heading);
  if (text(teaching.teaser_1_text)) labelled("Homepage Teaser 1 Text", teaching.teaser_1_text);
  if (text(teaching.teaser_2_heading)) labelled("Homepage Teaser 2 Heading", teaching.teaser_2_heading);
  if (text(teaching.teaser_2_text)) labelled("Homepage Teaser 2 Text", teaching.teaser_2_text);

  for (const category of [...categories].sort((a, b) => a.sort_order - b.sort_order)) {
    body.push(para("Heading1", run(text(category.title))));
    for (const section of sections.filter((item) => item.category_id === category.id).sort((a, b) => a.sort_order - b.sort_order)) {
      body.push(...sectionXml(section, links));
    }
  }

  return buildDocxPackage({
    bodyXml: body.join(""),
    hyperlinks: links,
    language: "es-SV",
    core: { title: text(teaching.title), description: TRANSLATOR_INSTRUCTIONS },
    custom: {
      SourceTeachingId: teaching.id,
      SourceTeachingType: teaching.teaching_type === "deep_dive" ? "deep_dive" : "standard",
      SourceLanguage: teaching.language === "es" ? "es" : "en",
    },
  });
}
