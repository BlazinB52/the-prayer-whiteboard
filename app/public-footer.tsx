import Link from "next/link";
import { BookOpenText } from "lucide-react";

const contactEmail = "theprayerwhiteboard@gmail.com";

export function PublicFooter() {
  return (
    <footer className="public-site-footer bg-[#1d352b] px-5 py-9 text-center text-[#d8e5dd] sm:px-8">
      <BookOpenText aria-hidden="true" className="mx-auto text-[#efc775]" size={28} />
      <p className="mt-4 text-lg font-extrabold text-white">The Whiteboard</p>
      <p className="mt-2 text-sm">Prayer &middot; The Word &middot; Praise &middot; Growing Together</p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm text-[#d8e5dd]">
        <Link href="/about" className="inline-flex min-h-10 items-center underline-offset-4 transition hover:text-[#f0cb83] hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f1c66f]">
          About The Prayer Whiteboard
        </Link>
        <a href={`mailto:${contactEmail}`} className="inline-flex min-h-10 items-center underline-offset-4 transition hover:text-[#f0cb83] hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f1c66f]">
          Contact
        </a>
      </div>
    </footer>
  );
}
