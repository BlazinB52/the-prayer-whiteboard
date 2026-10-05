// Teaching DOCX importer. Implements "The Prayer Whiteboard Teaching DOCX Import
// Format Rules (Corrected v2)". Parsing is a pure function of the document: it
// validates the whole file and returns either a structured teaching or a list
// of errors. Nothing here touches the database.
import { findAll, firstChild, hasDescendant, openDocxPackage, parseXml, type XmlNode } from "./teaching-docx-package.ts";

/** Translations the importer accepts. Must stay in step with the copyright disclaimer wording. */
export const ACCEPTED_TEACHING_TRANSLATIONS = ["AMP", "AMPC", "ESV", "KJV", "NIV", "NKJV"] as const;

export const TEACHING_IMPORT_LIMITS = {
  title: 160,
  categoryTitle: 160,
  sectionTitle: 160,
  centralTheme: 300,
  introduction: 5000,
  summary: 400,
  sectionText: 12000,
  scriptureReference: 240,
  scriptureTranslation: 80,
} as const;

export type ImportedSection =
  | { format: "paragraph" | "takeaway"; title: string; showTitle: boolean; text: string }
  | { format: "bullets"; title: string; showTitle: boolean; bullets: string[] }
  | { format: "scripture"; title: string; showTitle: boolean; reference: string; translation: string; quotation: string };

type SectionDraft =
  | { format: "paragraph" | "takeaway"; text: string }
  | { format: "bullets"; bullets: string[] }
  | { format: "scripture"; reference: string; translation: string; quotation: string };

export type ImportedCategory = { title: string; sections: ImportedSection[] };

export type ImportedTeaching = {
  title: string;
  centralTheme: string;
  introduction: string;
  summary: string;
  categories: ImportedCategory[];
};

export type TeachingImportResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  teaching: ImportedTeaching | null;
};

export type TeachingDocxParts = {
  documentXml: string;
  stylesXml?: string | null;
  relationshipsXml?: string | null;
  hasComments?: boolean;
};

type Kind = "title" | "subtitle" | "h1" | "h2" | "h3plus" | "normal" | "scripture" | "bullet" | "takeaway" | "callout" | "other";

type Inline = { text: string; bold: boolean; italic: boolean; href: string | null; linkLabelIssue?: string };

type Block = {
  kind: Kind;
  styleName: string;
  inlines: Inline[];
  plain: string;
  hasNumbering: boolean;
  nestedList: boolean;
};

const CATEGORY_KIND_BY_NAME: Record<string, Kind> = {
  title: "title",
  subtitle: "subtitle",
  heading1: "h1",
  heading2: "h2",
  normal: "normal",
  scripturequote: "scripture",
  listbullet: "bullet",
  takeaway: "takeaway",
  callout: "callout",
};

const METADATA_LABELS = ["Central Theme", "Introduction", "Short Summary"] as const;
const RESERVED_LABELS = new Set(METADATA_LABELS.map((label) => label.toLowerCase()));
const SECTION_TYPE_LABEL = { paragraph: "Paragraph", takeaway: "Takeaway", bullets: "Bullets", scripture: "Scripture" } as const;
const TRACKED_CHANGE_ELEMENTS = ["w:ins", "w:del", "w:moveFrom", "w:moveTo", "w:rPrChange", "w:pPrChange"];

function normalizeStyleKey(value: string) {
  return value.toLowerCase().replace(/[\s_-]+/g, "");
}

function kindFromStyleKey(key: string): Kind | null {
  if (key in CATEGORY_KIND_BY_NAME) return CATEGORY_KIND_BY_NAME[key];
  if (/^heading[3-9]$/.test(key)) return "h3plus";
  return null;
}

function isFalseFlag(node: XmlNode | undefined) {
  if (!node) return true;
  const value = node.attrs["w:val"];
  return value === "0" || value === "false" || value === "off";
}

function readStyleNames(stylesXml: string | null | undefined) {
  const names = new Map<string, string>();
  let defaultId = "Normal";
  if (!stylesXml) return { names, defaultId };
  for (const style of findAll(parseXml(stylesXml), "w:style")) {
    if (style.attrs["w:type"] !== "paragraph") continue;
    const id = style.attrs["w:styleId"];
    if (!id) continue;
    names.set(id, firstChild(style, "w:name")?.attrs["w:val"] ?? id);
    if (style.attrs["w:default"] === "1") defaultId = id;
  }
  return { names, defaultId };
}

function readRelationships(relationshipsXml: string | null | undefined) {
  const targets = new Map<string, string>();
  if (!relationshipsXml) return targets;
  for (const relationship of findAll(parseXml(relationshipsXml), "Relationship")) {
    if (relationship.attrs.Id && relationship.attrs.Target) targets.set(relationship.attrs.Id, relationship.attrs.Target);
  }
  return targets;
}

function textOfRun(run: XmlNode) {
  let text = "";
  for (const child of run.children) {
    if (child.name === "w:t") text += child.children.map((node) => node.text ?? "").join("");
    else if (child.name === "w:tab" || child.name === "w:cr" || child.name === "w:ptab") text += " ";
    else if (child.name === "w:br") text += child.attrs["w:type"] === "page" ? "" : " ";
    else if (child.name === "w:noBreakHyphen") text += "-";
  }
  return text;
}

function hyperlinkFromInstruction(instruction: string) {
  const match = instruction.match(/^\s*HYPERLINK\s+(?:"([^"]*)"|(\S+))/i);
  return match ? (match[1] ?? match[2] ?? "") : null;
}

/** Walks a paragraph in document order, applying run formatting and hyperlinks. */
function readInlines(paragraph: XmlNode, relationships: Map<string, string>) {
  const inlines: Inline[] = [];
  const fields: { instruction: string; phase: "code" | "result"; href: string | null }[] = [];

  const pushRun = (run: XmlNode, href: string | null, label?: string) => {
    const properties = firstChild(run, "w:rPr");
    if (properties && firstChild(properties, "w:vanish") && !isFalseFlag(firstChild(properties, "w:vanish"))) return;
    const styleId = properties ? firstChild(properties, "w:rStyle")?.attrs["w:val"] : undefined;
    const bold = Boolean((properties && firstChild(properties, "w:b") && !isFalseFlag(firstChild(properties, "w:b"))) || styleId === "Strong");
    const italic = Boolean((properties && firstChild(properties, "w:i") && !isFalseFlag(firstChild(properties, "w:i"))) || styleId === "Emphasis");

    for (const child of run.children) {
      if (child.name === "w:fldChar") {
        const type = child.attrs["w:fldCharType"];
        if (type === "begin") fields.push({ instruction: "", phase: "code", href: null });
        else if (type === "separate" && fields.length) {
          const field = fields[fields.length - 1];
          field.phase = "result";
          field.href = hyperlinkFromInstruction(field.instruction);
        } else if (type === "end") fields.pop();
      } else if (child.name === "w:instrText" && fields.length) {
        fields[fields.length - 1].instruction += child.children.map((node) => node.text ?? "").join("");
      }
    }

    const activeField = fields.length ? fields[fields.length - 1] : null;
    if (activeField && activeField.phase === "code") return;
    const text = textOfRun(run);
    if (!text) return;
    const fieldHref = fields.map((field) => field.href).reverse().find((value) => value !== null) ?? null;
    inlines.push({ text, bold, italic, href: href ?? fieldHref, ...(label ? { linkLabelIssue: label } : {}) });
  };

  const walk = (node: XmlNode, href: string | null, issue?: string) => {
    for (const child of node.children) {
      if (child.name === "w:r") pushRun(child, href, issue);
      else if (child.name === "w:hyperlink") {
        const relationshipId = child.attrs["r:id"];
        if (relationshipId) walk(child, relationships.get(relationshipId) ?? "", undefined);
        else walk(child, "", child.attrs["w:anchor"] ? "internal document link" : "missing address");
      } else if (child.name === "w:fldSimple") {
        walk(child, hyperlinkFromInstruction(child.attrs["w:instr"] ?? "") ?? href, issue);
      } else if (child.name === "w:sdt") {
        const content = firstChild(child, "w:sdtContent");
        if (content) walk(content, href, issue);
      } else if (child.name === "w:smartTag" || child.name === "w:sdtContent") {
        walk(child, href, issue);
      }
    }
  };

  walk(paragraph, null);
  return inlines;
}

function collapseSpaces(value: string) {
  return value.replace(/[ \t ]+/g, " ").trim();
}

function plainText(inlines: Inline[]) {
  return collapseSpaces(inlines.map((inline) => inline.text).join(""));
}

type FormatContext = { bothCount: number; asteriskCount: number; badLinks: string[] };

function wrapFormat(text: string, bold: boolean, italic: boolean, context: FormatContext) {
  if (!text.trim() || (!bold && !italic)) return text;
  const leading = text.match(/^\s*/)![0];
  const trailing = text.match(/\s*$/)![0];
  const core = text.trim();
  if (bold && italic) context.bothCount += 1;
  const marker = bold ? "**" : "*";
  return `${leading}${marker}${core}${marker}${trailing}`;
}

function emphasisRuns(inlines: Inline[], context: FormatContext) {
  const merged: Inline[] = [];
  for (const inline of inlines) {
    const last = merged[merged.length - 1];
    if (last && last.bold === inline.bold && last.italic === inline.italic) last.text += inline.text;
    else merged.push({ ...inline });
  }
  return merged.map((run) => {
    if (run.text.includes("*")) context.asteriskCount += 1;
    return wrapFormat(run.text, run.bold, run.italic, context);
  }).join("");
}

function safeHref(href: string) {
  if (!/^https?:\/\//i.test(href.trim())) return null;
  try {
    const parsed = new URL(href.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? href.trim().replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/\s/g, "%20") : null;
  } catch {
    return null;
  }
}

/** Converts a paragraph's inline runs into the website's stored formatted text. */
function inlinesToFormattedText(inlines: Inline[], context: FormatContext) {
  const groups: { href: string | null; issue?: string; runs: Inline[] }[] = [];
  for (const inline of inlines) {
    const last = groups[groups.length - 1];
    if (last && last.href === inline.href && last.issue === inline.linkLabelIssue) last.runs.push(inline);
    else groups.push({ href: inline.href, issue: inline.linkLabelIssue, runs: [inline] });
  }

  const output = groups.map((group) => {
    if (group.href === null) return emphasisRuns(group.runs, context);
    const label = collapseSpaces(group.runs.map((run) => run.text).join(""));
    if (!label) return "";
    const safe = group.issue ? null : safeHref(group.href);
    if (!safe) {
      context.badLinks.push(`"${label}" (${group.issue ?? (group.href || "no address")})`);
      return emphasisRuns(group.runs, context);
    }
    const inner = emphasisRuns(group.runs, context).replace(/[[\]]/g, "").trim();
    return `[${inner}](${safe})`;
  }).join("");

  return output.replace(/[ \t ]+/g, " ").trim();
}

function collectBlocks(node: XmlNode, blocks: XmlNode[], tables: { count: number }) {
  for (const child of node.children) {
    if (child.name === "w:p") blocks.push(child);
    else if (child.name === "w:tbl") tables.count += 1;
    else if (child.name === "w:sdt") {
      const content = firstChild(child, "w:sdtContent");
      if (content) collectBlocks(content, blocks, tables);
    } else if (child.name === "#document" || child.name === "w:document" || child.name === "w:body" || child.name === "w:sdtContent" || child.name === "mc:AlternateContent") {
      collectBlocks(child, blocks, tables);
    }
  }
}

function snippet(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 60 ? `${clean.slice(0, 57)}...` : clean;
}

function describeScriptureProblem(text: string) {
  const full = text.match(/^(.+?)\s*\(([^()]+)\)\s*([—–-])\s*([\s\S]+)$/);
  if (!full) {
    if (/^.+?\s*[—–-]\s*["“]/.test(text)) return "the translation is missing. Use the pattern: Reference (TRANSLATION) — “quotation”.";
    return "it does not match the pattern: Reference (TRANSLATION) — “quotation”.";
  }
  return null;
}

function parseScripture(text: string): { reference: string; translation: string; quotation: string } | { error: string } {
  const problem = describeScriptureProblem(text);
  if (problem) return { error: problem };
  const match = text.match(/^(.+?)\s*\(([^()]+)\)\s*([—–-])\s*([\s\S]+)$/)!;
  const reference = match[1].trim();
  const translation = match[2].trim();
  const dash = match[3];
  const quotation = match[4].trim();

  if (dash !== "—") return { error: "an em dash (—) must separate the translation and the quotation." };
  if (!reference) return { error: "the Scripture reference is missing." };
  if (reference.length > TEACHING_IMPORT_LIMITS.scriptureReference) return { error: `the Scripture reference is longer than ${TEACHING_IMPORT_LIMITS.scriptureReference} characters.` };
  if (!(ACCEPTED_TEACHING_TRANSLATIONS as readonly string[]).includes(translation)) {
    const caseMatch = ACCEPTED_TEACHING_TRANSLATIONS.find((accepted) => accepted.toLowerCase() === translation.toLowerCase());
    return { error: caseMatch ? `the translation "${translation}" must be written exactly as ${caseMatch}.` : `the translation "${translation}" is not recognized. Accepted translations: ${ACCEPTED_TEACHING_TRANSLATIONS.join(", ")}.` };
  }
  const curly = quotation.startsWith("“") && quotation.endsWith("”");
  const straight = quotation.startsWith('"') && quotation.endsWith('"');
  if (quotation.length < 3 || !(curly || straight)) return { error: "the quotation must be enclosed in matching quotation marks." };
  return { reference, translation, quotation };
}

function hiddenTitle(categoryTitle: string, format: keyof typeof SECTION_TYPE_LABEL, ordinal: number) {
  const suffix = ` — ${SECTION_TYPE_LABEL[format]} ${ordinal}`;
  const room = TEACHING_IMPORT_LIMITS.sectionTitle - suffix.length;
  const base = categoryTitle.length > room ? `${categoryTitle.slice(0, Math.max(1, room - 1)).trimEnd()}…` : categoryTitle;
  return `${base}${suffix}`;
}

export function parseTeachingDocxParts(parts: TeachingDocxParts): TeachingImportResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let documentRoot: XmlNode;
  try {
    documentRoot = parseXml(parts.documentXml);
  } catch {
    return { ok: false, errors: ["The .docx document content could not be read."], warnings, teaching: null };
  }

  const { names: styleNames, defaultId } = readStyleNames(parts.stylesXml);
  const relationships = readRelationships(parts.relationshipsXml);

  const trackedChanges = TRACKED_CHANGE_ELEMENTS.reduce((total, name) => total + findAll(documentRoot, name).length, 0);
  if (trackedChanges) errors.push("The document contains unresolved tracked changes. Accept or reject all changes in Word (Review → Accept All), then save and upload again.");
  if (parts.hasComments || findAll(documentRoot, "w:commentRangeStart").length) warnings.push("The document contains comments. Comments will not be imported.");

  const paragraphNodes: XmlNode[] = [];
  const tables = { count: 0 };
  collectBlocks(documentRoot, paragraphNodes, tables);
  if (tables.count) warnings.push(`The document contains ${tables.count} table${tables.count === 1 ? "" : "s"}. Table content will not be imported.`);

  const formatContext: FormatContext = { bothCount: 0, asteriskCount: 0, badLinks: [] };
  const blocks: Block[] = [];
  for (const node of paragraphNodes) {
    const properties = firstChild(node, "w:pPr");
    const styleId = (properties && firstChild(properties, "w:pStyle")?.attrs["w:val"]) || defaultId;
    const styleName = styleNames.get(styleId) ?? styleId;
    const kind = kindFromStyleKey(normalizeStyleKey(styleName)) ?? kindFromStyleKey(normalizeStyleKey(styleId)) ?? "other";
    const numbering = properties ? firstChild(properties, "w:numPr") : undefined;
    const numId = numbering ? firstChild(numbering, "w:numId")?.attrs["w:val"] : undefined;
    const level = numbering ? Number(firstChild(numbering, "w:ilvl")?.attrs["w:val"] ?? "0") : 0;
    const inlines = hasDescendant(node, "w:txbxContent") ? [] : readInlines(node, relationships);
    const plain = plainText(inlines);

    if (hasDescendant(node, "w:txbxContent")) {
      warnings.push("A text box was found. Text boxes are not imported; move the text into the normal document body.");
      continue;
    }
    if (!plain && (hasDescendant(node, "w:drawing") || hasDescendant(node, "w:pict") || hasDescendant(node, "w:object"))) {
      warnings.push("An image was found and will not be imported. Teaching content must be text.");
      continue;
    }
    if (hasDescendant(node, "w:drawing") || hasDescendant(node, "w:pict")) {
      warnings.push(`An image inside the paragraph "${snippet(plain)}" will not be imported.`);
    }
    blocks.push({ kind, styleName, inlines, plain, hasNumbering: Boolean(numbering) && numId !== "0", nestedList: level > 0 });
  }

  let title: string | null = null;
  let beforeTitle = 0;
  let nextLabel = 0;
  let meta: { name: (typeof METADATA_LABELS)[number]; paragraphs: string[] } | null = null;
  const metaValues: Partial<Record<(typeof METADATA_LABELS)[number], string[]>> = {};
  const categories: ImportedCategory[] = [];
  let category: ImportedCategory | null = null;
  let pendingTitle: string | null = null;
  let run: { type: "paragraph" | "bullets"; items: string[] } | null = null;
  const ordinals: Record<string, number> = {};
  let nestedListSeen = false;

  const describe = (block: Block) => `“${snippet(block.plain)}”`;
  const formatted = (block: Block) => inlinesToFormattedText(block.inlines, formatContext);

  const finishMeta = () => {
    if (meta) metaValues[meta.name] = meta.paragraphs;
    meta = null;
  };

  const addSection = (section: SectionDraft) => {
    if (!category) return;
    const visible = pendingTitle !== null;
    let sectionTitle = pendingTitle ?? "";
    if (!visible) {
      // Only hidden-title sections are numbered, so the internal titles have no gaps.
      const ordinalKey = `${categories.length}:${section.format}`;
      ordinals[ordinalKey] = (ordinals[ordinalKey] ?? 0) + 1;
      sectionTitle = hiddenTitle(category.title, section.format, ordinals[ordinalKey]);
    }
    pendingTitle = null;
    category.sections.push({ ...section, title: sectionTitle, showTitle: visible } as ImportedSection);
  };

  const flushRun = () => {
    if (!run || !category) {
      run = null;
      return;
    }
    if (run.type === "paragraph") {
      const text = run.items.join("\n\n");
      if (text.length > TEACHING_IMPORT_LIMITS.sectionText) {
        errors.push(`A section in “${category.title}” has ${text.length.toLocaleString()} characters of text; the limit is ${TEACHING_IMPORT_LIMITS.sectionText.toLocaleString()}. Split it with a Heading 2 or a different content type.`);
      }
      addSection({ format: "paragraph", text });
    } else {
      addSection({ format: "bullets", bullets: run.items });
    }
    run = null;
  };

  const closeCategory = () => {
    flushRun();
    if (!category) return;
    if (pendingTitle !== null) errors.push(`The Heading 2 “${pendingTitle}” in “${category.title}” is not followed by any content.`);
    pendingTitle = null;
    if (!category.sections.length) errors.push(`The category “${category.title}” contains no content.`);
    category = null;
  };

  for (const block of blocks) {
    if (block.kind === "title") {
      if (!block.plain) continue;
      if (title !== null) {
        errors.push(`More than one Title paragraph was found (“${snippet(block.plain)}”). Use exactly one Title paragraph.`);
        continue;
      }
      title = block.plain;
      continue;
    }
    if (!block.plain) continue;

    if (title === null) {
      if (block.kind === "subtitle") warnings.push(`The Subtitle “${snippet(block.plain)}” will not be imported. Put the complete public title in the Title paragraph.`);
      else beforeTitle += 1;
      continue;
    }

    if (block.kind === "subtitle") {
      warnings.push(`The Subtitle “${snippet(block.plain)}” will not be imported. Put the complete public title in the Title paragraph.`);
      continue;
    }
    if (block.kind === "h3plus") {
      errors.push(`Unsupported heading level (${block.styleName}): ${describe(block)}. Use only Heading 1 and Heading 2.`);
      continue;
    }
    if (block.kind === "callout") {
      errors.push(`The Callout style is not supported yet: ${describe(block)}.`);
      continue;
    }
    if (block.kind === "other") {
      if (block.hasNumbering) errors.push(`${describe(block)} is a list item in the “${block.styleName}” style. Use the List Bullet style for bullet points.`);
      else warnings.push(`A paragraph in the unsupported “${block.styleName}” style will not be imported: ${describe(block)}.`);
      continue;
    }

    if (block.kind === "h1") {
      const label = block.plain.trim();
      const key = label.toLowerCase();
      if (nextLabel < METADATA_LABELS.length) {
        finishMeta();
        const expected = METADATA_LABELS[nextLabel];
        if (key === expected.toLowerCase()) {
          meta = { name: expected, paragraphs: [] };
          nextLabel += 1;
        } else if (key === "summary") {
          errors.push("The Heading 1 “Summary” is not accepted. Use “Short Summary”, and place the labels in this order: Central Theme, Introduction, Short Summary.");
        } else if (RESERVED_LABELS.has(key)) {
          errors.push(`The metadata label “${label}” is out of order. Expected “${expected}” next.`);
        } else {
          errors.push(`Expected the Heading 1 label “${expected}” but found “${label}”. The labels must appear in this order: Central Theme, Introduction, Short Summary.`);
        }
        continue;
      }
      finishMeta();
      closeCategory();
      if (RESERVED_LABELS.has(key)) {
        errors.push(`The metadata label “${label}” appears more than once.`);
        continue;
      }
      if (label.length > TEACHING_IMPORT_LIMITS.categoryTitle) {
        errors.push(`The category title “${snippet(label)}” is longer than ${TEACHING_IMPORT_LIMITS.categoryTitle} characters.`);
      }
      category = { title: label, sections: [] };
      categories.push(category);
      continue;
    }

    if (block.kind === "h2") {
      if (meta) {
        errors.push(`Metadata content under “${meta.name}” is styled ${block.styleName}: ${describe(block)}. It must use the Normal style.`);
        continue;
      }
      if (!category) {
        errors.push(`The Heading 2 ${describe(block)} appears before the first category. Place it inside a Heading 1 category.`);
        continue;
      }
      flushRun();
      if (pendingTitle !== null) errors.push(`The Heading 2 “${pendingTitle}” in “${category.title}” is not followed by any content.`);
      if (block.plain.length > TEACHING_IMPORT_LIMITS.sectionTitle) errors.push(`The Heading 2 “${snippet(block.plain)}” is longer than ${TEACHING_IMPORT_LIMITS.sectionTitle} characters.`);
      pendingTitle = block.plain;
      continue;
    }

    // Remaining kinds are content: normal, scripture, bullet, takeaway.
    if (meta) {
      if (block.kind === "normal") {
        if (block.hasNumbering) errors.push(`Metadata content under “${meta.name}” is a list item: ${describe(block)}.`);
        else meta.paragraphs.push(meta.name === "Central Theme" ? inlinesToFormattedText(block.inlines.map((inline) => ({ ...inline, bold: false, italic: false, href: null })), formatContext) : formatted(block));
      } else {
        errors.push(`Metadata content under “${meta.name}” is styled ${block.styleName}: ${describe(block)}. It must use the Normal style.`);
      }
      continue;
    }
    if (!category) {
      errors.push(`Content appears before the first required label or category: ${describe(block)}. After the Title, the document must begin with the Central Theme label.`);
      continue;
    }

    if (block.kind === "normal") {
      if (block.hasNumbering) {
        errors.push(`${describe(block)} is a list item in the Normal style. Use the List Bullet style for bullet points.`);
        continue;
      }
      const text = formatted(block);
      if (run?.type === "paragraph") run.items.push(text);
      else {
        flushRun();
        run = { type: "paragraph", items: [text] };
      }
    } else if (block.kind === "bullet") {
      if (block.nestedList) nestedListSeen = true;
      const text = formatted(block);
      if (text.length > TEACHING_IMPORT_LIMITS.sectionText) errors.push(`A bullet in “${category.title}” is longer than ${TEACHING_IMPORT_LIMITS.sectionText.toLocaleString()} characters.`);
      if (run?.type === "bullets") run.items.push(text);
      else {
        flushRun();
        run = { type: "bullets", items: [text] };
      }
    } else if (block.kind === "scripture") {
      flushRun();
      const parsed = parseScripture(block.plain);
      if ("error" in parsed) {
        errors.push(`Scripture Quote ${describe(block)}: ${parsed.error}`);
        continue;
      }
      addSection({ format: "scripture", ...parsed });
    } else if (block.kind === "takeaway") {
      flushRun();
      const text = formatted(block);
      if (text.length > TEACHING_IMPORT_LIMITS.sectionText) errors.push(`A takeaway in “${category.title}” is longer than ${TEACHING_IMPORT_LIMITS.sectionText.toLocaleString()} characters.`);
      addSection({ format: "takeaway", text });
    }
  }

  finishMeta();
  closeCategory();

  if (title === null) errors.push("No Title paragraph was found. Start the document with one paragraph in the Title style.");
  else if (title.length > TEACHING_IMPORT_LIMITS.title) errors.push(`The title is ${title.length} characters; the limit is ${TEACHING_IMPORT_LIMITS.title}.`);
  if (beforeTitle) warnings.push(`${beforeTitle} paragraph${beforeTitle === 1 ? "" : "s"} appear${beforeTitle === 1 ? "s" : ""} before the Title and will not be imported.`);

  for (const missing of METADATA_LABELS.slice(nextLabel)) errors.push(`The required Heading 1 label “${missing}” is missing.`);

  const themeParagraphs = metaValues["Central Theme"] ?? [];
  const introductionParagraphs = metaValues.Introduction ?? [];
  const summaryParagraphs = metaValues["Short Summary"] ?? [];
  if (nextLabel > 0) {
    if (themeParagraphs.length === 0) errors.push("Central Theme has no content. Add exactly one Normal paragraph.");
    if (themeParagraphs.length > 1) errors.push("Central Theme must contain exactly one paragraph, but more than one was found.");
  }
  if (nextLabel > 1 && introductionParagraphs.length === 0) errors.push("Introduction has no content. Add one or more Normal paragraphs.");
  if (nextLabel > 2) {
    if (summaryParagraphs.length === 0) errors.push("Short Summary has no content. Add exactly one Normal paragraph.");
    if (summaryParagraphs.length > 1) errors.push("Short Summary must contain exactly one paragraph, but more than one was found.");
  }

  const centralTheme = themeParagraphs[0] ?? "";
  const introduction = introductionParagraphs.join("\n\n");
  const summary = summaryParagraphs[0] ?? "";
  if (centralTheme.length > TEACHING_IMPORT_LIMITS.centralTheme) errors.push(`Central Theme is ${centralTheme.length} characters; the limit is ${TEACHING_IMPORT_LIMITS.centralTheme}.`);
  if (introduction.length > TEACHING_IMPORT_LIMITS.introduction) errors.push(`Introduction is ${introduction.length.toLocaleString()} characters; the limit is ${TEACHING_IMPORT_LIMITS.introduction.toLocaleString()}.`);
  if (summary.length > TEACHING_IMPORT_LIMITS.summary) errors.push(`Short Summary is ${summary.length} characters; the limit is ${TEACHING_IMPORT_LIMITS.summary}.`);
  if (nextLabel === METADATA_LABELS.length && categories.length === 0) errors.push("No teaching categories were found. Add at least one Heading 1 category after the Short Summary.");

  for (const link of formatContext.badLinks) errors.push(`The link ${link} must be an http or https address.`);
  if (formatContext.bothCount) warnings.push(`${formatContext.bothCount} passage${formatContext.bothCount === 1 ? " is" : "s are"} both bold and italic. The website cannot combine them, so they were imported as bold only.`);
  if (formatContext.asteriskCount) warnings.push("Some text contains an asterisk (*), which the website may display as italic or bold formatting. Review the imported text.");
  if (nestedListSeen) warnings.push("Nested bullet levels were found. All bullets are imported at a single level.");

  if (errors.length || title === null) return { ok: false, errors, warnings, teaching: null };
  return { ok: true, errors, warnings, teaching: { title, centralTheme, introduction, summary, categories } };
}

export function parseTeachingDocx(buffer: Buffer): TeachingImportResult {
  try {
    const docx = openDocxPackage(buffer);
    const documentXml = docx.readPart("word/document.xml");
    if (!documentXml) return { ok: false, errors: ["This file is not a valid Word document (word/document.xml is missing)."], warnings: [], teaching: null };
    const comments = docx.readPart("word/comments.xml");
    return parseTeachingDocxParts({
      documentXml,
      stylesXml: docx.readPart("word/styles.xml"),
      relationshipsXml: docx.readPart("word/_rels/document.xml.rels"),
      hasComments: Boolean(comments && comments.includes("<w:comment ")),
    });
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : "The .docx document could not be read."], warnings: [], teaching: null };
  }
}

/** Suggests a gathering date from a leading YYYYMMDD in the file name. The administrator must confirm it. */
export function suggestGatheringDate(fileName: string) {
  const match = fileName.match(/^(\d{4})(\d{2})(\d{2})(?!\d)/);
  if (!match) return null;
  const value = `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

/** The stored `teaching_sections.content` JSON for an imported section (same shape the section editor writes). */
export function toSectionContent(section: ImportedSection) {
  const shared = section.showTitle ? {} : { showTitle: false };
  if (section.format === "bullets") return { version: 1, format: "bullets", bullets: section.bullets, ...shared };
  if (section.format === "scripture") {
    return { version: 1, format: "scripture", reference: section.reference, translation: section.translation, quotation: section.quotation, ...shared };
  }
  return { version: 1, format: section.format, text: section.text, ...shared };
}
