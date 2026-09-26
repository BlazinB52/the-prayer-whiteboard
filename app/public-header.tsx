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
  const navItems = nav
    ? [
        ...nav.filter((item) => item.href !== "/subscribe" && item.href !== "/pdf"),
        { href: "/pdf", label: "PDF Links" },
      ]
    : [];
  const subscribeClassName = "inline-flex min-h-11 shrink-0 items-center justify-center rounded-2xl bg-[#244a3a] px-4 text-sm font-extrabold !text-white shadow-lg shadow-[#244a3a]/15 transition hover:bg-[#1d3d30] hover:!text-white focus-visible:!text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#946332] active:bg-[#193329] active:!text-white visited:!text-white";

  return (
    <header className="public-site-header sticky top-0 z-40 border-b border-[#284a3b]/10 bg-[#fffdf8] shadow-sm shadow-[#4d5f52]/5">
      <div className={`mx-auto flex min-h-[73px] ${maxWidthClassName} items-center justify-between gap-4 px-5 py-3 sm:px-8`}>
        <Link href="/" className="flex min-w-0 items-center gap-2 font-extrabold text-[#21382e]">
          <BookOpenText aria-hidden="true" size={20} className="shrink-0" />
          <span className="truncate">The Whiteboard</span>
        </Link>
        {nav?.length ? (
          <div className="flex items-center gap-3">
            <nav className="hidden items-center gap-4 text-xs font-bold text-[#385245] lg:flex" aria-label="Main navigation">
              {navItems.map((item) => <a key={item.href} href={item.href} className="transition hover:text-[#a45e2e]">{item.label}</a>)}
            </nav>
            <Link href="/subscribe" className={`${subscribeClassName} hidden lg:inline-flex`}>Subscribe</Link>
            <details className="group relative lg:hidden">
              <summary className="grid size-11 list-none place-items-center rounded-xl border border-[#284a3b]/15 bg-white text-[#244a3a] [&::-webkit-details-marker]:hidden" aria-label="Open navigation">
                <Menu aria-hidden="true" size={22} />
              </summary>
              <div className="absolute right-0 top-14 z-50 min-w-56 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-3 text-sm font-bold text-[#385245] shadow-2xl shadow-[#243126]/15">
                {navItems.map((item) => <a key={item.href} href={item.href} className="block rounded-xl px-3 py-2 transition hover:bg-[#f7f2e8] hover:text-[#a45e2e]">{item.label}</a>)}
                <Link href="/subscribe" className={`${subscribeClassName} mt-2 w-full`}>Subscribe</Link>
              </div>
            </details>
          </div>
        ) : end ? (
          <div className="flex items-center gap-3">
            <div className="hidden sm:block">{end}</div>
            <Link href="/subscribe" className={subscribeClassName}>Subscribe</Link>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Link href="/" className="hidden shrink-0 text-sm font-extrabold text-[#244a3a] sm:inline-flex">{homeLabel}</Link>
            <Link href="/subscribe" className={subscribeClassName}>Subscribe</Link>
          </div>
        )}
      </div>
    </header>
  );
}
