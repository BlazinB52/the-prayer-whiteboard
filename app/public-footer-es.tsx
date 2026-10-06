import Link from "next/link";
import { BookOpenText } from "lucide-react";

const contactEmail = "theprayerwhiteboard@gmail.com";
const linkClassName = "inline-flex min-h-10 items-center underline-offset-4 transition hover:text-[#f0cb83] hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f1c66f]";

// The footer for every Español page. It has no Subscribe button because there is no Español
// subscription yet, and every link stays inside the Español pages.
export function PublicFooterEs() {
  return (
    <footer lang="es" className="public-site-footer bg-[#1d352b] px-5 py-9 text-center text-[#d8e5dd] sm:px-8">
      <BookOpenText aria-hidden="true" className="mx-auto text-[#efc775]" size={28} />
      <p className="mt-4 text-lg font-extrabold text-white">The Prayer Whiteboard</p>
      <p className="mt-2 text-sm">Oración &middot; La Palabra &middot; Creciendo juntos</p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm text-[#d8e5dd]">
        <Link href="/espanol" className={linkClassName}>Inicio</Link>
        <Link href="/espanol/privacidad" className={linkClassName}>Privacidad</Link>
        <Link href="/espanol/derechos-de-autor" className={linkClassName}>Derechos de autor</Link>
        <a href={`mailto:${contactEmail}`} className={linkClassName}>Contacto</a>
        <Link href="/" className={linkClassName}>English</Link>
      </div>
    </footer>
  );
}
