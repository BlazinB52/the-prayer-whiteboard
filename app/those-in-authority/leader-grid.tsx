"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { LeaderPhoto } from "./leader-photo";

export type LeaderCard = {
  id: string;
  name: string;
  title: string;
  photoUrl: string | null;
  photoAlt: string;
  scriptureReference: string;
  scriptureText: string | null;
  prayer: string;
};

export function LeaderGrid({ leaders }: { leaders: LeaderCard[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<LeaderCard | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (selected && !dialog.open) {
      dialog.showModal();
      // Lets the phone's back gesture close the card instead of leaving the page.
      window.history.pushState({ leaderCard: true }, "");
    }
  }, [selected]);

  useEffect(() => {
    function onPopState() {
      if (dialogRef.current?.open) dialogRef.current.close();
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function close() {
    dialogRef.current?.close();
  }

  // Runs for the X button, a tap outside, Esc, and the back gesture. Removes
  // the history entry added on open unless the back gesture already did.
  function handleClosed() {
    setSelected(null);
    if (window.history.state?.leaderCard) window.history.back();
  }

  return (
    <>
      <ul className={`mx-auto grid max-w-[19rem] gap-x-4 gap-y-5 ${leaders.length === 1 ? "grid-cols-1 max-w-[9.5rem]" : "grid-cols-2"}`}>
        {leaders.map((leader) => (
          <li key={leader.id}>
            <button
              type="button"
              onClick={() => setSelected(leader)}
              className="group block w-full rounded-2xl text-center focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#a85e32]"
              aria-haspopup="dialog"
            >
              <LeaderPhoto src={leader.photoUrl} alt={leader.photoAlt} className="transition group-hover:-translate-y-0.5 group-hover:border-[#c99a52]" />
              <span className="mt-2 block text-[0.95rem] font-extrabold leading-tight text-[#243d31]">{leader.name}</span>
              <span className="mt-0.5 block text-xs font-bold uppercase tracking-[0.08em] text-[#946332]">{leader.title}</span>
            </button>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialogRef}
        onClose={handleClosed}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        aria-labelledby="leader-card-name"
        className="m-auto max-h-[92dvh] w-[min(92vw,30rem)] overflow-y-auto rounded-[1.5rem] border border-[#284a3b]/15 bg-[#fffdf8] p-0 text-[#243126] shadow-2xl shadow-[#243126]/30 backdrop:bg-[#243126]/55 backdrop:backdrop-blur-[2px]"
      >
        {selected ? (
          <article className="relative p-5 sm:p-6">
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="absolute right-3 top-3 z-10 grid size-10 place-items-center rounded-full border border-[#284a3b]/15 bg-white text-[#244a3a] shadow-sm transition hover:text-[#a85e32]"
            >
              <X aria-hidden="true" size={20} />
            </button>

            <div className="grid grid-cols-[minmax(0,9.75rem)_minmax(0,1fr)] items-start gap-4 pt-6 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-5">
              <div className="text-center">
                <LeaderPhoto src={selected.photoUrl} alt={selected.photoAlt} emphasis />
                <h2 id="leader-card-name" className="mt-3 text-lg font-extrabold leading-tight text-[#243d31]">{selected.name}</h2>
                <p className="mt-0.5 text-xs font-black uppercase tracking-[0.1em] text-[#946332]">{selected.title}</p>
              </div>

              <blockquote className="rounded-2xl border-l-4 border-[#c99a52] bg-[#fff6e4] px-3 py-3 text-[#3f4f45] shadow-inner shadow-[#8b6531]/5 sm:px-4">
                {selected.scriptureText ? (
                  <p className="whitespace-pre-wrap break-words text-sm italic leading-6">{selected.scriptureText}</p>
                ) : null}
                <cite className={`block text-[0.7rem] not-italic font-extrabold uppercase tracking-[0.14em] text-[#946332] ${selected.scriptureText ? "mt-2" : ""}`}>
                  {selected.scriptureReference}
                </cite>
              </blockquote>
            </div>

            <section className="mt-5 rounded-2xl border-l-4 border-[#244a3a] bg-[#eaf2ec] px-4 py-3 shadow-inner shadow-[#244a3a]/5">
              <h3 className="text-[0.7rem] font-black uppercase tracking-[0.18em] text-[#243d31]">Our prayer</h3>
              <p className="mt-1.5 whitespace-pre-wrap break-words text-base leading-7 text-[#31483b]">{selected.prayer}</p>
            </section>
          </article>
        ) : null}
      </dialog>
    </>
  );
}
