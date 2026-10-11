// The note on Day 6 that Day 7 is Communion, so the reader has bread and juice ready.
export function CommunionHeadsUp({ title, text }: { title: string; text: string }) {
  return (
    <aside className="mt-8 rounded-2xl border border-[#c99a52]/40 border-l-4 border-l-[#c99a52] bg-[#fbf4e4] p-6">
      <p className="text-lg font-extrabold text-[#243d31]">{title}</p>
      <p className="mt-2 text-base leading-7 text-[#52645a]">{text}</p>
    </aside>
  );
}
