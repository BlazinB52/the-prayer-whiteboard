// Measures text the way Word lays it out, so the handout builder can tell whether a section fits its box before the
// Word file is opened. Widths come from the Calibri and Georgia fonts the handout uses (font-metrics.json, in 1/2048 em
// units); the handout turns kerning off, so a line's width is the sum of its letters. Word breaks lines after a space,
// a hyphen and a dash, and a line is as tall as the font's own line height times the paragraph's line spacing.
import metricsData from "./font-metrics.json" with { type: "json" };

export type Family = "calibri" | "georgia";
type Style = "regular" | "bold" | "italic" | "boldItalic";
type FontMetrics = { upm: number; lineHeight: number; widths: Record<string, number> };

const METRICS = metricsData as unknown as Record<Family, Record<Style, FontMetrics>>;

export type MeasureRun = { text: string; bold?: boolean; italic?: boolean };

function fontFor(family: Family, bold: boolean | undefined, italic: boolean | undefined) {
  const style: Style = bold && italic ? "boldItalic" : bold ? "bold" : italic ? "italic" : "regular";
  return METRICS[family][style];
}

/** The width of one character in points at a size. A character the table does not have is measured as an "n". */
function charWidth(font: FontMetrics, character: string, sizePt: number) {
  const code = character.codePointAt(0) ?? 32;
  const width = font.widths[String(code)] ?? font.widths["110"] ?? font.upm / 2;
  return (width / font.upm) * sizePt;
}

export function textWidthPt(text: string, family: Family, sizePt: number, bold?: boolean, italic?: boolean) {
  const font = fontFor(family, bold, italic);
  let total = 0;
  for (const character of text) total += charWidth(font, character, sizePt);
  return total;
}

/** The height of one line of text, in points, at a size and a line spacing (1 = single, 1.1 = Word's 264/240). */
export function lineHeightPt(family: Family, sizePt: number, lineSpacing: number) {
  return sizePt * METRICS[family].regular.lineHeight * lineSpacing;
}

type Token = { width: number; trimmed: number };

// A token is a piece of text that ends where Word may break the line: after a space, a hyphen or a dash.
function tokenize(runs: MeasureRun[], family: Family, sizePt: number): Token[] {
  const tokens: Token[] = [];
  let width = 0;
  let spaces = 0;
  const close = () => {
    if (width > 0 || spaces > 0) tokens.push({ width, trimmed: width - spaces });
    width = 0;
    spaces = 0;
  };
  for (const run of runs) {
    const font = fontFor(family, run.bold, run.italic);
    for (const character of run.text) {
      const w = charWidth(font, character, sizePt);
      if (character === "\n") {
        close();
        continue;
      }
      width += w;
      if (character === " " || character === " ") {
        spaces += w;
        // A space is a break opportunity only for a normal space; text after it starts a new token.
        if (character === " ") close();
      } else {
        // Trailing spaces only count when something follows them on the line.
        if (spaces > 0) spaces = 0;
        if (character === "-" || character === "–" || character === "—" || character === "‐") close();
      }
    }
  }
  close();
  return tokens;
}

/**
 * How many lines a paragraph takes. The first line has firstWidthPt available (less for a hanging indent) and the rest
 * have nextWidthPt. A word too long for a line is placed on a line of its own, as Word does.
 */
export function countLines(runs: MeasureRun[], family: Family, sizePt: number, firstWidthPt: number, nextWidthPt: number): number {
  const tokens = tokenize(runs, family, sizePt);
  if (!tokens.length) return 1;
  let lines = 1;
  let used = 0;
  let available = firstWidthPt;
  for (const token of tokens) {
    if (used > 0 && used + token.trimmed > available + 0.01) {
      lines += 1;
      used = 0;
      available = nextWidthPt;
    }
    used += token.width;
  }
  return lines;
}
