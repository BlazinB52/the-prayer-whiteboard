"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";

export function ReturnToTop() {
  const [visible, setVisible] = useState(false);
  const topRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY >= 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function returnToTop() {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
    topRef.current?.focus({ preventScroll: true });
  }

  return (
    <>
      <span ref={topRef} tabIndex={-1} className="sr-only" aria-hidden="true" />
      <button type="button" onClick={returnToTop} aria-label="Return to top" className={`return-to-top fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-[calc(1rem+env(safe-area-inset-right))] z-50 grid size-11 place-items-center rounded-full border border-[#f1c66f]/45 bg-[#244a3a] text-[#fffdf8] shadow-lg shadow-[#243126]/20 transition hover:bg-[#1d3d30] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f1c66f] motion-reduce:transition-none ${visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"}`}>
        <ArrowUp aria-hidden="true" size={20} />
      </button>
    </>
  );
}
