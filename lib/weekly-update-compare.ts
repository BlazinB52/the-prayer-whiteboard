// Compares the weekly update as it was uploaded (the stored Word document) with how it reads now, so the
// Administrator can see every paragraph that changed since the upload, for example after accepting a
// Content Manager's edits. Only the wording is compared: the plain text of each block, in order.

type Inline = { text?: unknown };
type Block = { type?: unknown; children?: unknown; items?: unknown };

function inlineText(children: unknown): string {
  return Array.isArray(children) ? (children as Inline[]).map((child) => (typeof child?.text === "string" ? child.text : "")).join("") : "";
}

// The readable text of one block. A list is one item per line.
export function blockPlainText(block: unknown): string {
  const value = block as Block | null;
  if (!value || typeof value !== "object") return "";
  if (value.type === "list" && Array.isArray(value.items)) return (value.items as unknown[]).map((item) => inlineText(item)).join("\n");
  return inlineText(value.children);
}

export type BlockDifference = {
  /** 1-based position, matching the field keys block_<position> used by the review editor. */
  position: number;
  original: string;
  current: string;
};

// Every position whose wording differs. If the two documents have a different number of blocks (for
// example because a paragraph was added or removed), the extra ones are reported with an empty side.
export function compareBlocks(original: unknown, current: unknown): { differences: BlockDifference[]; sameLength: boolean } {
  const before = Array.isArray(original) ? original : [];
  const after = Array.isArray(current) ? current : [];
  const differences: BlockDifference[] = [];
  const length = Math.max(before.length, after.length);
  for (let index = 0; index < length; index += 1) {
    const originalText = index < before.length ? blockPlainText(before[index]).trim() : "";
    const currentText = index < after.length ? blockPlainText(after[index]).trim() : "";
    if (originalText !== currentText) differences.push({ position: index + 1, original: originalText, current: currentText });
  }
  return { differences, sameLength: before.length === after.length };
}
