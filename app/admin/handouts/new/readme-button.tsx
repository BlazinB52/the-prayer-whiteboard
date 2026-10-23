"use client";

import { useRef, useState, type ReactNode } from "react";
import { BookOpen, Check, Copy, X } from "lucide-react";

/** A button that opens the handout guide in a pop-up. The guide itself is rendered on the server and passed in. */
export function ReadmeButton({ children }: { children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-2 rounded-full border border-[#284a3b]/15 bg-white px-4 py-2 text-sm font-extrabold text-[#244a3a] shadow-sm transition hover:text-[#a85e32]"
      >
        <BookOpen aria-hidden="true" size={16} />
        How to build a handout
      </button>
      <dialog
        ref={dialogRef}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
        aria-label="How to build a handout"
        className="m-auto max-h-[92dvh] w-[min(94vw,52rem)] overflow-y-auto rounded-[1.5rem] border border-[#284a3b]/15 bg-[#fffdf8] p-0 text-[#243126] shadow-2xl shadow-[#243126]/30 backdrop:bg-[#243126]/55 backdrop:backdrop-blur-[2px]"
      >
        <div className="sticky top-0 z-10 flex justify-end bg-[#fffdf8]/95 px-4 pt-3">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close"
            className="grid size-10 place-items-center rounded-full border border-[#284a3b]/15 bg-white text-[#244a3a] shadow-sm transition hover:text-[#a85e32]"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </div>
        <article className="space-y-3 px-5 pb-6 text-sm leading-6 text-[#3f4f45] sm:px-8">{children}</article>
      </dialog>
    </>
  );
}

/** A code block with a Copy button, used for the condensing prompt. */
export function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the text is still selectable on screen.
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={copy}
        className="absolute right-2 top-2 inline-flex items-center gap-1.5 rounded-full border border-[#284a3b]/15 bg-white px-3 py-1 text-xs font-extrabold text-[#244a3a] shadow-sm hover:text-[#a85e32]"
      >
        {copied ? <Check aria-hidden="true" size={14} /> : <Copy aria-hidden="true" size={14} />}
        {copied ? "Copied" : "Copy"}
      </button>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-xl border border-[#284a3b]/10 bg-[#f4efe3] p-4 pt-10 text-xs leading-5 text-[#243126]">{text}</pre>
    </div>
  );
}
