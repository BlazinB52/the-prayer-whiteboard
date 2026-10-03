import { FormattedTextBlocks } from "@/app/formatted-text";
import { canonicalCopyrightDisclaimerUrl } from "@/lib/copyright-disclaimer-format";

// Show the disclosures URL as visible text, not just a clickable "here" --
// this can end up on actual paper, where a link is dead but a printed URL
// is still usable. AMP/AMPC are wrapped as real links to lockman.org.
export function ScriptureCopyrightNotice({ content, baseUrl, printOnly = false }: { content: string; baseUrl: string; printOnly?: boolean }) {
  const text = content
    .replace(/\bhere\b/, canonicalCopyrightDisclaimerUrl(baseUrl))
    .replace(/\bAMPC\b/g, "[AMPC](https://www.lockman.org)")
    .replace(/\bAMP\b/g, "[AMP](https://www.lockman.org)");

  return (
    <div className={`${printOnly ? "print-only " : ""}mt-10 border-t border-[#284a3b]/15 pt-4 text-xs leading-5 text-[#7a8a80]`}>
      <FormattedTextBlocks text={text} links className="space-y-2" />
    </div>
  );
}
