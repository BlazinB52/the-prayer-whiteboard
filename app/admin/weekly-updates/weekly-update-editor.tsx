"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { TeachingChoiceOptions, type TeachingChoice } from "../teaching-choice";
import { parseFileNameStamp } from "@/lib/file-names";

type FormState = { error?: string; saved?: boolean };
type Action = (state: FormState, formData: FormData) => Promise<FormState>;
type Language = "en" | "es";
export type WeeklyUpdateWhiteboardOption = {
  id: string;
  label: string;
  language: Language;
};
export type WeeklyUpdateFooterOption = { id: string; label: string; language: Language };
/** An English weekly update an Español one can be the translation of. */
export type EnglishOriginalOption = { id: string; label: string; disabled?: boolean };

const LANGUAGE_LABELS: Record<Language, string> = { en: "English", es: "Español (El Salvador)" };

export function WeeklyUpdateEditor({ action, weeklyUpdateId, initialTitle = "", initialLanguage = "en", languageLocked = false, initialWhiteboardAssetIds = [], initialFooterId = "", whiteboards = [], footers = [], teachings = [], initialTeachingId = "", initialGatheringDate = "", englishOriginals = [], submitLabel = "Save Weekly Update", sourceRequired = false, hideDocument = false }: { action: Action; weeklyUpdateId?: string; initialTitle?: string; initialLanguage?: Language; languageLocked?: boolean; initialWhiteboardAssetIds?: string[]; initialFooterId?: string | null; whiteboards?: WeeklyUpdateWhiteboardOption[]; footers?: WeeklyUpdateFooterOption[]; teachings?: TeachingChoice[]; initialTeachingId?: string | null; initialGatheringDate?: string | null; englishOriginals?: EnglishOriginalOption[]; submitLabel?: string; sourceRequired?: boolean; hideDocument?: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [whiteboardAssetIds, setWhiteboardAssetIds] = useState(initialWhiteboardAssetIds);
  const [includeFooter, setIncludeFooter] = useState(Boolean(initialFooterId));
  const [footerId, setFooterId] = useState(initialFooterId ?? "");
  const [gatheringDate, setGatheringDate] = useState(initialGatheringDate ?? "");
  const [fileHint, setFileHint] = useState("");
  const [state, formAction, pending] = useActionState(async (previousState: FormState, formData: FormData) => {
    const result = await action(previousState, formData);
    if (result.saved) router.refresh();
    return result;
  }, {});

  // An update only ever uses whiteboards and footers written in its own language.
  const availableWhiteboards = whiteboards.filter((whiteboard) => whiteboard.language === language);
  const availableFooters = footers.filter((footer) => footer.language === language);

  const handleLanguageChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next: Language = event.target.value === "es" ? "es" : "en";
    setLanguage(next);
    const allowedWhiteboards = new Set(whiteboards.filter((whiteboard) => whiteboard.language === next).map((whiteboard) => whiteboard.id));
    setWhiteboardAssetIds((current) => current.filter((id) => allowedWhiteboards.has(id)));
    if (!footers.some((footer) => footer.id === footerId && footer.language === next)) setFooterId("");
  };
  // A file named like 20261010_es_weekly_update.docx carries the gathering date and the language: fill them in, still editable.
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const name = event.target.files?.[0]?.name ?? "";
    const { date, language: code } = parseFileNameStamp(name);
    const notes: string[] = [];
    if (date && !gatheringDate) {
      setGatheringDate(date);
      notes.push(`gathering date ${date}`);
    }
    if (!languageLocked && (code === "es" || code === "en") && code !== language) {
      handleLanguageChange({ target: { value: code } } as React.ChangeEvent<HTMLSelectElement>);
      notes.push(code === "es" ? "language Español" : "language English");
    }
    setFileHint(notes.length ? `Filled in from the file name: ${notes.join(", ")}. Check them.` : "");
  };
  const handleWhiteboardChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { value, checked } = event.target;
    setWhiteboardAssetIds((current) => checked ? [...current, value] : current.filter((id) => id !== value));
  };
  const handleFooterToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    const checked = event.target.checked;
    setIncludeFooter(checked);
    if (!checked) setFooterId("");
  };

  return (
    <form action={formAction} className="space-y-4">
      {weeklyUpdateId ? <input type="hidden" name="weeklyUpdateId" value={weeklyUpdateId} /> : null}
      <label className="block text-sm font-bold text-[#385245]">Title<input name="title" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={180} className="admin-input" /></label>
      {languageLocked ? (
        <p className="text-sm font-bold text-[#385245]">
          Language: <span className="font-extrabold text-[#946332]">{LANGUAGE_LABELS[language]}</span>
          <span className="mt-1 block text-xs font-normal text-[#607066]">The language is chosen when an update is created and cannot be changed, because it decides which subscribers receive the email.</span>
        </p>
      ) : (
        <label className="block text-sm font-bold text-[#385245]">
          Language
          <select name="language" value={language} onChange={handleLanguageChange} className="admin-input">
            <option value="en">{LANGUAGE_LABELS.en}</option>
            <option value="es">{LANGUAGE_LABELS.es}</option>
          </select>
          <span className="mt-1 block text-xs font-normal text-[#607066]">An English update is emailed only to subscribers who chose English. An Español update is emailed only to subscribers who chose Español. This cannot be changed later.</span>
        </label>
      )}
      <label className="block text-sm font-bold text-[#385245]">
        Gathering date
        <input name="gatheringDate" type="date" value={gatheringDate} onChange={(event) => setGatheringDate(event.target.value)} required={!weeklyUpdateId} className="admin-input" />
        <span className="mt-1 block text-xs font-normal text-[#607066]">The gathering this letter is for. The letter is written before its teaching exists, so the date is what ties the two together.</span>
      </label>
      <label className="block text-sm font-bold text-[#385245]">
        Teaching
        <select name="teachingId" defaultValue={initialTeachingId ?? ""} className="admin-input"><TeachingChoiceOptions teachings={teachings} selectedId={initialTeachingId} /></select>
        <span className="mt-1 block text-xs font-normal text-[#607066]">The teaching this weekly update goes with. It shows in the Title Collections report.</span>
      </label>
      {!weeklyUpdateId && language === "es" ? (
        <label className="block text-sm font-bold text-[#385245]">
          English weekly update this translates
          <select name="translationOf" defaultValue="" className="admin-input">
            <option value="">Match by gathering date</option>
            {englishOriginals.map((option) => <option key={option.id} value={option.id} disabled={option.disabled}>{option.label}</option>)}
          </select>
          <span className="mt-1 block text-xs font-normal text-[#607066]">Links this Español update to its English original. Left on the first choice, it is linked to the English update of the same gathering date, if there is one.</span>
        </label>
      ) : null}
      <label className="block text-sm font-bold text-[#385245]">
        Weekly Update whiteboards
        <span className="mt-2 grid gap-2 rounded-xl border border-[#284a3b]/10 bg-white/70 p-3">
          {availableWhiteboards.length ? availableWhiteboards.map((whiteboard) => (
            <span key={whiteboard.id} className="flex items-center gap-3 font-normal text-[#385245]">
              <input type="checkbox" name="whiteboardAssetIds" value={whiteboard.id} checked={whiteboardAssetIds.includes(whiteboard.id)} onChange={handleWhiteboardChange} />
              <span>{whiteboard.label}</span>
            </span>
          )) : <span className="text-sm font-normal text-[#607066]">{language === "es" ? "No Español (El Salvador) whiteboards are available. Upload one in the Whiteboard Library first." : "No current whiteboards are available."}</span>}
        </span>
      </label>
      <fieldset className="space-y-3 rounded-xl border border-[#284a3b]/10 bg-white/70 p-4">
        <label className="flex items-center gap-3 text-sm font-bold text-[#385245]">
          <input type="checkbox" name="includeFooter" checked={includeFooter} onChange={handleFooterToggle} />
          Include footer
        </label>
        <label className="block text-sm font-bold text-[#385245]">
          Footer
          <select name="footerId" value={footerId} onChange={(event) => setFooterId(event.target.value)} disabled={!includeFooter} required={includeFooter} className="admin-input">
            <option value="">Choose a footer</option>
            {availableFooters.map((footer) => <option key={footer.id} value={footer.id}>{footer.label}</option>)}
          </select>
        </label>
      </fieldset>
      {hideDocument ? null : <label className="block text-sm font-bold text-[#385245]">
        Weekly update document
        <input name="sourceDocument" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required={sourceRequired} onChange={handleFileChange} className="admin-input py-2" />
        {fileHint ? <span className="mt-1 block text-xs font-bold text-[#326048]">{fileHint}</span> : null}
        <span className="mt-1 block text-xs font-normal text-[#607066]">{sourceRequired ? "Upload the .docx source document. Conversion runs on the server." : "Upload a replacement .docx only when you want to reconvert the content."}</span>
      </label>}
      {state.error ? <p role="alert" className="text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
      {state.saved ? <p role="status" className="text-sm font-bold text-[#326048]">Weekly update saved.</p> : null}
      <button type="submit" disabled={pending} className="admin-primary-button"><span>{pending ? "Saving..." : submitLabel}</span></button>
    </form>
  );
}
