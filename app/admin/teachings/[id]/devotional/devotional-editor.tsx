"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { DEVOTIONAL_DAY_NUMBERS, formatAnchorScriptureLengthLimit, MAX_ANCHOR_SCRIPTURE_LENGTH, normalizeScriptureLines, scripturesToTextareaValue, type DevotionalDay, type TeachingDevotional } from "@/lib/devotionals";
import type { DevotionalFormState } from "../../devotional-actions";

const anchorScriptureLimitLabel = formatAnchorScriptureLengthLimit();

type Action = (state: DevotionalFormState, formData: FormData) => Promise<DevotionalFormState>;

type DayValues = {
  title: string;
  anchorScriptures: string;
  devotionalReading: string;
  confession: string;
  journalPrompt: string;
  prayerActivation: string;
};

function dayToValues(day: DevotionalDay | undefined): DayValues {
  return {
    title: day?.title ?? "",
    anchorScriptures: scripturesToTextareaValue(day?.anchor_scriptures),
    devotionalReading: day?.devotional_reading ?? "",
    confession: day?.confession ?? "",
    journalPrompt: day?.journal_prompt ?? "",
    prayerActivation: day?.prayer_activation ?? "",
  };
}

export function DevotionalSeriesForm({ devotional, action }: { devotional: TeachingDevotional; action: Action }) {
  const [values, setValues] = useState({
    title: devotional.title,
    introduction: devotional.introduction ?? "",
  });
  const [state, formAction, isPending] = useActionState(action, {});

  return (
    <form action={formAction} className="mt-6 space-y-5">
      <label className="block text-sm font-bold text-[#385245]">
        Devotional title <span className="text-[#a2472c]">*</span>
        <input name="title" value={values.title} onChange={(event) => setValues((current) => ({ ...current, title: event.target.value }))} maxLength={180} required className="admin-input" />
      </label>
      <label className="block text-sm font-bold text-[#385245]">
        Introduction
        <textarea name="introduction" value={values.introduction} onChange={(event) => setValues((current) => ({ ...current, introduction: event.target.value }))} maxLength={8000} rows={7} className="admin-input resize-y py-3" />
      </label>
      {state.error ? <p role="alert" className="text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
      {state.saved ? <p role="status" className="text-sm font-bold text-[#326048]">Series information saved.</p> : null}
      <button type="submit" disabled={isPending} className="admin-primary-button">{isPending ? "Saving..." : "Save Series Information"}</button>
    </form>
  );
}

export function DevotionalDayForm({ dayNumber, day, action }: { dayNumber: number; day?: DevotionalDay; action: Action }) {
  const [values, setValues] = useState(dayToValues(day));
  const [state, formAction, isPending] = useActionState(action, {});
  const [clientError, setClientError] = useState<string | null>(null);

  const updateValue = (name: keyof DayValues, value: string) => {
    setValues((current) => ({ ...current, [name]: value }));
  };

  return (
    <section className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5 shadow-sm shadow-[#4d5f52]/5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xl font-extrabold text-[#243d31]">Day {dayNumber}</h3>
        <span className="rounded-full bg-[#e7efe9] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#326048]">{day ? "Saved" : "Not saved"}</span>
      </div>
      <form
        action={formAction}
        onSubmit={(event) => {
          const anchorScriptures = normalizeScriptureLines(values.anchorScriptures);
          if (anchorScriptures.some((scripture) => scripture.length > MAX_ANCHOR_SCRIPTURE_LENGTH)) {
            event.preventDefault();
            setClientError(`Each anchor Scripture must be ${anchorScriptureLimitLabel} characters or fewer.`);
            return;
          }
          setClientError(null);
        }}
        className="mt-5 space-y-5"
      >
        <label className="block text-sm font-bold text-[#385245]">
          Day title
          <input name="title" value={values.title} onChange={(event) => updateValue("title", event.target.value)} maxLength={180} className="admin-input" />
        </label>
        <label className="block text-sm font-bold text-[#385245]">
          Anchor Scriptures <span className="block text-xs font-normal text-[#607066]">Enter one Scripture passage per line. Each passage may include the reference and complete Scripture text, up to {anchorScriptureLimitLabel} characters.</span>
          <textarea name="anchorScriptures" value={values.anchorScriptures} onChange={(event) => updateValue("anchorScriptures", event.target.value)} rows={4} className="admin-input resize-y py-3" />
        </label>
        <label className="block text-sm font-bold text-[#385245]">
          Devotional Reading
          <textarea name="devotionalReading" value={values.devotionalReading} onChange={(event) => updateValue("devotionalReading", event.target.value)} maxLength={12000} rows={9} className="admin-input resize-y py-3" />
        </label>
        <label className="block text-sm font-bold text-[#385245]">
          Today&apos;s Confession
          <textarea name="confession" value={values.confession} onChange={(event) => updateValue("confession", event.target.value)} maxLength={3000} rows={4} className="admin-input resize-y py-3" />
        </label>
        <label className="block text-sm font-bold text-[#385245]">
          5-Minute Journal Prompt
          <textarea name="journalPrompt" value={values.journalPrompt} onChange={(event) => updateValue("journalPrompt", event.target.value)} maxLength={3000} rows={4} className="admin-input resize-y py-3" />
        </label>
        <label className="block text-sm font-bold text-[#385245]">
          Prayer Activation Exercise
          <textarea name="prayerActivation" value={values.prayerActivation} onChange={(event) => updateValue("prayerActivation", event.target.value)} maxLength={3000} rows={4} className="admin-input resize-y py-3" />
        </label>
        {clientError ? <p role="alert" className="text-sm font-bold text-[#a2472c]">{clientError}</p> : null}
        {state.error ? <p role="alert" className="text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
        {state.saved ? <p role="status" className="text-sm font-bold text-[#326048]">Day {dayNumber} saved.</p> : null}
        <button type="submit" disabled={isPending} className="admin-primary-button">{isPending ? "Saving..." : `Save Day ${dayNumber}`}</button>
      </form>
    </section>
  );
}

export function DevotionalDayForms({ days, actions }: { days: DevotionalDay[]; actions: Record<number, Action> }) {
  return (
    <div className="mt-6 space-y-5">
      {DEVOTIONAL_DAY_NUMBERS.map((dayNumber) => (
        <DevotionalDayForm key={dayNumber} dayNumber={dayNumber} day={days.find((day) => day.day_number === dayNumber)} action={actions[dayNumber]} />
      ))}
    </div>
  );
}

export function DevotionalPreviewLink({ href }: { href: string }) {
  return <Link href={href} className="admin-secondary-button inline-flex items-center justify-center">Preview Saved Content</Link>;
}
