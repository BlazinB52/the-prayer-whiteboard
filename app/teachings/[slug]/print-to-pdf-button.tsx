"use client";

import { Printer } from "lucide-react";

export function PrintToPdfButton({ teachingTitle }: { teachingTitle: string }) {
  function printToPdf() {
    const originalTitle = document.title;
    let restored = false;

    function restoreTitle() {
      if (restored) return;
      restored = true;
      document.title = originalTitle;
      window.removeEventListener("afterprint", restoreTitle);
    }

    window.addEventListener("afterprint", restoreTitle);
    document.title = `${teachingTitle} - The Prayer Whiteboard`;
    window.print();
    window.setTimeout(restoreTitle, 1000);
  }

  return (
    <button type="button" onClick={printToPdf} className="print-to-pdf-button inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#284a3b]/15 bg-[#fffdf8] px-4 text-sm font-extrabold text-[#244a3a] shadow-sm shadow-[#4d5f52]/5 transition hover:border-[#a85e32]/40 hover:text-[#a85e32] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a85e32]">
      <Printer aria-hidden="true" size={17} />
      <span>Print to PDF</span>
    </button>
  );
}
