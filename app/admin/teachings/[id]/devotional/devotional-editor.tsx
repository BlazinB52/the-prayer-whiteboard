"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { FormattedTextarea } from "@/app/admin/formatted-textarea";
import { COMMUNION_DAY_NUMBER, DEVOTIONAL_DAY_NUMBERS, formatAnchorScriptureLengthLimit, MAX_ANCHOR_SCRIPTURE_LENGTH, normalizeScriptureLines, scripturesToTextareaValue, usesLegacyDayLayout, type DevotionalDay, type TeachingDevotional } from "@/lib/devotionals";
import { ui } from "@/lib/i18n";
import type { DevotionalFormState, DevotionalImportState } from "../../devotional-actions";

const anchorScriptureLimitLabel = formatAnchorScriptureLengthLimit();

type Action = (state: DevotionalFormState, formData: FormData) => Promise<DevotionalFormState>;
type ImportAction = (state: DevotionalImportState, formData: FormData) => Promise<DevotionalImportState>;

type DayValues = {
  title: string;
  anchorScriptures: string;
  devotionalReading: string;
  confession: string;
  journalPrompt: string;
  prayerActivation: string;
  breadReflection: string;
  cupReflection: string;
  selfExamination: string;
  seriesClosingPrayer: string;
};

function dayToValues(day: DevotionalDay | undefined): DayValues {
  return {
    title: day?.title ?? "",
    anchorScriptures: scripturesToTextareaValue(day?.anchor_scriptures),
    devotionalReading: day?.devotional_reading ?? "",
    confession: day?.confession ?? "",
    journalPrompt: day?.journal_prompt ?? "",
    prayerActivation: day?.prayer_activation ?? "",
    breadReflection: day?.bread_reflection ?? "",
    cupReflection: day?.cup_reflection ?? "",
    selfExamination: day?.self_examination ?? "",
    seriesClosingPrayer: day?.series_closing_prayer ?? "",
  };
}

export function DevotionalSeriesForm({ devotional, action }: { devotional: TeachingDevotional; action: Action }) {
  const [values, setValues] = useState({
    title: devotional.title,
    introduction: devotional.introduction ?? "",
    language: devotional.language === "es" ? "es" : "en",
  });
  const [state, formAction, isPending] = useActionState(action, {});

  return (
    <form action={formAction} className="mt-6 space-y-5">
      <label className="block text-sm font-bold text-[#385245]">
        Language
        <select name="language" value={values.language} onChange={(event) => setValues((current) => ({ ...current, language: event.target.value === "es" ? "es" : "en" }))} className="admin-input">
          <option value="en">English</option>
          <option value="es">Español</option>
        </select>
        <span className="mt-1 block text-xs font-normal leading-5 text-[#607066]">Español devotionals appear on the Español homepage and are not emailed to subscribers automatically.</span>
      </label>
      <label className="block text-sm font-bold text-[#385245]">
        Devotional title <span className="text-[#a2472c]">*</span>
        <input name="title" value={values.title} onChange={(event) => setValues((current) => ({ ...current, title: event.target.value }))} maxLength={180} required className="admin-input" />
      </label>
      <FormattedTextarea label="Introduction" name="introduction" value={values.introduction} onValueChange={(value) => setValues((current) => ({ ...current, introduction: value }))} maxLength={8000} rows={7} />
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
  // Day 7 is the Communion and rest day. Its labels come from the same list the public page uses.
  const isCommunionDay = dayNumber === COMMUNION_DAY_NUMBER;
  const labels = ui("en");
  const hasLegacyText = Boolean(day && usesLegacyDayLayout(day));

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
        <FormattedTextarea
          label="Anchor Scriptures"
          help={`Enter one Scripture passage per line. Each passage may include the reference and complete Scripture text, up to ${anchorScriptureLimitLabel} characters.`}
          name="anchorScriptures"
          value={values.anchorScriptures}
          onValueChange={(value) => updateValue("anchorScriptures", value)}
          rows={4}
          bullets={false}
        />
        {isCommunionDay ? (
          <>
            <FormattedTextarea label={labels.restReflection} help="One or two paragraphs on how the week's lesson ends in ceasing from human work and resting in the finished work of Jesus." name="devotionalReading" value={values.devotionalReading} onValueChange={(value) => updateValue("devotionalReading", value)} maxLength={12000} rows={9} />
            <FormattedTextarea label={labels.confessionOfRest} name="confession" value={values.confession} onValueChange={(value) => updateValue("confession", value)} maxLength={3000} rows={4} />
            <div className="rounded-xl border border-[#284a3b]/10 bg-[#f7f2e8] px-4 py-3">
              <p className="text-sm font-bold text-[#385245]">{labels.tableOfRemembrance}</p>
              <p className="mt-1 text-sm leading-6 text-[#52645a]">{labels.tableOfRemembranceIntro}</p>
              <p className="mt-1 text-xs leading-5 text-[#607066]">This sentence is added automatically on every Day 7. You do not type it.</p>
            </div>
            <FormattedTextarea label={labels.selfExamination} help="Before partaking: a paragraph on 1 Corinthians 11:27–29, framed as a response to grace rather than earning worthiness, and a short blessing." name="selfExamination" value={values.selfExamination} onValueChange={(value) => updateValue("selfExamination", value)} maxLength={6000} rows={7} />
            <FormattedTextarea label={labels.breadReflection} help="Link the week's theme to the broken body of Christ. End with the bread's partaking declaration." name="breadReflection" value={values.breadReflection} onValueChange={(value) => updateValue("breadReflection", value)} maxLength={6000} rows={7} />
            <FormattedTextarea label={labels.cupReflection} help="Link the week's theme to the shed blood of the New Covenant. End with the cup's partaking declaration." name="cupReflection" value={values.cupReflection} onValueChange={(value) => updateValue("cupReflection", value)} maxLength={6000} rows={7} />
            <FormattedTextarea label={labels.seriesClosingPrayer} help="The prayer that closes the whole 7-day series. It is shown last on Day 7." name="seriesClosingPrayer" value={values.seriesClosingPrayer} onValueChange={(value) => updateValue("seriesClosingPrayer", value)} maxLength={3000} rows={5} />
            {hasLegacyText ? (
              <div className="rounded-xl border border-[#a2472c]/25 bg-[#fff3ed] px-4 py-3 text-sm leading-6 text-[#7a3a24]">
                <p className="font-bold">This Day 7 is still in the old format, so it keeps showing and mailing that way until you save the Communion text above.</p>
                <p className="mt-1">Saving any of the Communion text above removes the old journal prompt and prayer activation shown below. Copy anything you want to keep first.</p>
                {day?.journal_prompt?.trim() ? <p className="mt-3"><span className="font-bold">5-Minute Journal Prompt:</span> {day.journal_prompt}</p> : null}
                {day?.prayer_activation?.trim() ? <p className="mt-2"><span className="font-bold">Prayer Activation Exercise:</span> {day.prayer_activation}</p> : null}
              </div>
            ) : null}
          </>
        ) : (
          <>
            <FormattedTextarea label="Devotional Reading" name="devotionalReading" value={values.devotionalReading} onValueChange={(value) => updateValue("devotionalReading", value)} maxLength={12000} rows={9} />
            <FormattedTextarea label="Today's Confession" name="confession" value={values.confession} onValueChange={(value) => updateValue("confession", value)} maxLength={3000} rows={4} />
            <FormattedTextarea label="5-Minute Journal Prompt" name="journalPrompt" value={values.journalPrompt} onValueChange={(value) => updateValue("journalPrompt", value)} maxLength={3000} rows={4} />
            <FormattedTextarea label="Prayer Activation Exercise" name="prayerActivation" value={values.prayerActivation} onValueChange={(value) => updateValue("prayerActivation", value)} maxLength={3000} rows={4} />
          </>
        )}
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

export function DevotionalImportForm({ action, hasPublishedDevotional }: { action: ImportAction; hasPublishedDevotional: boolean }) {
  const [state, formAction, isPending] = useActionState(action, {});

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (hasPublishedDevotional) return;
        if (!window.confirm("Import this text file and replace the current draft devotional content?")) {
          event.preventDefault();
        }
      }}
      className="mt-5 space-y-4"
    >
      <label className="block text-sm font-bold text-[#385245]">
        Devotional text file
        <span className="mt-1 block text-xs font-normal leading-5 text-[#607066]">Use a plain .txt file with a title, an introduction, and Day 1 through Day 7. Days 1–6 have Anchor Scriptures, Devotional Reading, Today&apos;s Confession, 5-Minute Journal Prompt, and Prayer Activation Exercise. Day 7 (headed DAY 7 — COMMUNION AND REST) has Anchor Scriptures, The Rest Reflection, Today&apos;s Confession of Rest, Reverent Self-Examination &amp; Blessing, The Bread Reflection, The Cup Reflection, and Series Closing Prayer.</span>
        <input name="devotionalFile" type="file" accept=".txt,text/plain" required disabled={hasPublishedDevotional || isPending} className="admin-input py-2" />
      </label>
      {hasPublishedDevotional ? <p role="alert" className="text-sm font-bold text-[#a2472c]">Unpublish this devotional before importing replacement text.</p> : null}
      {state.error ? <p role="alert" className="text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
      <button type="submit" disabled={hasPublishedDevotional || isPending} className="admin-secondary-button">{isPending ? "Importing..." : "Import Text File"}</button>
    </form>
  );
}
