import { FormattedTextBlocks, splitFormattedTextBlocks } from "@/app/formatted-text";

export function ContentFooter({ content }: { content: string | null | undefined }) {
  if (!splitFormattedTextBlocks(content).length) return null;

  return (
    <footer className="content-footer mt-12 border-t border-[#284a3b]/15 pt-5 text-xs leading-5 text-[#607066] print:text-[9pt] print:leading-snug">
      <FormattedTextBlocks text={content} links className="space-y-3" listClassName="list-disc space-y-1 pl-5" />
    </footer>
  );
}
