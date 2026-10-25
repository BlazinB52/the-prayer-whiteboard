"use client";

import { useActionState, useState } from "react";
import { saveWhiteboardCardColors } from "./whiteboard-colors-action";

export function WhiteboardColorsForm({ front: initialFront, back: initialBack, isCustom }: { front: string; back: string; isCustom: boolean }) {
  const [front, setFront] = useState(initialFront);
  const [back, setBack] = useState(initialBack);
  const [state, formAction, pending] = useActionState(saveWhiteboardCardColors, {});

  return (
    <form action={formAction} className="grid gap-6 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="space-y-4">
        <label className="flex items-center gap-4 text-sm font-bold text-[#385245]">
          <input type="color" name="front" value={front} onChange={(event) => setFront(event.target.value)} className="h-11 w-16 cursor-pointer rounded-lg border border-[#284a3b]/15 bg-white p-1" />
          <span>Front card (directly around the whiteboard) <span className="ml-1 font-mono text-xs font-normal text-[#607066]">{front}</span></span>
        </label>
        <label className="flex items-center gap-4 text-sm font-bold text-[#385245]">
          <input type="color" name="back" value={back} onChange={(event) => setBack(event.target.value)} className="h-11 w-16 cursor-pointer rounded-lg border border-[#284a3b]/15 bg-white p-1" />
          <span>Back card (tilted shape behind it) <span className="ml-1 font-mono text-xs font-normal text-[#607066]">{back}</span></span>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className="admin-primary-button"><span>{pending ? "Saving..." : "Save colors"}</span></button>
          {isCustom ? <button type="submit" name="intent" value="reset" disabled={pending} className="min-h-11 rounded-xl border border-[#284a3b]/15 bg-white px-5 font-extrabold text-[#244a3a] transition hover:border-[#a85e32]/40 hover:text-[#a85e32]">Reset to original</button> : null}
        </div>
        {state.error ? <p role="alert" className="text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
        {state.saved ? <p role="status" className="text-sm font-bold text-[#326048]">Saved. The homepage now uses these colors.</p> : null}
        {state.reset ? <p role="status" className="text-sm font-bold text-[#326048]">Reset. The homepage is back to its original colors.</p> : null}
      </div>
      <div aria-hidden="true" className="relative mx-auto h-32 w-28">
        <div className="absolute -inset-2 rotate-2 rounded-2xl" style={{ backgroundColor: back }} />
        <div className="relative -rotate-1 h-full w-full rounded-2xl border border-[#284a3b]/10 p-2 shadow-lg" style={{ backgroundColor: front }}>
          <div className="h-full w-full rounded-lg bg-white ring-1 ring-[#284a3b]/10" />
        </div>
      </div>
    </form>
  );
}
