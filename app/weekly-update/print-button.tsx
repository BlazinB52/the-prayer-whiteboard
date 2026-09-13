"use client";

import { Printer } from "lucide-react";

export function WeeklyUpdatePrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#284a3b]/15 bg-white px-4 text-sm font-extrabold text-[#244a3a] transition hover:border-[#a85e32]/40 hover:text-[#a85e32]"
    >
      <Printer aria-hidden="true" size={17} />
      Print
    </button>
  );
}
