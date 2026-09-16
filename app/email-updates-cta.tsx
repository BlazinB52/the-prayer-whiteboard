import Link from "next/link";
import { ArrowRight, Mail } from "lucide-react";

export function EmailUpdatesCta({ copy }: { copy: string }) {
  return (
    <section className="email-updates-cta px-5 py-10 sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5 shadow-lg shadow-[#4d5f52]/8 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#e8efe9] text-[#244a3a]"><Mail aria-hidden="true" size={22} /></span>
          <p className="max-w-2xl text-sm font-bold leading-6 text-[#52645a]">{copy}</p>
        </div>
        <Link href="/subscribe" className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#244a3a] px-5 font-extrabold !text-white shadow-xl shadow-[#244a3a]/20 transition hover:-translate-y-0.5 hover:bg-[#1d3d30] hover:!text-white focus-visible:!text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#244a3a] active:bg-[#193428] active:!text-white visited:!text-white [&_*]:!text-white">
          Subscribe <ArrowRight aria-hidden="true" size={17} />
        </Link>
      </div>
    </section>
  );
}
