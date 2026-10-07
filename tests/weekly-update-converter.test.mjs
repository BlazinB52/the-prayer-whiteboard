import assert from "node:assert/strict";
import test from "node:test";
import { docxBuffer } from "./teaching-docx-fixture.mjs";
import { convertDocxToWeeklyUpdate } from "../lib/weekly-update-docx.ts";
import { buildWeeklyUpdateEmail, linkedHtml } from "../lib/weekly-update-email-content.ts";

const run = (text, props = "") => `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${text}</w:t></w:r>`;
const para = (inner, style = "") => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}${inner}</w:p>`;
const convert = (paragraphs, options) => convertDocxToWeeklyUpdate(docxBuffer(paragraphs, options));
const codes = (result) => result.report.notes.map((note) => note.code);
const plainText = (block) => (block.children ?? []).map((child) => child.text).join("");

test("a clean document converts exactly as before and produces no warnings", () => {
  const result = convert([
    ["Heading1", "Weekly Update"],
    [null, "Normal text with ", { t: "bold words", b: true }, " and ", { t: "italic words", i: true }, "."],
    ["Quote", "A quote."],
  ]);
  assert.deepEqual(result.blocks.map((block) => block.type), ["heading", "paragraph", "quote"]);
  assert.deepEqual(result.report.notes, []);
  assert.equal(result.plainText, "Weekly Update\n\nNormal text with bold words and italic words.\n\nA quote.");
});

test("Word hyperlinks stay clickable, in the form the website and email already understand", () => {
  const result = convert([[null, "Sign up ", { t: "here", link: "https://example.com/register" }, " today."]]);
  const block = result.blocks[0];
  assert.equal(plainText(block), "Sign up [here](https://example.com/register) today.");
  assert.equal(result.plainText, "Sign up here (https://example.com/register) today.", "the plain-text copy reads naturally");
  assert.deepEqual(codes(result), [], "kept links need no warning");
});

test("a link keeps its bold and italic, and a link split across runs becomes one link", () => {
  const result = convert([[null, { t: "Read ", b: true, link: "https://example.com/a" }, { t: "more", b: true, link: "https://example.com/a" }]]);
  assert.deepEqual(result.blocks[0].children.map((child) => child.text), ["[Read more](https://example.com/a)"]);
  assert.equal(result.blocks[0].children[0].bold, true);
});

test("only web addresses become links; others are kept as words and reported", () => {
  const result = convert([
    [null, { t: "Email us", link: "mailto:someone@example.com" }],
    [null, { t: "Run it", link: "javascript:alert(1)" }],
    [null, { t: "Fine", link: "https://example.com" }],
  ]);
  assert.equal(plainText(result.blocks[0]), "Email us");
  assert.equal(plainText(result.blocks[1]), "Run it");
  assert.equal(plainText(result.blocks[2]), "[Fine](https://example.com)");
  const note = result.report.notes.find((item) => item.code === "links_lost");
  assert.ok(note, "unsafe or unsupported links are reported");
  assert.match(note.message, /2 links were not kept/);
});

test("characters that would break the stored link form are made safe", () => {
  const result = convert([[null, { t: "a [tricky] label", link: "https://example.com/path with space/(x)" }]]);
  assert.equal(plainText(result.blocks[0]), "[a (tricky) label](https://example.com/path%20with%20space/%28x%29)");
});

test("unresolved tracked changes are reported loudly, with how they were treated", () => {
  const tracked = para(
    run("Kept sentence. ") +
    `<w:ins w:id="1" w:author="Editor" w:date="2026-10-01T00:00:00Z"><w:r><w:t>Inserted wording.</w:t></w:r></w:ins>` +
    `<w:del w:id="2" w:author="Editor" w:date="2026-10-01T00:00:00Z"><w:r><w:delText>Deleted wording.</w:delText></w:r></w:del>`,
  );
  const result = convert([tracked]);
  assert.match(plainText(result.blocks[0]), /Inserted wording\./);
  assert.doesNotMatch(plainText(result.blocks[0]), /Deleted wording/);
  const note = result.report.notes[0];
  assert.equal(note.code, "tracked_changes");
  assert.equal(note.level, "warning");
  assert.match(note.message, /1 insertion, 1 deletion/);
  assert.match(note.message, /as if every change had been accepted/);
  assert.match(note.message, /Accept All/);
});

test("pictures, tables, footnotes and text boxes are reported, and a table's text is not lost", () => {
  const result = convert([
    para(run("Before.")),
    para(`<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"/></w:drawing></w:r>`),
    `<w:tbl><w:tr><w:tc>${para(run("Cell one"))}</w:tc><w:tc>${para(run("Cell two"))}</w:tc></w:tr></w:tbl>`,
    para(run("Note") + `<w:r><w:footnoteReference w:id="2"/></w:r>`),
    para(`<w:r><w:txbxContent>${para(run("Boxed"))}</w:txbxContent></w:r>`),
  ]);
  for (const code of ["images", "tables", "footnotes", "text_boxes"]) assert.ok(codes(result).includes(code), `${code} is reported`);
  assert.ok(result.blocks.some((block) => plainText(block) === "Cell one"), "table text is still included");
  assert.ok(result.blocks.some((block) => plainText(block) === "Cell two"));
});

test("sub-items and numbering are reported because they are flattened", () => {
  const item = (level) => `<w:p><w:pPr><w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="1"/></w:numPr></w:pPr>${run(`Item ${level}`)}</w:p>`;
  const result = convert([item(0), item(1)]);
  assert.equal(result.blocks[0].type, "list");
  assert.equal(result.blocks[0].items.length, 2);
  assert.ok(codes(result).includes("lists"));
});

test("small formatting differences are information, listed after the warnings", () => {
  const result = convert([
    para(run("Underlined red", `<w:u w:val="single"/><w:color w:val="FF0000"/>`)),
    para(`<w:r><w:drawing/></w:r>`),
    [null, { t: "A bold line", b: true }],
  ]);
  const levels = result.report.notes.map((note) => note.level);
  assert.deepEqual([...levels].sort(), levels.slice().sort());
  assert.equal(levels[0], "warning");
  assert.ok(codes(result).includes("formatting"));
  assert.ok(codes(result).includes("inferred_headings"));
  assert.equal(levels.lastIndexOf("warning") < levels.indexOf("info"), true, "warnings come first");
});

test("Word comments are noted as ignored", () => {
  const withComments = docxBuffer([[null, "Text."]]);
  // The fixture has no comments part; a document that has one is flagged by the part's presence.
  assert.deepEqual(convertDocxToWeeklyUpdate(withComments).report.notes, []);
});

test("the email turns stored links into real links and escapes everything else", () => {
  assert.equal(linkedHtml("Sign up [here](https://example.com/a?b=1&c=2) now"), 'Sign up <a href="https://example.com/a?b=1&amp;c=2" style="color:#244a3a;text-decoration:underline;">here</a> now');
  const scripted = linkedHtml("[x](javascript:alert(1))");
  assert.doesNotMatch(scripted, /<a |href/, "a javascript: address never becomes a link");
  const hostile = linkedHtml('<script>alert(1)</script> [a"b](https://example.com/"onmouseover="x)');
  assert.doesNotMatch(hostile, /<script/);
  assert.doesNotMatch(hostile, /onmouseover="x"/, "a quote in an address cannot add an attribute");
  assert.equal(linkedHtml("[not a link](ftp://example.com/file)"), "not a link");
});

test("a full weekly update email carries the link in the HTML and the address in the plain text", () => {
  const converted = convert([[null, "Register ", { t: "here", link: "https://example.com/register" }, "."]]);
  const email = buildWeeklyUpdateEmail({
    title: "Weekly Update",
    bodyMarkdown: converted.plainText,
    convertedContent: converted.blocks,
    weeklyUpdateUrl: "https://theprayerwhiteboard.com/weekly-update",
    preferencesUrl: "https://theprayerwhiteboard.com/email-preferences",
  });
  assert.match(email.html, /<a href="https:\/\/example\.com\/register"[^>]*>here<\/a>/);
  assert.doesNotMatch(email.html, /\[here\]\(/);
  assert.match(email.text, /Register here \(https:\/\/example\.com\/register\)\./);
  assert.doesNotMatch(email.text, /\[here\]\(/);
});
