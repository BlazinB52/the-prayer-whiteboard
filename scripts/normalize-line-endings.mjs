#!/usr/bin/env node

// Turns files in your working folder that have Windows line endings (CRLF) back into Unix ones (LF), the way git
// stores them. Only the line endings change; the words in every file stay exactly as they are.
//
// Why this exists: git on Windows can write a file with CRLF endings when it checks it out, while editors and tools
// write LF, so a folder drifts into a mix. Tests that read source files and match across line breaks then pass or fail
// depending on which files git last rewrote. .gitattributes (`* text=auto eol=lf`) stops git doing it, and
// tests/line-endings.test.mjs fails with a plain explanation if it ever happens anyway. This is the one-command fix.
//
//   node scripts/normalize-line-endings.mjs

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * From the text of `git ls-files --eol`, the plain-text files that git stores with Unix endings but whose copy in the
 * folder has Windows (or mixed) endings. Pictures, Word files and anything git does not treat as text are never listed.
 */
export function filesWithWindowsEndings(eolListing) {
  return eolListing
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [meta, file] = line.split("\t");
      const [index, workingCopy] = meta.trim().split(/\s+/);
      return { index, workingCopy, file };
    })
    .filter((entry) => entry.file && entry.index === "i/lf" && (entry.workingCopy === "w/crlf" || entry.workingCopy === "w/mixed"))
    .map((entry) => entry.file);
}

export function readEolListing() {
  return execFileSync("git", ["ls-files", "--eol"], { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = filesWithWindowsEndings(readEolListing());
  for (const file of files) {
    const original = readFileSync(file);
    writeFileSync(file, Buffer.from(original.toString("latin1").replaceAll("\r\n", "\n"), "latin1"));
  }
  console.log(files.length ? `Converted ${files.length} file(s) to Unix line endings.` : "Every text file already has Unix line endings. Nothing to do.");
}
