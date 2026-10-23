"use client";

import { useState } from "react";
import { TeachingChoiceOptions, type TeachingChoice } from "../../teaching-choice";
import { publicationFileName, versionSlug } from "@/lib/file-names";
import { createHandoutVersion } from "../actions";

export type VersionBase = { id: string; label: string; title: string; date: string; teachingId: string; language: "en" | "es"; versionLabel: string };

// Another version of a handout: pick the handout it is made from, name the version, and check the title, date and teaching.
// The title, date and teaching start as the original's and can be changed.
export function VersionForm({ bases, teachings, initialFromId }: { bases: VersionBase[]; teachings: TeachingChoice[]; initialFromId: string }) {
  const first = bases.find((base) => base.id === initialFromId) ?? null;
  const [fromId, setFromId] = useState(first?.id ?? "");
  const [versionLabel, setVersionLabel] = useState("");
  const [title, setTitle] = useState(first?.title ?? "");
  const [date, setDate] = useState(first?.date ?? "");
  const [teachingId, setTeachingId] = useState(first?.teachingId ?? "");
  const base = bases.find((item) => item.id === fromId) ?? null;
  const slug = versionSlug(versionLabel);
  const fileName = base && date && slug ? publicationFileName(date, base.language, `handout_${slug}`, "docx") : null;

  function choose(id: string) {
    setFromId(id);
    const chosen = bases.find((item) => item.id === id);
    if (chosen) {
      setTitle(chosen.title);
      setDate(chosen.date);
      setTeachingId(chosen.teachingId);
    }
  }

  return (
    <form action={createHandoutVersion} className="mt-6 space-y-4 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5">
      <label className="block text-sm font-bold text-[#385245]">
        Made from
        <select name="fromId" value={fromId} onChange={(event) => choose(event.target.value)} required className="admin-input">
          <option value="">Choose the handout</option>
          {bases.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        <span className="mt-1 block text-xs font-normal text-[#607066]">The new version starts as a copy of its text and footer. Replace the draft on its page if this version reads differently.</span>
      </label>
      <label className="block text-sm font-bold text-[#385245]">
        Version name
        <input name="versionLabel" value={versionLabel} onChange={(event) => setVersionLabel(event.target.value)} required maxLength={60} className="admin-input" placeholder="For example: Honduras" />
        <span className="mt-1 block text-xs font-normal text-[#607066]">Just the audience, like &ldquo;Honduras&rdquo; or &ldquo;US&rdquo;, not the full title.</span>
      </label>
      <label className="block text-sm font-bold text-[#385245]">
        Title
        <input name="title" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={200} className="admin-input" />
        <span className="mt-1 block text-xs font-normal text-[#607066]">The name it has in the public PDF library. Change it if the versions should read differently there.</span>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-bold text-[#385245]">
          Teaching date
          <input name="gatheringDate" type="date" value={date} onChange={(event) => setDate(event.target.value)} required className="admin-input" />
        </label>
        <label className="block text-sm font-bold text-[#385245]">
          Teaching
          <select name="teachingId" value={teachingId} onChange={(event) => setTeachingId(event.target.value)} className="admin-input"><TeachingChoiceOptions teachings={teachings} selectedId={teachingId} /></select>
        </label>
      </div>
      {fileName ? <p className="text-sm text-[#385245]">The Word file will be named <strong>{fileName}</strong>.</p> : null}
      <button type="submit" className="admin-primary-button"><span>Create this version</span></button>
    </form>
  );
}
