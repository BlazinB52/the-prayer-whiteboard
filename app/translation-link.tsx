import Link from "next/link";
import { Languages } from "lucide-react";

// A visible link from a page to its translation. `target` is the language of the page it
// points to: "es" reads "Leer en español" (shown on English pages), "en" reads "English"
// (shown on Español pages).
export function TranslationLink({ href, target, className = "" }: { href: string; target: "en" | "es"; className?: string }) {
  return (
    <Link
      href={href}
      hrefLang={target}
      lang={target}
      className={`inline-flex items-center gap-2 text-sm font-extrabold text-[#9d5a2f] underline-offset-4 transition hover:text-[#a85e32] hover:underline ${className}`}
    >
      <Languages aria-hidden="true" size={16} />
      {target === "es" ? "Leer en español" : "English"}
    </Link>
  );
}
