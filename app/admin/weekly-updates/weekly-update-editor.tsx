"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";

type FormState = { error?: string; saved?: boolean };
type Action = (state: FormState, formData: FormData) => Promise<FormState>;
type Language = "en" | "es";
export type WeeklyUpdateChalkboardOption = {
  id: string;
  label: string;
  language: Language;
};
export type WeeklyUpdateFooterOption = { id: string; label: string; language: Language };

const LANGUAGE_LABELS: Record<Language, string> = { en: "English", es: "Español (El Salvador)" };

export function WeeklyUpdateEditor({ action, weeklyUpdateId, initialTitle = "", initialLanguage = "en", languageLocked = false, initialChalkboardAssetIds = [], initialFooterId = "", chalkboards = [], footers = [], submitLabel = "Save Weekly Update", sourceRequired = false }: { action: Action; weeklyUpdateId?: string; initialTitle?: string; initialLanguage?: Language; languageLocked?: boolean; initialChalkboardAssetIds?: string[]; initialFooterId?: string | null; chalkboards?: WeeklyUpdateChalkboardOption[]; footers?: WeeklyUpdateFooterOption[]; submitLabel?: string; sourceRequired?: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [chalkboardAssetIds, setChalkboardAssetIds] = useState(initialChalkboardAssetIds);
  const [includeFooter, setIncludeFooter] = useState(Boolean(initialFooterId));
  const [footerId, setFooterId] = useState(initialFooterId ?? "");
  const [state, formAction, pending] = useActionState(async (previousState: FormState, formData: FormData) => {
    const result = await action(previousState, formData);
    if (result.saved) router.refresh();
    return result;
  }, {});

  // An update only ever uses chalkboards and footers written in its own language.
  const availableChalkboards = chalkboards.filter((chalkboard) => chalkboard.language === language);
  const availableFooters = footers.filter((footer) => footer.language === language);

  const handleLanguageChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next: Language = event.target.value === "es" ? "es" : "en";
    setLanguage(next);
    const allowedChalkboards = new Set(chalkboards.filter((chalkboard) => chalkboard.language === next).map((chalkboard) => chalkboard.id));
    setChalkboardAssetIds((current) => current.filter((id) => allowedChalkboards.has(id)));
    if (!footers.some((footer) => footer.id === footerId && footer.language === next)) setFooterId("");
  };
  const handleChalkboardChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { value, checked } = event.target;
    setChalkboardAssetIds((current) => checked ? [...current, value] : current.filter((id) => id !== value));
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
        Weekly Update chalkboards
        <span className="mt-2 grid gap-2 rounded-xl border border-[#284a3b]/10 bg-white/70 p-3">
          {availableChalkboards.length ? availableChalkboards.map((chalkboard) => (
            <span key={chalkboard.id} className="flex items-center gap-3 font-normal text-[#385245]">
              <input type="checkbox" name="chalkboardAssetIds" value={chalkboard.id} checked={chalkboardAssetIds.includes(chalkboard.id)} onChange={handleChalkboardChange} />
              <span>{chalkboard.label}</span>
            </span>
          )) : <span className="text-sm font-normal text-[#607066]">{language === "es" ? "No Español (El Salvador) chalkboards are available. Upload one in the Chalkboard Library first." : "No current chalkboards are available."}</span>}
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
      <label className="block text-sm font-bold text-[#385245]">
        Weekly update document
        <input name="sourceDocument" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required={sourceRequired} className="admin-input py-2" />
        <span className="mt-1 block text-xs font-normal text-[#607066]">{sourceRequired ? "Upload the .docx source document. Conversion runs on the server." : "Upload a replacement .docx only when you want to reconvert the content."}</span>
      </label>
      {state.error ? <p role="alert" className="text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
      {state.saved ? <p role="status" className="text-sm font-bold text-[#326048]">Weekly update saved.</p> : null}
      <button type="submit" disabled={pending} className="admin-primary-button"><span>{pending ? "Saving..." : submitLabel}</span></button>
    </form>
  );
}
