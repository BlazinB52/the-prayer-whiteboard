import { button, escapeHtml, shell } from "./subscription-email-content.ts";

// Periods that end an abbreviation rather than a sentence. Devotional readings
// are dense with scripture citations, so a naive split on "." truncates mid-verse.
const ABBREVIATIONS = [
  "vv", "v", "cf", "ch", "chs", "pp", "p", "e.g", "i.e", "etc", "vs",
  "Mr", "Mrs", "Ms", "Dr", "St", "Rev", "Fr", "Jr", "Sr",
  "Gen", "Ex", "Lev", "Num", "Deut", "Josh", "Judg", "Sam", "Kgs", "Chr",
  "Ezra", "Neh", "Est", "Ps", "Pss", "Prov", "Eccl", "Song", "Isa", "Jer",
  "Lam", "Ezek", "Dan", "Hos", "Joel", "Amos", "Obad", "Jon", "Mic", "Nah",
  "Hab", "Zeph", "Hag", "Zech", "Mal", "Matt", "Mk", "Lk", "Jn", "Rom",
  "Cor", "Gal", "Eph", "Phil", "Col", "Thess", "Tim", "Tit", "Phlm", "Heb",
  "Jas", "Pet", "Rev",
];

function endsWithAbbreviation(text: string) {
  const trailing = text.match(/(\S+)\.$/);
  if (!trailing) return false;
  const word = trailing[1].replace(/^[("'\[]+/, "");
  // A single initial ("C.") or a known abbreviation is not a sentence end.
  if (/^[A-Za-z]$/.test(word)) return true;
  return ABBREVIATIONS.some((abbreviation) => abbreviation.toLowerCase() === word.toLowerCase());
}

export function firstSentence(text: string | null | undefined) {
  const normalized = (text ?? "").replace(/\r\n?/g, "\n").trim();
  if (!normalized) return "";

  // Only the first block matters; a paragraph break always ends the preview.
  const firstBlock = normalized.split(/\n{2,}/)[0].replace(/\s+/g, " ").trim();

  const pattern = /[.!?]["')\]]?(?=\s|$)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(firstBlock)) !== null) {
    const candidate = firstBlock.slice(0, match.index + match[0].length);
    if (endsWithAbbreviation(candidate)) continue;
    return candidate.trim();
  }

  return firstBlock;
}

export function buildDevotionalDayEmail(input: {
  dayNumber: number;
  totalDays?: number;
  title: string;
  anchorScriptures: string[];
  devotionalReading: string | null;
  dayUrl: string;
  preferencesUrl: string;
}) {
  const totalDays = input.totalDays ?? 7;
  const dayLabel = `Day ${input.dayNumber} of ${totalDays}`;
  const preview = firstSentence(input.devotionalReading);

  // Rendered verbatim from the array, matching the published day page.
  const scriptures = input.anchorScriptures.filter((scripture) => scripture.trim());
  const scripturesHtml = scriptures.length
    ? `<h2 style="margin:28px 0 10px;color:#243d31;font-size:20px;line-height:1.25;">Anchor Scriptures</h2>
       <ul style="margin:0 0 16px;padding-left:22px;line-height:1.7;">${scriptures.map((scripture) => `<li style="margin:0 0 8px;">${escapeHtml(scripture)}</li>`).join("")}</ul>`
    : "";

  const previewHtml = preview
    ? `<h2 style="margin:28px 0 10px;color:#243d31;font-size:20px;line-height:1.25;">Devotional Reading</h2>
       <p style="margin:0 0 16px;line-height:1.7;">${escapeHtml(preview)}</p>`
    : "";

  const html = shell(input.title, `
    <p style="margin:0 0 6px;color:#946332;font-size:12px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;">${escapeHtml(dayLabel.toUpperCase())}</p>
    ${scripturesHtml}
    ${previewHtml}
    <p style="margin:28px 0 0;">${button("Click here to read the rest of today's devotional", input.dayUrl)}</p>
    <hr style="border:0;border-top:1px solid rgba(40,74,59,0.15);margin:28px 0 16px;" />
    <p style="margin:0;line-height:1.65;color:#607066;font-size:13px;">You are receiving this because you subscribed to a Prayer Whiteboard devotional series. <a href="${escapeHtml(input.preferencesUrl)}" style="color:#244a3a;">Manage your email preferences or unsubscribe</a>.</p>
  `);

  const text = [
    dayLabel.toUpperCase(),
    input.title,
    scriptures.length ? `\nAnchor Scriptures\n${scriptures.map((scripture) => `- ${scripture}`).join("\n")}` : "",
    preview ? `\nDevotional Reading\n${preview}` : "",
    "",
    `Click here to read the rest of today's devotional:`,
    input.dayUrl,
    "",
    "---",
    "You are receiving this because you subscribed to a Prayer Whiteboard devotional series.",
    `Manage your email preferences or unsubscribe: ${input.preferencesUrl}`,
  ].filter((line) => line !== "").join("\n");

  return { subject: `${dayLabel}: ${input.title}`, html, text };
}
