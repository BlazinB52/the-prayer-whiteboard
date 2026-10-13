"use client";

import { useState } from "react";

// Copies a section's wording to the clipboard twice over: as formatted text (bold and italic kept, so it
// pastes into Word looking right) and as plain text for anything that only takes plain text.
export function CopyButtons({ html, text, label }: { html: string; text: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  const copy = async () => {
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([text], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      setState("copied");
    } catch {
      setState("failed");
    }
    window.setTimeout(() => setState("idle"), 2500);
  };

  return (
    <button type="button" onClick={copy} className="admin-secondary-button" aria-label={`Copy ${label}`}>
      <span>{state === "copied" ? "Copied" : state === "failed" ? "Could not copy" : `Copy ${label}`}</span>
    </button>
  );
}
