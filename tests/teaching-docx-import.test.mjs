import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ACCEPTED_TEACHING_TRANSLATIONS,
  parseTeachingDocx,
  parseTeachingDocxParts,
  suggestGatheringDate,
  toSectionContent,
} from "../lib/teaching-docx-import.ts";
import { FALLBACK_FULL_PAGE_COPYRIGHT_DISCLAIMER } from "../lib/copyright-disclaimer-format.ts";
import { docxBuffer, parts, validTeaching } from "./teaching-docx-fixture.mjs";

function parse(paragraphs, options) {
  return parseTeachingDocxParts(parts(paragraphs, options));
}

function withReplaced(match, replacement) {
  return validTeaching().map((row) => (match(row) ? replacement : row));
}

function assertError(result, pattern) {
  assert.equal(result.ok, false, "expected the document to be rejected");
  assert.ok(result.errors.some((message) => pattern.test(message)), `no error matched ${pattern}; got:\n${result.errors.join("\n")}`);
}

const isRomans = (row) => row[0] === "ScriptureQuote" && row[1].startsWith("Romans");

test("a valid teaching parses into metadata, categories, and typed sections", () => {
  const result = parse(validTeaching());
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.deepEqual(result.errors, []);

  const teaching = result.teaching;
  assert.equal(teaching.title, "Treasure in Earthen Vessels: Hearts Made Tender for His Glory");
  assert.equal(teaching.centralTheme, "God places eternal treasure in ordinary vessels.");
  assert.equal(teaching.introduction, "First introduction paragraph.\n\nSecond introduction paragraph.");
  assert.equal(teaching.summary, "A short summary.");
  assert.deepEqual(teaching.categories.map((category) => category.title), ["The Treasure Within the Vessel", "Living as a Vessel of His Glory"]);

  const [first, second] = teaching.categories;
  assert.deepEqual(first.sections.map((section) => section.format), ["scripture", "paragraph", "paragraph", "scripture", "paragraph"]);
  assert.deepEqual(second.sections.map((section) => section.format), ["bullets", "takeaway"]);
});

test("consecutive Normal paragraphs join into one section with paragraph breaks preserved", () => {
  const { teaching } = parse(validTeaching());
  const paragraph = teaching.categories[0].sections[1];
  assert.equal(paragraph.format, "paragraph");
  assert.match(paragraph.text, /\n\nA second paragraph in the same run\.$/);
});

test("a Heading 2 titles only the first following section; others get hidden internal titles", () => {
  const { teaching } = parse(validTeaching());
  const sections = teaching.categories[0].sections;

  assert.deepEqual(sections[0], { format: "scripture", title: "The Treasure Within the Vessel — Scripture 1", showTitle: false, reference: "2 Corinthians 4:7", translation: "NIV", quotation: "“But we have this treasure in jars of clay.”" });
  assert.equal(sections[1].title, "The Treasure Within the Vessel — Paragraph 1");
  assert.equal(sections[1].showTitle, false);
  assert.equal(sections[2].title, "Freedom from Condemnation");
  assert.equal(sections[2].showTitle, true);
  assert.equal(sections[3].title, "The Treasure Within the Vessel — Scripture 2");
  assert.equal(sections[3].showTitle, false);
  assert.equal(sections[4].title, "The Treasure Within the Vessel — Paragraph 2");
});

test("Normal paragraphs before or after a bullet list stay separate sections", () => {
  const paragraphs = validTeaching();
  const index = paragraphs.findIndex((row) => row[1] === "Look beyond temporary conditions.");
  paragraphs.splice(index, 0, [null, "Lead-in."]);
  paragraphs.splice(index + 3, 0, [null, "Wrap-up."]);
  const { teaching } = parse(paragraphs);
  assert.deepEqual(teaching.categories[1].sections.map((section) => section.format), ["paragraph", "bullets", "paragraph", "takeaway"]);
  assert.deepEqual(teaching.categories[1].sections[1].bullets, ["Look beyond temporary conditions.", "Reject condemnation."]);
});

test("each Scripture Quote and each Takeaway paragraph becomes its own section", () => {
  const paragraphs = validTeaching();
  paragraphs.push(["Takeaway", "Second takeaway."]);
  const { teaching } = parse(paragraphs);
  assert.deepEqual(teaching.categories[1].sections.filter((section) => section.format === "takeaway").map((section) => section.text), ["We are ordinary vessels carrying an eternal treasure.", "Second takeaway."]);
});

test("bold, italics, and http/https hyperlinks convert to website formatted text", () => {
  const { teaching } = parse(validTeaching());
  assert.equal(teaching.categories[0].sections[1].text.split("\n\n")[0], "An earthen vessel is **common** and *breakable*, see [the site](https://example.com/page).");
});

test("bold plus italic imports as bold with a warning because the site cannot nest them", () => {
  const paragraphs = withReplaced((row) => row[1] === "Body under the heading.", [null, { t: "Both", b: true, i: true }]);
  const result = parse(paragraphs);
  assert.equal(result.ok, true);
  assert.equal(result.teaching.categories[0].sections[2].text, "**Both**");
  assert.ok(result.warnings.some((message) => /bold and italic/.test(message)));
});

test("emphasis markers hug the text and leave surrounding spaces outside", () => {
  const paragraphs = withReplaced((row) => row[1] === "Body under the heading.", [null, "Word", { t: " spaced ", b: true }, "end."]);
  assert.equal(parse(paragraphs).teaching.categories[0].sections[2].text, "Word **spaced** end.");
});

test("Scripture formatting is ignored; reference, translation, and quotation come from the text pattern", () => {
  const paragraphs = withReplaced(isRomans, ["ScriptureQuote", { t: "Romans 8:1  (ESV)", b: true }, "   — ", { t: "“There is therefore now no condemnation.”", i: true }]);
  const { teaching, ok, errors } = parse(paragraphs);
  assert.equal(ok, true, errors.join("\n"));
  const scripture = teaching.categories[0].sections[3];
  assert.equal(scripture.reference, "Romans 8:1");
  assert.equal(scripture.translation, "ESV");
  assert.equal(scripture.quotation, "“There is therefore now no condemnation.”");
});

test("AMP and AMPC are accepted and preserved exactly as written", () => {
  for (const translation of ["AMP", "AMPC"]) {
    const paragraphs = withReplaced(isRomans, ["ScriptureQuote", `Psalm 115:1 (${translation}) — “Not to us, O LORD.”`]);
    assert.equal(parse(paragraphs).teaching.categories[0].sections[3].translation, translation);
  }
});

test("straight matching quotation marks and ellipses or brackets inside a quotation are accepted", () => {
  const paragraphs = withReplaced(isRomans, ["ScriptureQuote", 'Romans 8:1-2 (NKJV) — "There is … no condemnation [for us] who are in Christ."']);
  const result = parse(paragraphs);
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.teaching.categories[0].sections[3].quotation, '"There is … no condemnation [for us] who are in Christ."');
});

test("a Scripture Quote with a missing translation is an error, not a guess", () => {
  const paragraphs = withReplaced(isRomans, ["ScriptureQuote", "Romans 8:1 — “There is therefore now no condemnation.”"]);
  assertError(parse(paragraphs), /translation is missing/);
});

test("an unrecognized or wrongly cased translation is an error", () => {
  const unknown = withReplaced(isRomans, ["ScriptureQuote", "Romans 8:1 (MSG) — “There is therefore now no condemnation.”"]);
  assertError(parse(unknown), /"MSG" is not recognized/);
  const cased = withReplaced(isRomans, ["ScriptureQuote", "Romans 8:1 (esv) — “There is therefore now no condemnation.”"]);
  assertError(parse(cased), /must be written exactly as ESV/);
});

test("Scripture Quote requires an em dash and matching quotation marks", () => {
  const hyphen = withReplaced(isRomans, ["ScriptureQuote", "Romans 8:1 (ESV) - “There is therefore now no condemnation.”"]);
  assertError(parse(hyphen), /em dash/);
  const mismatched = withReplaced(isRomans, ["ScriptureQuote", 'Romans 8:1 (ESV) — “There is therefore now no condemnation."']);
  assertError(parse(mismatched), /unmatched quotation mark/);
  const openOnly = withReplaced(isRomans, ["ScriptureQuote", "Romans 8:1 (ESV) — “There is therefore now no condemnation."]);
  assertError(parse(openOnly), /unmatched quotation mark/);
});

test("a Scripture Quote without quotation marks is accepted, because it is a block by itself", () => {
  const unquoted = withReplaced(isRomans, ["ScriptureQuote", "Romans 8:1 (ESV) — There is therefore now no condemnation."]);
  const result = parse(unquoted);
  assert.equal(result.ok, true, result.errors.join(" "));
  assert.equal(result.teaching.categories[0].sections[3].quotation, "There is therefore now no condemnation.");
});

test("metadata content styled as Heading 1 is an error and does not become a category", () => {
  const paragraphs = withReplaced((row) => row[1] === "God places eternal treasure in ordinary vessels.", ["Heading1", "God places eternal treasure in ordinary vessels."]);
  const result = parse(paragraphs);
  assert.equal(result.ok, false);
  assert.equal(result.teaching, null);
  assertError(result, /Expected the Heading 1 label “Introduction”|Central Theme has no content/);
});

test("metadata content in another style is an error", () => {
  const paragraphs = withReplaced((row) => row[1] === "A short summary.", ["Takeaway", "A short summary."]);
  assertError(parse(paragraphs), /under “Short Summary” is styled Takeaway/);
});

test("Central Theme and Short Summary allow exactly one paragraph", () => {
  const theme = validTeaching();
  theme.splice(3, 0, [null, "Another theme paragraph."]);
  assertError(parse(theme), /Central Theme must contain exactly one paragraph/);

  const summary = validTeaching();
  const index = summary.findIndex((row) => row[1] === "A short summary.");
  summary.splice(index + 1, 0, [null, "Second summary paragraph."]);
  assertError(parse(summary), /Short Summary must contain exactly one paragraph/);
});

test("metadata labels must appear in order; Summary is not an alias; missing labels are errors", () => {
  const outOfOrder = validTeaching();
  [outOfOrder[1], outOfOrder[3]] = [outOfOrder[3], outOfOrder[1]];
  assertError(parse(outOfOrder), /out of order/);

  assertError(parse(withReplaced((row) => row[1] === "Short Summary", ["Heading1", "Summary"])), /“Summary” is not accepted/);

  const missing = validTeaching().filter((row) => row[1] !== "Introduction" && row[1] !== "First introduction paragraph." && row[1] !== "Second introduction paragraph.");
  assertError(parse(missing), /Expected the Heading 1 label “Introduction”/);
});

test("a repeated metadata label after the categories begin is an error", () => {
  const paragraphs = validTeaching();
  paragraphs.push(["Heading1", "Central Theme"], [null, "Again."]);
  assertError(parse(paragraphs), /appears more than once/);
});

test("field limits are enforced", () => {
  assertError(parse(withReplaced((row) => row[1] === "A short summary.", [null, "x".repeat(501)])), /Short Summary is 501 characters/);
  assertError(parse(withReplaced((row) => row[1] === "God places eternal treasure in ordinary vessels.", [null, "x".repeat(401)])), /Central Theme is 401 characters/);
  assertError(parse(withReplaced((row) => row[1] === "First introduction paragraph.", [null, "x".repeat(5000)])), /Introduction is/);
  assertError(parse(withReplaced((row) => row[0] === "Title", ["Title", "x".repeat(161)])), /title is 161 characters/);
  assertError(parse(withReplaced((row) => row[1] === "Text after the scripture.", [null, "x".repeat(12001)])), /12,000/);
});

test("Central Theme is stored as plain text while Introduction and Summary keep formatting", () => {
  const paragraphs = validTeaching();
  paragraphs[2] = [null, { t: "Bold theme", b: true }];
  paragraphs[4] = [null, { t: "Bold intro", b: true }];
  const { teaching } = parse(paragraphs);
  assert.equal(teaching.centralTheme, "Bold theme");
  assert.match(teaching.introduction, /^\*\*Bold intro\*\*/);
});

test("a Heading 2 with no content, and a category with no content, are errors", () => {
  const emptyHeading = validTeaching();
  emptyHeading.splice(emptyHeading.findIndex((row) => row[1] === "Freedom from Condemnation") + 1, 0, ["Heading2", "Another Heading"]);
  assertError(parse(emptyHeading), /“Another Heading”|“Freedom from Condemnation”/);
  const doubleHeading = validTeaching();
  doubleHeading.splice(doubleHeading.findIndex((row) => row[1] === "Body under the heading."), 0, ["Heading2", "Second Heading"]);
  assertError(parse(doubleHeading), /“Freedom from Condemnation” in “The Treasure Within the Vessel” is not followed by any content/);

  const trailing = validTeaching();
  trailing.push(["Heading2", "Dangling"]);
  assertError(parse(trailing), /“Dangling”/);

  const emptyCategory = validTeaching();
  emptyCategory.splice(emptyCategory.findIndex((row) => row[1] === "Living as a Vessel of His Glory") + 1, 0, ["Heading1", "Hollow Category"]);
  assertError(parse(emptyCategory), /The category “Living as a Vessel of His Glory” contains no content/);
});

test("Heading 3 and higher, and the reserved Callout style, are errors", () => {
  const heading3 = validTeaching();
  heading3.splice(9, 0, ["Heading3", "Too deep"]);
  assertError(parse(heading3), /Unsupported heading level/);

  const callout = validTeaching();
  callout.push(["Callout", "A boxed note."]);
  assertError(parse(callout), /Callout style is not supported/);
});

test("an unresolved tracked change is an error", () => {
  const tracked = validTeaching();
  tracked.push('<w:p><w:ins w:id="1" w:author="A"><w:r><w:t>inserted</w:t></w:r></w:ins></w:p>');
  assertError(parse(tracked), /tracked changes/);
  const paragraphMark = validTeaching();
  paragraphMark.push('<w:p><w:pPr><w:rPr><w:del w:id="2" w:author="A"/></w:rPr></w:pPr></w:p>');
  assertError(parse(paragraphMark), /tracked changes/);
});

test("mailto, relative, and other non-http links are errors that name the linked text", () => {
  for (const target of ["mailto:someone@example.com", "/relative/path", "ftp://example.com/file"]) {
    const paragraphs = withReplaced((row) => row[1] === "Body under the heading.", [null, "See ", { t: "this link", link: target }, "."]);
    assertError(parse(paragraphs), /link "this link"/);
  }
});

test("a Subtitle warns and is not imported; content before the Title warns", () => {
  const paragraphs = validTeaching();
  paragraphs.splice(1, 0, ["Subtitle", "A subtitle"]);
  paragraphs.unshift([null, "Stray note before the title."]);
  const result = parse(paragraphs);
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.ok(result.warnings.some((message) => /Subtitle “A subtitle” will not be imported/.test(message)));
  assert.ok(result.warnings.some((message) => /before the Title/.test(message)));
  assert.equal(JSON.stringify(result.teaching).includes("A subtitle"), false);
});

test("exactly one Title is required", () => {
  assertError(parseTeachingDocxParts(parts(validTeaching().slice(1))), /No Title paragraph/);
  const two = validTeaching();
  two.splice(1, 0, ["Title", "Second title"]);
  assertError(parse(two), /More than one Title/);
});

test("comments, tables, text boxes, images, and unsupported styles warn without blocking", () => {
  const paragraphs = validTeaching();
  paragraphs.splice(9, 0, ["Quote", "An unsupported style paragraph."]);
  paragraphs.push("<w:p><w:r><w:drawing/></w:r></w:p>");
  paragraphs.push("<w:p><w:r><mc:AlternateContent><w:drawing><w:txbxContent><w:p><w:r><w:t>boxed text</w:t></w:r></w:p></w:txbxContent></w:drawing></mc:AlternateContent></w:r></w:p>");
  const result = parse(paragraphs, { hasComments: true, rawBody: "<w:tbl><w:tr><w:tc><w:p><w:r><w:t>cell</w:t></w:r></w:p></w:tc></w:tr></w:tbl>" });
  assert.equal(result.ok, true, result.errors.join("\n"));
  for (const pattern of [/comments/, /table/, /text box/i, /image/i, /“Quote” style will not be imported/]) {
    assert.ok(result.warnings.some((message) => pattern.test(message)), `missing warning ${pattern}`);
  }
  const text = JSON.stringify(result.teaching);
  assert.equal(text.includes("boxed text"), false);
  assert.equal(text.includes("cell"), false);
});

test("bullet points must use the List Bullet style", () => {
  const paragraphs = validTeaching();
  paragraphs.push('<w:p><w:pPr><w:pStyle w:val="Quote"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="3"/></w:numPr></w:pPr><w:r><w:t>Bulleted by hand</w:t></w:r></w:p>');
  assertError(parse(paragraphs), /Use the List Bullet style/);
});

test("blank paragraphs are ignored", () => {
  const paragraphs = validTeaching();
  paragraphs.splice(11, 0, [null], ["Heading1"]);
  const result = parse(paragraphs);
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.teaching.categories.length, 2);
});

test("a whole .docx file round-trips through the zip reader", () => {
  const result = parseTeachingDocx(docxBuffer(validTeaching()));
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.teaching.categories.length, 2);
  assert.equal(result.teaching.categories[0].sections[1].text.includes("[the site](https://example.com/page)"), true);
});

test("a non-docx file is rejected with a clear error", () => {
  const result = parseTeachingDocx(Buffer.from("this is not a zip file at all, just plain text"));
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /not a valid \.docx/);
});

test("imported sections use the same stored shapes as the section editor", () => {
  const { teaching } = parse(validTeaching());
  const [scripture, paragraph, visible] = teaching.categories[0].sections;
  assert.deepEqual(toSectionContent(scripture), { version: 1, format: "scripture", reference: "2 Corinthians 4:7", translation: "NIV", quotation: "“But we have this treasure in jars of clay.”", showTitle: false });
  assert.equal(toSectionContent(paragraph).format, "paragraph");
  assert.equal(toSectionContent(paragraph).showTitle, false);
  assert.equal("showTitle" in toSectionContent(visible), false);
  assert.deepEqual(toSectionContent(teaching.categories[1].sections[0]), { version: 1, format: "bullets", bullets: ["Look beyond temporary conditions.", "Reject condemnation."], showTitle: false });
  assert.equal(toSectionContent(teaching.categories[1].sections[1]).format, "takeaway");
});

test("hidden titles never exceed the section title limit", () => {
  const longCategory = "A".repeat(160);
  const paragraphs = validTeaching();
  paragraphs.push(["Heading1", longCategory], [null, "Body."]);
  const result = parse(paragraphs);
  assert.equal(result.ok, true, result.errors.join("\n"));
  const section = result.teaching.categories.at(-1).sections[0];
  assert.ok(section.title.length <= 160);
  assert.match(section.title, /— Paragraph 1$/);
});

test("the accepted translations are exactly the six approved and each has a disclaimer", () => {
  assert.deepEqual([...ACCEPTED_TEACHING_TRANSLATIONS].sort(), ["AMP", "AMPC", "ESV", "KJV", "NIV", "NKJV"]);
  const disclaimerEvidence = {
    AMP: "Amplified® Bible (AMP)",
    AMPC: "(AMPC)",
    ESV: "English Standard Version",
    KJV: "(KJV)",
    NIV: "New International Version",
    NKJV: "New King James Version",
  };
  assert.deepEqual(Object.keys(disclaimerEvidence).sort(), [...ACCEPTED_TEACHING_TRANSLATIONS].sort());
  for (const [translation, evidence] of Object.entries(disclaimerEvidence)) {
    assert.ok(FALLBACK_FULL_PAGE_COPYRIGHT_DISCLAIMER.includes(evidence), `${translation} has no matching disclaimer text`);
  }
});

test("a leading YYYYMMDD in the file name suggests a gathering date", () => {
  assert.equal(suggestGatheringDate("20260926 Upload_Treasure in Earthen Vessels.docx"), "2026-09-26");
  assert.equal(suggestGatheringDate("20261340 Bad.docx"), null);
  assert.equal(suggestGatheringDate("Treasure 20260926.docx"), null);
  assert.equal(suggestGatheringDate("202609261.docx"), null);
});

test("the importer adds no schema changes and writes only to the existing teaching tables", async () => {
  const source = await readFile("app/admin/teachings/import/actions.ts", "utf8");
  const tables = [...source.matchAll(/\.from\("([a-z_]+)"\)/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(tables)].sort(), ["teaching_categories", "teaching_sections", "teachings"]);
  assert.doesNotMatch(source, /\.rpc\(/);
  assert.match(source, /status: "draft"/);
  assert.doesNotMatch(source, /status: "published"/);
});
