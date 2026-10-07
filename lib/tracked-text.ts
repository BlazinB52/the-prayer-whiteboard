// Word-style "Track Changes" rendering of a wording change. Insertions are underlined and deletions are
// struck through in red, word by word, so a one-word edit shows as one word removed and one added
// rather than a whole replaced paragraph.
//
// The text is always rendered as plain React text nodes, never as HTML, so a proposal containing
// markup (for example <script>) is shown as literal characters and cannot run. Bold, italic and link
// markers (** * [text](url)) are part of the text, so they stay exactly as written.

import { createElement, type ReactNode } from "react";
import { diffWords } from "diff";

export type TextSegment = { type: "same" | "ins" | "del"; text: string };

export function diffText(original: string, proposed: string): TextSegment[] {
  return diffWords(original ?? "", proposed ?? "").map((part) => ({
    type: part.added ? "ins" : part.removed ? "del" : "same",
    text: part.value,
  }));
}

const DELETED = "bg-[#fdecea] text-[#b3261e] line-through decoration-[#b3261e]";
const INSERTED = "bg-[#e8f0fe] text-[#1a4fb4] underline decoration-[#1a4fb4] decoration-2 underline-offset-2";

export function TrackedText({ original, proposed }: { original: string; proposed: string }) {
  const children: ReactNode[] = diffText(original, proposed).map((segment, index) => {
    if (segment.type === "del") return createElement("del", { key: index, className: DELETED, "aria-label": "deleted text" }, segment.text);
    if (segment.type === "ins") return createElement("ins", { key: index, className: INSERTED, "aria-label": "inserted text" }, segment.text);
    return createElement("span", { key: index }, segment.text);
  });
  return createElement("p", { className: "whitespace-pre-wrap break-words text-base leading-7 text-[#243126]" }, children);
}

/** Plain-language summary of a diff, useful for tests and for screen readers. */
export function describeDiff(original: string, proposed: string) {
  const segments = diffText(original, proposed);
  return {
    inserted: segments.filter((segment) => segment.type === "ins").map((segment) => segment.text),
    deleted: segments.filter((segment) => segment.type === "del").map((segment) => segment.text),
  };
}
