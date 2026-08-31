"use client";

import { useActionState, useState } from "react";
import type { ContentActionState, SectionFormat } from "./content-actions";

type Action = (state: ContentActionState, formData: FormData) => Promise<ContentActionState>;
type Category = {
  id: string;
  title: string;
  sort_order: number;
  sections: Section[];
};
type Section = {
  id: string;
  title: string;
  sort_order: number;
  content: unknown;
};

type SectionValues = {
  title: string;
  format: SectionFormat;
  mainText: string;
  introduction: string;
  reference: string;
  translation: string;
  quotation: string;
};

export function ContentWorkspace({
  categories,
  createCategoryAction,
  renameCategoryAction,
  createSectionActions,
  updateSectionActions,
  moveCategoryActions,
  deleteCategoryActions,
  moveSectionActions,
  deleteSectionActions,
}: {
  categories: Category[];
  createCategoryAction: Action;
  renameCategoryAction: Record<string, Action>;
  createSectionActions: Record<string, Action>;
  updateSectionActions: Record<string, Action>;
  moveCategoryActions: Record<string, { up: () => Promise<ContentActionState>; down: () => Promise<ContentActionState> }>;
  deleteCategoryActions: Record<string, () => Promise<ContentActionState>>;
  moveSectionActions: Record<string, { up: () => Promise<ContentActionState>; down: () => Promise<ContentActionState> }>;
  deleteSectionActions: Record<string, () => Promise<ContentActionState>>;
}) {
  return (
    <section className="mt-12 border-t border-[#284a3b]/10 pt-10">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Draft structure</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[#243d31]">Teaching Content</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#607066]">Organize the teaching into ordered categories and sections. Content remains private while this teaching is a draft.</p>
        </div>
      </div>

      <div className="mt-8 space-y-6">
        {categories.map((category, index) => (
          <CategoryPanel
            key={category.id}
            category={category}
            isFirst={index === 0}
            isLast={index === categories.length - 1}
            renameAction={renameCategoryAction[category.id]}
            createSectionAction={createSectionActions[category.id]}
            moveActions={moveCategoryActions[category.id]}
            deleteAction={deleteCategoryActions[category.id]}
            moveSectionActions={moveSectionActions}
            deleteSectionActions={deleteSectionActions}
            updateSectionActions={updateSectionActions}
          />
        ))}
        {!categories.length ? <p className="rounded-2xl border border-dashed border-[#284a3b]/20 bg-[#fffdf8] px-5 py-6 text-sm text-[#607066]">No categories yet. Add the first category below.</p> : null}
        <CategoryAddForm action={createCategoryAction} />
      </div>
    </section>
  );
}

function CategoryPanel({ category, isFirst, isLast, renameAction, createSectionAction, moveActions, deleteAction, moveSectionActions, deleteSectionActions, updateSectionActions }: { category: Category; isFirst: boolean; isLast: boolean; renameAction: Action; createSectionAction: Action; moveActions: { up: () => Promise<ContentActionState>; down: () => Promise<ContentActionState> }; deleteAction: () => Promise<ContentActionState>; moveSectionActions: Record<string, { up: () => Promise<ContentActionState>; down: () => Promise<ContentActionState> }>; deleteSectionActions: Record<string, () => Promise<ContentActionState>>; updateSectionActions: Record<string, Action> }) {
  return (
    <article className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5 shadow-lg shadow-[#4d5f52]/8 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#946332]">Category {category.sort_order}</p>
          <h3 className="mt-1 text-2xl font-extrabold text-[#243d31]">{category.title}</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <OperationForm action={moveActions.up} label="Move up" disabled={isFirst} />
          <OperationForm action={moveActions.down} label="Move down" disabled={isLast} />
          <OperationForm action={deleteAction} label="Delete" confirmMessage="Delete this empty category?" danger />
        </div>
      </div>
      <CategoryRenameForm action={renameAction} title={category.title} />
      <div className="mt-6 border-t border-[#284a3b]/10 pt-6">
        <h4 className="text-lg font-extrabold text-[#243d31]">Sections</h4>
        <div className="mt-4 space-y-4">
          {category.sections.map((section, index) => (
            <SectionPanel key={section.id} section={section} isFirst={index === 0} isLast={index === category.sections.length - 1} action={updateSectionActions[section.id]} moveActions={moveSectionActions[section.id]} deleteAction={deleteSectionActions[section.id]} />
          ))}
          {!category.sections.length ? <p className="text-sm text-[#607066]">No sections in this category yet.</p> : null}
        </div>
        <SectionAddForm action={createSectionAction} />
      </div>
    </article>
  );
}

function CategoryAddForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, {});
  return <form action={formAction} className="flex flex-col gap-3 rounded-2xl border border-[#284a3b]/10 bg-[#eee7da] p-5 sm:flex-row sm:items-end"><label className="flex-1 text-sm font-bold text-[#385245]">New category<input name="title" required maxLength={160} className="admin-input" /></label><button type="submit" disabled={pending} className="admin-primary-button"><span>{pending ? "Adding..." : "Add category"}</span></button>{state.saved ? <p className="text-sm font-bold text-[#326048]">Category added.</p> : null}{state.error ? <p className="text-sm font-bold text-[#a2472c]">{state.error}</p> : null}</form>;
}

function CategoryRenameForm({ action, title }: { action: Action; title: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  return <form action={formAction} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"><label className="flex-1 text-xs font-bold uppercase tracking-[0.12em] text-[#607066]">Rename category<input name="title" defaultValue={title} required maxLength={160} className="admin-input normal-case tracking-normal" /></label><button type="submit" disabled={pending} className="admin-secondary-button"><span>{pending ? "Saving..." : "Rename"}</span></button>{state.saved ? <p className="text-sm font-bold text-[#326048]">Category saved.</p> : null}{state.error ? <p className="text-sm font-bold text-[#a2472c]">{state.error}</p> : null}</form>;
}

function SectionAddForm({ action }: { action: Action }) {
  return <div className="mt-6"><h5 className="text-sm font-extrabold uppercase tracking-[0.12em] text-[#946332]">Add section</h5><SectionForm action={action} values={{ title: "", format: "paragraph", mainText: "", introduction: "", reference: "", translation: "", quotation: "" }} submitLabel="Add section" /></div>;
}

function SectionPanel({ section, isFirst, isLast, action, moveActions, deleteAction }: { section: Section; isFirst: boolean; isLast: boolean; action: Action; moveActions: { up: () => Promise<ContentActionState>; down: () => Promise<ContentActionState> }; deleteAction: () => Promise<ContentActionState> }) {
  const values = sectionValues(section.content, section.title);
  return <div className="rounded-xl border border-[#284a3b]/10 bg-white p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#607066]">Section {section.sort_order} · {values.format}</p><h6 className="mt-1 text-lg font-extrabold text-[#243d31]">{section.title}</h6></div><div className="flex flex-wrap gap-2"><OperationForm action={moveActions.up} label="Up" disabled={isFirst} /><OperationForm action={moveActions.down} label="Down" disabled={isLast} /><OperationForm action={deleteAction} label="Delete" confirmMessage="Delete this section?" danger /></div></div><div className="mt-4 border-l-2 border-[#f1c66f] pl-4 text-sm leading-6 text-[#52645a]"><SectionPreview content={section.content} /></div><details className="mt-5"><summary className="cursor-pointer text-sm font-extrabold text-[#9d5a2f]">Edit section</summary><SectionForm action={action} values={values} submitLabel="Save section" /></details></div>;
}

function OperationForm({ action, label, disabled = false, confirmMessage, danger = false }: { action: () => Promise<ContentActionState>; label: string; disabled?: boolean; confirmMessage?: string; danger?: boolean }) {
  const [state, runAction, pending] = useActionState(async () => action(), {});
  return <form action={runAction} onSubmit={(event) => { if (confirmMessage && !window.confirm(confirmMessage)) event.preventDefault(); }}><button type="submit" disabled={disabled || pending} className={danger ? "admin-danger-button" : "admin-secondary-button"}><span>{pending ? "Saving..." : label}</span></button>{state.saved ? <p className="mt-2 text-xs font-bold text-[#326048]">Saved.</p> : null}{state.error ? <p className="mt-2 text-xs font-bold text-[#a2472c]">{state.error}</p> : null}</form>;
}

function SectionForm({ action, values, submitLabel }: { action: Action; values: SectionValues; submitLabel: string }) {
  const [selectedFormat, setSelectedFormat] = useState<SectionFormat>(values.format);
  const [state, formAction, pending] = useActionState(action, {});
  return <form action={formAction} className="mt-4 space-y-4"><input type="hidden" name="format" value={selectedFormat} /><label className="block text-sm font-bold text-[#385245]">Section title<input name="title" defaultValue={values.title} required maxLength={160} className="admin-input" /></label><label className="block text-sm font-bold text-[#385245]">Format<select value={selectedFormat} onChange={(event) => setSelectedFormat(event.target.value as SectionFormat)} className="admin-input"><option value="paragraph">Paragraph</option><option value="bullets">Bullet list</option><option value="scripture">Scripture</option><option value="takeaway">Takeaway or confession</option></select></label>{selectedFormat === "scripture" ? <><label className="block text-sm font-bold text-[#385245]">Introductory note<span className="mt-1 block text-xs font-normal text-[#607066]">A brief statement that appears before the Scripture.</span><textarea name="introduction" defaultValue={values.introduction} rows={3} maxLength={12000} className="admin-input resize-y py-3" /></label><label className="block text-sm font-bold text-[#385245]">Scripture reference<input name="reference" defaultValue={values.reference} maxLength={240} className="admin-input" /></label><label className="block text-sm font-bold text-[#385245]">Translation<span className="mt-1 block text-xs font-normal text-[#607066]">Optionalâ€”for example, NKJV, ESV, or AMPC.</span><input name="translation" defaultValue={values.translation} maxLength={80} className="admin-input" /></label><label className="block text-sm font-bold text-[#385245]">Scripture quotation<span className="mt-1 block text-xs font-normal text-[#607066]">Enter the Scripture text. Each Enter begins a new displayed paragraph; line and paragraph formatting will be preserved.</span><textarea name="quotation" defaultValue={values.quotation} rows={6} maxLength={12000} className="admin-input resize-y py-3" /></label></> : <label className="block text-sm font-bold text-[#385245]">Main text{selectedFormat === "bullets" ? <span className="mt-1 block text-xs font-normal text-[#607066]">Enter one item per line. Bullet symbols are added automatically.</span> : null}<textarea name="mainText" defaultValue={values.mainText} rows={5} maxLength={12000} className="admin-input resize-y py-3" /></label>}{state.error ? <p className="text-sm font-bold text-[#a2472c]">{state.error}</p> : null}{state.saved ? <p className="text-sm font-bold text-[#326048]">Section saved.</p> : null}<button type="submit" disabled={pending} className="admin-primary-button"><span>{pending ? "Saving..." : submitLabel}</span></button></form>;
}

function sectionValues(content: unknown, title: string): SectionValues {
  const value = content && typeof content === "object" ? content as Record<string, unknown> : {};
  const format = ["paragraph", "bullets", "scripture", "takeaway"].includes(String(value.format)) ? String(value.format) as SectionFormat : "paragraph";
  return { title, format, mainText: format === "bullets" && Array.isArray(value.bullets) ? value.bullets.join("\n") : typeof value.text === "string" ? value.text : "", introduction: typeof value.introduction === "string" ? value.introduction : "", reference: typeof value.reference === "string" ? value.reference : "", translation: typeof value.translation === "string" ? value.translation : "", quotation: typeof value.quotation === "string" ? value.quotation : "" };
}

function SectionPreview({ content }: { content: unknown }) {
  const value = content && typeof content === "object" ? content as Record<string, unknown> : {};
  if (value.format === "bullets" && Array.isArray(value.bullets)) return <ul className="list-disc space-y-1 pl-5">{value.bullets.map((bullet) => <li key={String(bullet)}>{String(bullet)}</li>)}</ul>;
  if (value.format === "scripture") return <><div className="space-y-3"><TextParagraphs text={value.introduction} /></div><p className="font-bold text-[#385245]">{String(value.reference ?? "")}{value.translation ? <span className="ml-2 font-normal text-[#607066]">({String(value.translation)})</span> : null}</p><div className="mt-2 space-y-3 italic"><TextParagraphs text={value.quotation} /></div></>;
  return <div className={value.format === "takeaway" ? "space-y-3 font-bold text-[#385245]" : "space-y-3"}><TextParagraphs text={value.text} /></div>;
}

function TextParagraphs({ text }: { text: unknown }) {
  const paragraphs = String(text ?? "").replace(/\r\n?/g, "\n").split("\n").map((paragraph) => paragraph.trim()).filter(Boolean);
  return <>{paragraphs.map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 20)}`} className="whitespace-pre-wrap">{paragraph}</p>)}</>;
}
