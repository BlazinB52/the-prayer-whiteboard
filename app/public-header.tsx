import Link from "next/link";
import type { ReactNode } from "react";
import { BookOpenText, Menu } from "lucide-react";

type PublicHeaderProps = {
  maxWidthClassName?: string;
  nav?: Array<{ href: string; label: string }>;
  homeLabel?: string;
  end?: ReactNode;
};

export function PublicHeader({ maxWidthClassName = "max-w-5xl", nav, homeLabel = "Back to home", end }: PublicHeaderProps) {
  return (
    <header className="public-site-header sticky top-0 z-40 border-b border-[#284a3b]/10 bg-[#fffdf8] shadow-sm shadow-[#4d5f52]/5">
      <div className={`mx-auto flex min-h-[73px] ${maxWidthClassName} items-center justify-between gap-4 px-5 py-3 sm:px-8`}>
        <Link href="/" className="flex min-w-0 items-center gap-2 font-extrabold text-[#21382e]">
          <BookOpenText aria-hidden="true" size={20} className="shrink-0" />
          <span className="truncate">The Whiteboard</span>
        </Link>
        {nav?.length ? (
          <>
            <nav className="hidden items-center gap-7 text-sm font-bold text-[#385245] md:flex" aria-label="Main navigation">
              {nav.map((item) => <a key={item.href} href={item.href} className="transition hover:text-[#a45e2e]">{item.label}</a>)}
            </nav>
            <a href={nav[nav.length - 1]?.href ?? "#"} className="grid size-11 shrink-0 place-items-center rounded-xl border border-[#284a3b]/15 bg-white text-[#244a3a] md:hidden" aria-label="Jump to gatherings">
              <Menu aria-hidden="true" size={22} />
            </a>
          </>
        ) : end ? (
          end
        ) : (
          <Link href="/" className="shrink-0 text-sm font-extrabold text-[#244a3a]">{homeLabel}</Link>
        )}
      </div>
    </header>
  );
}
