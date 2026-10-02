import { UserRound } from "lucide-react";

// A leader's square photo, or a framed "No photo available" placeholder.
// Used on the public page and in the editor so both look the same.
export function LeaderPhoto({
  src,
  alt,
  className = "",
  emphasis = false,
}: {
  src: string | null;
  alt: string;
  className?: string;
  emphasis?: boolean;
}) {
  const frame = emphasis
    ? "border-[3px] border-[#c99a52] shadow-xl shadow-[#4d5f52]/25 ring-4 ring-[#fff6e4]"
    : "border-2 border-[#d9c49c] shadow-md shadow-[#4d5f52]/15";

  return (
    <div className={`relative aspect-square w-full overflow-hidden rounded-2xl bg-[#f4efe5] ${frame} ${className}`}>
      {src ? (
        // Supabase public URLs; next/image would need remotePatterns config.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="block h-full w-full object-cover" loading="lazy" decoding="async" />
      ) : (
        <div
          role="img"
          aria-label="No photo available"
          className="absolute inset-[8%] flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#c99a52]/60 bg-[#fffaf0] text-center text-[#946332]"
        >
          <UserRound aria-hidden="true" className="h-[42%] w-[42%]" strokeWidth={1.5} />
          <span className="mt-1 px-1 text-[clamp(0.55rem,2.4vw,0.75rem)] font-extrabold uppercase leading-tight tracking-wider">
            No photo available
          </span>
        </div>
      )}
    </div>
  );
}
