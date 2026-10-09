"use client";

import { useEffect } from "react";
import { markRevisionOpened } from "./actions";

// Records that an Administrator has opened this revision, which closes the editor's chance to take it
// back. It runs in the browser on purpose: a link prefetch loads the page on the server but never
// runs this, so merely hovering over a link in the list does not count as opening it.
export function MarkOpened({ revisionId }: { revisionId: string }) {
  useEffect(() => {
    void markRevisionOpened(revisionId);
  }, [revisionId]);
  return null;
}
