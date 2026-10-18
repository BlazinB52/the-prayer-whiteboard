import type { ReactNode } from "react";
import { DevotionalTextBlock } from "@/app/devotional-text-block";
import { ScriptureList } from "@/app/scripture-block";
import { devotionalDaySections, type DevotionalDay } from "@/lib/devotionals";
import { formatLongDate, toLanguage, ui } from "@/lib/i18n";

// A whole devotional laid out for paper: the title and introduction, then the seven days. Every day after the first
// starts on a new sheet (see .print-day in globals.css). Day 7 comes out in the Communion layout because the sections
// come from the same list the website and the email use.
export function PrintableDevotional({
  devotional,
  days,
}: {
  devotional: { title: string; introduction: string | null; language?: string | null; gathering_date?: string | null };
  days: DevotionalDay[];
}) {
  const language = toLanguage(devotional.language);
  const t = ui(language);
  const ordered = [...days].sort((a, b) => a.day_number - b.day_number);

  return (
    <article className="print-paper mx-auto max-w-3xl rounded-2xl bg-white p-7 shadow-xl shadow-[#4d5f52]/10 sm:p-12">
      <header className="border-b border-[#284a3b]/15 pb-8">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">The Prayer Whiteboard</p>
        <p className="mt-1 text-xs font-extrabold uppercase tracking-[0.18em] text-[#607066]">{t.sevenDayDevotional}</p>
        <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight text-[#243d31]">{devotional.title}</h1>
        {devotional.gathering_date ? <p className="mt-4 text-sm font-bold text-[#607066]">{formatLongDate(devotional.gathering_date, language)}</p> : null}
        {devotional.introduction?.trim() ? <DevotionalTextBlock text={devotional.introduction} className="mt-5 text-[#52645a]" /> : null}
      </header>

      {ordered.length ? (
        <div className="mt-8 space-y-10">
          {ordered.map((day) => (
            <section key={day.day_number} className="print-day">
              <header className="print-day-header">
                <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">{t.dayOfSeven(day.day_number)}</p>
                <h2 className="mt-2 text-2xl font-extrabold leading-tight text-[#243d31]">{day.title}</h2>
              </header>
              <div className="mt-5 space-y-6">
                {devotionalDaySections(day, t).map((section) => {
                  if (section.isScriptures) {
                    return day.anchor_scriptures?.length ? <Field key={section.key} title={section.label}><ScriptureList entries={day.anchor_scriptures} /></Field> : null;
                  }
                  return section.text?.trim() ? <Field key={section.key} title={section.label}><DevotionalTextBlock text={section.text} /></Field> : null;
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <p className="mt-8 text-sm text-[#607066]">No days are saved yet.</p>
      )}
    </article>
  );
}

function Field({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="print-field">
      <h3 className="print-field-heading text-lg font-extrabold text-[#385245]">{title}</h3>
      <div className="mt-2 text-base leading-7 text-[#52645a]">{children}</div>
    </section>
  );
}
