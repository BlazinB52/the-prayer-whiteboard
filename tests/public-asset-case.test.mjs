import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

// Windows treats public/Images and public/images as the same folder, so a picture whose address uses the wrong letter
// case works on this PC and returns "not found" on the Linux servers the site runs on. This checks every picture or file
// address the code uses against the exact spelling git holds.

const ASSET_ADDRESS = /(?:["'`(]|\})\/((?:[A-Za-z0-9_\-. ]+\/)+[A-Za-z0-9_\-. ]+\.(?:png|jpe?g|webp|svg|gif|ico|pdf|woff2?))(?=["'`)?#\s])/g;

/** Addresses in `source` that exist under public/ only if letter case is ignored. */
export function caseMismatches(source, tracked) {
  const exact = new Set(tracked);
  const insensitive = new Map(tracked.map((file) => [file.toLowerCase(), file]));
  const problems = [];
  for (const match of source.matchAll(ASSET_ADDRESS)) {
    const wanted = `public/${match[1]}`;
    if (exact.has(wanted)) continue;
    const actual = insensitive.get(wanted.toLowerCase());
    if (actual) problems.push({ asked: `/${match[1]}`, actual: `/${actual.slice("public/".length)}` });
  }
  return problems;
}

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) return name === "node_modules" || name === ".next" ? [] : sourceFiles(full);
    return /\.(ts|tsx|css|mjs)$/.test(name) ? [full] : [];
  });
}

test("the checker flags an address whose letter case differs from the file git holds", () => {
  const tracked = ["public/images/logo.png", "public/images/littlelights/hero.webp", "public/prayergroup/leader.jpg"];
  assert.deepEqual(caseMismatches('<img src="/images/logo.png" />', tracked), []);
  assert.deepEqual(caseMismatches("<Image src='/Images/logo.png' />", tracked), [{ asked: "/Images/logo.png", actual: "/images/logo.png" }]);
  assert.deepEqual(caseMismatches("const url = `${base}/images/littlelights/Hero.webp`;", tracked), [{ asked: "/images/littlelights/Hero.webp", actual: "/images/littlelights/hero.webp" }]);
  assert.deepEqual(caseMismatches('background: url("/prayergroup/Leader.jpg")', tracked), [{ asked: "/prayergroup/Leader.jpg", actual: "/prayergroup/leader.jpg" }]);
  // Addresses that are not files under public/ (pages, API routes, other sites) are not this test's business.
  assert.deepEqual(caseMismatches('href="/devotionals/start" src="https://example.com/Images/x.png" <a href="/api/x.pdf">', tracked), []);
});

test("every picture and file address in the code matches, letter for letter, a file git holds", (t) => {
  let tracked;
  try {
    tracked = execFileSync("git", ["ls-files", "public"], { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
  } catch {
    t.skip("not inside a git checkout, so there is nothing to compare against");
    return;
  }
  const problems = [];
  for (const file of [...sourceFiles("app"), ...sourceFiles("lib")]) {
    for (const problem of caseMismatches(readFileSync(file, "utf8"), tracked)) problems.push(`${file}: asks for ${problem.asked} but the file is ${problem.actual}`);
  }
  assert.deepEqual(problems, [], `these work on Windows but would show "not found" on the live server:\n${problems.join("\n")}`);
});

test("git holds every picture under one spelling of the folder name", (t) => {
  let tracked;
  try {
    tracked = execFileSync("git", ["ls-files", "public"], { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
  } catch {
    t.skip("not inside a git checkout, so there is nothing to compare against");
    return;
  }
  const spellings = new Map();
  for (const file of tracked) {
    const folder = file.split("/").slice(0, -1).join("/");
    const key = folder.toLowerCase();
    spellings.set(key, new Set([...(spellings.get(key) ?? []), folder]));
  }
  const split = [...spellings.values()].filter((set) => set.size > 1).map((set) => [...set].join(" and "));
  assert.deepEqual(split, [], `git tracks the same folder under two spellings, which confuses Windows: ${split.join("; ")}`);
});
