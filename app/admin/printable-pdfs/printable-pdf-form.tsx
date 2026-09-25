"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { removePrintablePdfLink, savePrintablePdfLink } from "./actions";

type FormState = { error?: string; saved?: boolean; removed?: boolean };

type Teaching = {
  id: string;
  title: string;
  gathering_date: string | null;
};

type Assignment = {
  teaching_id: string;
  printable_pdf_url: string;
  updated_at: string;
};

function formatGatheringDate(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function formatUpdatedDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value));
}

export function PrintablePdfManager({ teachings, assignments }: { teachings: Teaching[]; assignments: Assignment[] }) {
  const formSectionRef = useRef<HTMLElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const [selectedTeachingId, setSelectedTeachingId] = useState("");
  const [editingTeachingId, setEditingTeachingId] = useState<string | null>(null);
  const [printablePdfUrl, setPrintablePdfUrl] = useState("");
  const [search, setSearch] = useState("");

  const assignmentByTeaching = useMemo(
    () => new Map(assignments.map((assignment) => [assignment.teaching_id, assignment])),
    [assignments],
  );
  const teachingById = useMemo(() => new Map(teachings.map((teaching) => [teaching.id, teaching])), [teachings]);
  const visibleAssignments = assignments.filter((assignment) => {
    const title = teachingById.get(assignment.teaching_id)?.title ?? "";
    return title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  });
  const selectedAssignment = selectedTeachingId ? assignmentByTeaching.get(selectedTeachingId) : undefined;

  const [saveState, saveFormAction, savePending] = useActionState(async (previousState: FormState, formData: FormData) => {
    const result = await savePrintablePdfLink(previousState, formData);
    if (result.saved) {
      setSelectedTeachingId("");
      setEditingTeachingId(null);
      setPrintablePdfUrl("");
    }
    return result;
  }, {});

  function selectTeaching(teachingId: string) {
    const assignment = assignmentByTeaching.get(teachingId);
    setSelectedTeachingId(teachingId);
    setEditingTeachingId(assignment ? teachingId : null);
    setPrintablePdfUrl(assignment?.printable_pdf_url ?? "");
  }

  function editAssignment(assignment: Assignment) {
    selectTeaching(assignment.teaching_id);
    formSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => urlInputRef.current?.focus(), 250);
  }

  function cancelEdit() {
    setSelectedTeachingId("");
    setEditingTeachingId(null);
    setPrintablePdfUrl("");
  }

  return (
    <>
      <section ref={formSectionRef} className="scroll-mt-24 border-b border-[#284a3b]/10 py-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-extrabold text-[#243d31]">{editingTeachingId ? "Edit PDF link" : "Add PDF link"}</h2>
          {editingTeachingId ? <span className="text-xs font-extrabold uppercase tracking-wide text-[#946332]">Edit mode</span> : null}
        </div>

        {teachings.length ? (
          <form action={saveFormAction} className="mt-4 grid gap-4 lg:grid-cols-[minmax(16rem,0.9fr)_minmax(20rem,1.6fr)_auto] lg:items-end">
            {editingTeachingId ? <input type="hidden" name="teachingId" value={selectedTeachingId} /> : null}
            <label className="block text-sm font-bold text-[#385245]">
              Teaching
              <select
                name={editingTeachingId ? undefined : "teachingId"}
                value={selectedTeachingId}
                onChange={(event) => selectTeaching(event.target.value)}
                disabled={Boolean(editingTeachingId)}
                required
                className="admin-input"
              >
                <option value="">Choose a teaching</option>
                {teachings.map((teaching) => (
                  <option key={teaching.id} value={teaching.id}>
                    {teaching.title} ({formatGatheringDate(teaching.gathering_date)}){assignmentByTeaching.has(teaching.id) ? " - link saved" : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-bold text-[#385245]">
              Printable PDF link
              <input
                ref={urlInputRef}
                name="printablePdfUrl"
                type="url"
                inputMode="url"
                value={printablePdfUrl}
                onChange={(event) => setPrintablePdfUrl(event.target.value)}
                placeholder="https://..."
                required
                className="admin-input"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={savePending || !selectedTeachingId} className="admin-primary-button">
                {savePending ? "Saving..." : "Save PDF Link"}
              </button>
              {editingTeachingId ? <button type="button" onClick={cancelEdit} className="admin-secondary-button">Cancel Edit</button> : null}
            </div>
          </form>
        ) : (
          <p className="mt-4 text-sm text-[#607066]">Create a teaching before assigning a printable PDF link.</p>
        )}

        {selectedAssignment ? (
          <p className="mt-3 text-sm font-bold text-[#946332]">This teaching already has a PDF link. Saving will update it.</p>
        ) : null}
        {saveState.saved ? <p role="status" className="mt-3 text-sm font-bold text-[#326048]">PDF link saved.</p> : null}
        {saveState.error ? <p role="alert" className="mt-3 text-sm font-bold text-[#a2472c]">{saveState.error}</p> : null}
      </section>

      <section className="py-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-extrabold text-[#243d31]">Existing PDF links</h2>
            <p className="mt-1 text-sm text-[#607066]">{assignments.length} {assignments.length === 1 ? "assignment" : "assignments"}</p>
          </div>
          {assignments.length ? (
            <label className="block w-full text-sm font-bold text-[#385245] sm:max-w-xs">
              Search teaching
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search teaching..." className="admin-input" />
            </label>
          ) : null}
        </div>

        {!assignments.length ? (
          <p className="mt-6 text-sm text-[#607066]">No printable PDF links have been added yet.</p>
        ) : visibleAssignments.length ? (
          <div className="mt-5 overflow-x-auto border-y border-[#284a3b]/10">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="bg-[#eee7da] text-xs font-extrabold uppercase tracking-wide text-[#385245]">
                <tr>
                  <th scope="col" className="px-3 py-3">Teaching</th>
                  <th scope="col" className="px-3 py-3">Gathering Date</th>
                  <th scope="col" className="px-3 py-3">PDF</th>
                  <th scope="col" className="px-3 py-3">Updated</th>
                  <th scope="col" className="px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#284a3b]/10 bg-[#fffdf8]">
                {visibleAssignments.map((assignment) => {
                  const teaching = teachingById.get(assignment.teaching_id);
                  if (!teaching) return null;
                  return (
                    <tr key={assignment.teaching_id}>
                      <td className="max-w-md px-3 py-3 font-bold text-[#243d31]">{teaching.title}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-[#607066]">{formatGatheringDate(teaching.gathering_date)}</td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <a href={assignment.printable_pdf_url} target="_blank" rel="noopener noreferrer" className="font-bold text-[#946332] underline underline-offset-2 hover:text-[#a85e32]">View PDF</a>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-[#607066]">{formatUpdatedDate(assignment.updated_at)}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-4">
                          <button type="button" onClick={() => editAssignment(assignment)} className="font-bold text-[#385245] underline underline-offset-2 hover:text-[#a85e32]">Edit</button>
                          <DeletePdfLinkButton teachingId={assignment.teaching_id} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-6 text-sm text-[#607066]">No PDF links match that teaching search.</p>
        )}
      </section>
    </>
  );
}

function DeletePdfLinkButton({ teachingId }: { teachingId: string }) {
  const [state, formAction, pending] = useActionState(
    (previousState: FormState) => removePrintablePdfLink(teachingId, previousState),
    {},
  );

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm("Remove this printable PDF link?\n\nThis removes only the website association. It does not delete the teaching or the PDF from OneDrive.")) {
          event.preventDefault();
        }
      }}
    >
      <button type="submit" disabled={pending} className="font-bold text-[#a2472c] underline underline-offset-2 hover:text-[#8f3823] disabled:opacity-60">
        {pending ? "Deleting..." : "Delete"}
      </button>
      {state.error ? <span role="alert" className="sr-only">{state.error}</span> : null}
    </form>
  );
}
