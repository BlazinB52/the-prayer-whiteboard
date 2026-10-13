import { formatTeachingDate } from "@/lib/teaching-date";

/** The "Teaching of Saturday, Oct 10, 2026" tag shown next to a title in the admin screens. */
export function TeachingDateLabel({ date, className = "" }: { date: string | null | undefined; className?: string }) {
  const text = formatTeachingDate(date);
  if (!text) return null;
  return <span className={`rounded-full bg-[#e7efe9] px-3 py-1 text-[11px] font-black uppercase tracking-wider text-[#326048] ${className}`}>Teaching of {text}</span>;
}
