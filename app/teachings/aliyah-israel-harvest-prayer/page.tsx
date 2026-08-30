import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  HeartHandshake,
  House,
  Sparkles,
} from "lucide-react";

const pageUrl =
  "https://theprayerwhiteboard.com/teachings/aliyah-israel-harvest-prayer";

export const metadata: Metadata = {
  title: "Aliyah: Israel, the Harvest & Prayer | The Whiteboard",
  description:
    "The complete Bible-study teaching on Aliyah, Israel, spiritual elevation, the harvest, and prayer.",
  alternates: { canonical: pageUrl },
  robots: { index: true, follow: true },
};

const sections = [
  {
    id: "meaning",
    number: "1",
    title: "The Meaning of Aliyah",
  },
  {
    id: "genesis",
    number: "2",
    title: "Aliyah in Genesis",
  },
  {
    id: "elevation",
    number: "3",
    title: "Spiritual Elevation",
  },
  {
    id: "jesus",
    number: "4",
    title: "Aliyah to Jesus",
  },
];

function SectionNumber({ children }: { children: React.ReactNode }) {
  return (
    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#f1c66f] text-base font-black text-[#244a3a]">
      {children}
    </span>
  );
}

export default function AliyahTeachingPage() {
  return (
    <main className="min-h-screen bg-[#f7f2e8] text-[#243126]">
      <header className="sticky top-0 z-20 border-b border-[#284a3b]/10 bg-[#fffdf8]/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link
            href="/"
            className="flex items-center gap-3 font-extrabold text-[#21382e]"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-[#244a3a] text-[#f4dfaa]">
              <BookOpenText aria-hidden="true" size={21} />
            </span>
            <span>
              <span className="block leading-tight">The Whiteboard</span>
              <span className="block text-[9px] uppercase tracking-[0.18em] text-[#9a6c32]">
                Prayer &amp; Bible Study
              </span>
            </span>
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#284a3b]/15 bg-white px-4 text-sm font-extrabold text-[#244a3a]"
          >
            <ArrowLeft aria-hidden="true" size={17} />
            <span className="hidden sm:inline">Back to home</span>
            <span className="sm:hidden">Back</span>
          </Link>
        </div>
      </header>

      <section className="relative overflow-hidden bg-[#244a3a] px-5 py-14 text-white sm:px-8 sm:py-20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(241,198,111,0.18),transparent_30%)]" />
        <div className="relative mx-auto max-w-4xl">
          <p className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.2em] text-[#f0cb83]">
            <Sparkles aria-hidden="true" size={15} />
            Full teaching · August 30, 2026
          </p>
          <h1 className="mt-5 max-w-3xl text-4xl font-extrabold leading-tight tracking-[-0.035em] sm:text-6xl">
            Aliyah: Israel, the Harvest &amp; Prayer
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[#dce8e1]">
            God is gathering His people, revealing Jesus, and calling the Church
            to pray. This teaching follows the biblical picture of returning,
            ascending, and drawing nearer to God.
          </p>

          <nav
            aria-label="Teaching sections"
            className="mt-9 grid gap-3 sm:grid-cols-2"
          >
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 transition hover:bg-white/[0.12]"
              >
                <span className="grid size-7 place-items-center rounded-full bg-[#f1c66f] text-xs font-black text-[#244a3a]">
                  {section.number}
                </span>
                <span className="font-bold">{section.title}</span>
              </a>
            ))}
          </nav>
        </div>
      </section>

      <article className="mx-auto max-w-4xl space-y-7 px-5 py-10 sm:px-8 sm:py-16">
        <section
          id="meaning"
          className="scroll-mt-24 rounded-[2rem] border border-[#284a3b]/10 bg-[#fffdf8] p-6 shadow-lg shadow-[#4d5f52]/5 sm:p-9"
        >
          <div className="flex items-center gap-4">
            <SectionNumber>1</SectionNumber>
            <h2 className="text-3xl font-extrabold tracking-tight text-[#243d31]">
              The Meaning of Aliyah
            </h2>
          </div>
          <div className="mt-7 space-y-5 leading-7 text-[#52645a]">
            <p>
              <strong className="text-[#243d31]">Aliyah</strong> means “to go
              up” or “to ascend.” The Hebrew word is commonly transliterated
              A-L-I-Y-A-H.
            </p>
            <p>It may refer to:</p>
            <ul className="list-disc space-y-2 pl-6 marker:text-[#b77937]">
              <li>Jewish people immigrating or returning to Israel.</li>
              <li>Going up to read the Torah in a synagogue.</li>
              <li>Spiritual elevation or drawing nearer to God.</li>
            </ul>
            <div className="rounded-2xl border-l-4 border-[#d5a54d] bg-[#f7edda] p-5 font-bold text-[#43584c]">
              God’s call to the Jewish people is: “Come home. Come back to
              Israel.”
            </div>
          </div>
        </section>

        <section
          id="genesis"
          className="scroll-mt-24 rounded-[2rem] border border-[#284a3b]/10 bg-[#fffdf8] p-6 shadow-lg shadow-[#4d5f52]/5 sm:p-9"
        >
          <div className="flex items-center gap-4">
            <SectionNumber>2</SectionNumber>
            <h2 className="text-3xl font-extrabold tracking-tight text-[#243d31]">
              Aliyah in Genesis
            </h2>
          </div>
          <div className="mt-7 space-y-5 leading-7 text-[#52645a]">
            <p>
              The idea of “going up” appears in the account of Jacob’s burial.
              Joseph and his family went up from Egypt to return Jacob’s body
              for burial in the Promised Land.
            </p>
            <p className="text-sm font-extrabold uppercase tracking-[0.12em] text-[#9a642e]">
              Genesis 50:5–7, 13
            </p>
            <p>This connects Aliyah with:</p>
            <ul className="list-disc space-y-2 pl-6 marker:text-[#b77937]">
              <li>Returning to the land of the fathers.</li>
              <li>Honoring covenant promises.</li>
              <li>Recognizing the spiritual importance of the land.</li>
              <li>Moving toward the place God had appointed.</li>
            </ul>
            <p>
              Jacob’s burial in the land of promise was not incidental; it
              reflected faith in God’s covenant and His purposes for the land.
            </p>
          </div>
        </section>

        <section
          id="elevation"
          className="scroll-mt-24 rounded-[2rem] border border-[#284a3b]/10 bg-[#fffdf8] p-6 shadow-lg shadow-[#4d5f52]/5 sm:p-9"
        >
          <div className="flex items-center gap-4">
            <SectionNumber>3</SectionNumber>
            <h2 className="text-3xl font-extrabold tracking-tight text-[#243d31]">
              Spiritual Elevation
            </h2>
          </div>
          <div className="mt-7 space-y-5 leading-7 text-[#52645a]">
            <p>
              Jewish teaching speaks of Israel as being “higher” than other
              lands—not necessarily topographically, but spiritually.
            </p>
            <ul className="list-disc space-y-2 pl-6 marker:text-[#b77937]">
              <li>
                Israel is uniquely connected to God’s covenant purposes.
              </li>
              <li>Going to Israel is described as “going up.”</li>
              <li>Going up to read the Torah is a spiritual honor.</li>
              <li>Prayer is an ascent into God’s presence.</li>
              <li>
                Reading and meditating on God’s Word renews and elevates our
                thinking.
              </li>
            </ul>
            <div className="rounded-2xl bg-[#e8efe9] p-5">
              <h3 className="font-extrabold text-[#244a3a]">
                Application for believers
              </h3>
              <ul className="mt-3 list-disc space-y-2 pl-6 marker:text-[#3f7459]">
                <li>We draw near to God in prayer.</li>
                <li>Our prayers rise before Him.</li>
                <li>We enter His courts with praise.</li>
                <li>His Word renews and lifts our thinking.</li>
                <li>God calls us into greater spiritual maturity.</li>
              </ul>
            </div>
          </div>
        </section>

        <section
          id="jesus"
          className="scroll-mt-24 rounded-[2rem] border border-[#284a3b]/10 bg-[#fffdf8] p-6 shadow-lg shadow-[#4d5f52]/5 sm:p-9"
        >
          <div className="flex items-center gap-4">
            <SectionNumber>4</SectionNumber>
            <h2 className="text-3xl font-extrabold tracking-tight text-[#243d31]">
              Aliyah to Jesus
            </h2>
          </div>
          <div className="mt-7 space-y-5 leading-7 text-[#52645a]">
            <p>
              Jewish people are being called not only to physical Israel, but
              also to spiritual awakening and salvation in Messiah.
            </p>
            <div className="rounded-2xl border-l-4 border-[#d5a54d] bg-[#f7edda] p-5">
              <p className="text-sm font-extrabold uppercase tracking-[0.12em] text-[#9a642e]">
                Our prayer
              </p>
              <p className="mt-2 text-2xl font-extrabold text-[#354c3f]">
                “Call them up to Jesus.”
              </p>
            </div>
            <p>This spiritual Aliyah includes:</p>
            <ul className="list-disc space-y-2 pl-6 marker:text-[#b77937]">
              <li>Being drawn to Messiah.</li>
              <li>Eyes opening to Jesus.</li>
              <li>Recognizing the One who was pierced.</li>
              <li>Receiving salvation.</li>
              <li>Becoming witnesses who share the good news.</li>
            </ul>
          </div>
        </section>

        <section className="rounded-[2rem] bg-[#244a3a] p-6 text-white shadow-xl sm:p-9">
          <div className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#f1c66f] text-[#244a3a]">
              <HeartHandshake aria-hidden="true" size={25} />
            </span>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#f0cb83]">
                Prayer focus
              </p>
              <h2 className="mt-2 text-3xl font-extrabold">
                Pray for Israel and the harvest
              </h2>
            </div>
          </div>
          <ul className="mt-7 list-disc space-y-3 pl-6 leading-7 text-[#dce8e1] marker:text-[#f1c66f]">
            <li>For Jewish people to return to Israel as God leads them.</li>
            <li>For eyes and hearts to be opened to Jesus the Messiah.</li>
            <li>For families, communities, and nations to receive salvation.</li>
            <li>For believers to pray faithfully and speak God’s Word in love.</li>
            <li>For laborers to be sent into the harvest.</li>
          </ul>
        </section>

        <div className="flex flex-col gap-3 pt-2 sm:flex-row">
          <Link
            href="/"
            className="inline-flex min-h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-[#244a3a] px-6 font-extrabold text-white"
          >
            <House aria-hidden="true" size={18} />
            Return to The Whiteboard
          </Link>
          <Link
            href="/#prayer"
            className="inline-flex min-h-14 flex-1 items-center justify-center gap-2 rounded-2xl border border-[#284a3b]/15 bg-white px-6 font-extrabold text-[#244a3a]"
          >
            Continue to prayer needs
            <ArrowRight aria-hidden="true" size={18} />
          </Link>
        </div>
      </article>
    </main>
  );
}
