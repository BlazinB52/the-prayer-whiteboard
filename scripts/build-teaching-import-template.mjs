#!/usr/bin/env node

// Builds the companion Word starter file for the Teaching DOCX importer. It
// installs the exact styles the import rules name (Title, Heading 1, Heading 2,
// Normal, Scripture Quote, List Bullet, Takeaway, Quote) with real Word bullets, and
// contains a short sample teaching that passes the importer. The styles and the
// package writer are shared with the "Export for translation" files (lib/docx-parts.ts).
//
//   node scripts/build-teaching-import-template.mjs [output-path]

import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { buildDocxPackage, numberingXml, para, run, stylesXml } from "../lib/docx-parts.ts";

export { numberingXml, stylesXml };

const text = (value) => run(value);

/** The sample teaching. Replace each paragraph's text with your own; keep the styles. */
export function sampleBody() {
  return [
    para("Title", text("Teaching Title Goes Here")),
    para("Heading1", text("Central Theme")),
    para(null, text("One sentence, 300 characters or fewer. Use the Normal style and exactly one paragraph.")),
    para("Heading1", text("Introduction")),
    para(null, text("One or more Normal paragraphs, 5,000 characters or fewer in total.")),
    para("Heading1", text("Short Summary")),
    para(null, text("Exactly one Normal paragraph, 600 characters or fewer.")),
    para("Heading1", text("Homepage Teaser 1 Heading")),
    para(null, text("Optional. One short Normal paragraph, 100 characters or fewer.")),
    para("Heading1", text("Homepage Teaser 1 Text")),
    para(null, text("Optional. One Normal paragraph, 350 characters or fewer.")),
    para("Heading1", text("First Teaching Category")),
    para(null, text("Normal paragraphs in a row become one section. You can use "), run("bold", { b: true }), text(", "), run("italics", { i: true }), text(", and hyperlinks to http or https addresses.")),
    para("ScriptureQuote", run("Romans 8:1 (ESV)", { b: true }), text(" — "), run("“There is therefore now no condemnation for those who are in Christ Jesus.”", { i: true })),
    para(null, text("Each Scripture Quote paragraph becomes its own section. Accepted translations: AMP, AMPC, ESV, KJV, NIV, NKJV for an English teaching; NVI and RVR1960 for an Español teaching.")),
    para("Heading2", text("A Named Subsection")),
    para(null, text("A Heading 2 gives the next section a visible title. Sections without one get a hidden title.")),
    para("Heading1", text("Second Teaching Category")),
    para("ListBullet", text("Use real Word bullets in the List Bullet style.")),
    para("ListBullet", text("Consecutive bullets become one bullets section.")),
    para("Takeaway", text("A Takeaway paragraph becomes its own takeaway section.")),
    para("Quote", text("A Quote paragraph becomes its own quote section, shown with a gold line down its left side. It has no Bible reference or translation.")),
  ].join("");
}

export function buildTeachingTemplate() {
  return buildDocxPackage({ bodyXml: sampleBody() });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = process.argv[2] ?? "The Prayer Whiteboard Teaching Template.docx";
  writeFileSync(output, buildTeachingTemplate());
  console.log(`Wrote ${output}`);
}
