import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { filesWithWindowsEndings, readEolListing } from "../scripts/normalize-line-endings.mjs";

// About 70 of these tests read a source file and match across its line breaks with \n. That only works when the file
// has Unix (LF) line endings. On Windows, git can write files with Windows (CRLF) endings, which makes unrelated tests
// fail depending on which files git last rewrote. Three did exactly that, which is why this guard exists: it names the
// real cause and the fix instead of leaving a scatter of mysterious failures.

test(".gitattributes makes every checkout use Unix line endings, on Windows too", async () => {
  const attributes = await readFile(".gitattributes", "utf8");
  assert.match(attributes, /^\* text=auto eol=lf$/m);
  assert.match(attributes, /^\*\.docx binary$/m, "Word files are never rewritten");
  assert.match(attributes, /^\*\.png binary$/m, "pictures are never rewritten");
});

test("the helper finds only plain-text files whose copy in the folder has Windows or mixed endings", () => {
  const listing = [
    "i/lf    w/lf    attr/text=auto eol=lf \tlib/fine.ts",
    "i/lf    w/crlf  attr/text=auto eol=lf \tlib/windows-endings.ts",
    "i/lf    w/mixed attr/text=auto eol=lf \tREADME.md",
    "i/-text w/-text attr/-text            \tpublic/images/logo.png",
    "i/-text w/crlf  attr/-text            \tdocs/handout.docx",
    "i/none  w/none  attr/text=auto eol=lf \tempty-file",
  ].join("\n");
  assert.deepEqual(filesWithWindowsEndings(listing), ["lib/windows-endings.ts", "README.md"]);
  assert.deepEqual(filesWithWindowsEndings(""), []);
  assert.deepEqual(filesWithWindowsEndings("i/lf    w/lf    attr/text=auto eol=lf \ta.ts\r\ni/lf    w/lf    attr/text=auto eol=lf \tb.ts\r\n"), [], "a listing with Windows line breaks is read the same");
});

test("no tracked text file in this folder has Windows line endings", (t) => {
  let listing;
  try {
    listing = readEolListing();
  } catch {
    t.skip("not inside a git checkout, so there is nothing to compare against");
    return;
  }
  const offenders = filesWithWindowsEndings(listing);
  assert.deepEqual(
    offenders,
    [],
    `${offenders.length} file(s) have Windows line endings, which makes tests that read source files fail at random: ${offenders.slice(0, 8).join(", ")}${offenders.length > 8 ? ", ..." : ""}.\n` +
      "Fix it with one command: node scripts/normalize-line-endings.mjs   (only the line endings change, never the words)",
  );
});
