"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { removePrintablePdfLink, savePrintablePdfLink } from "./actions";

type FormState = { error?: string; saved?: boolean; removed?: boolean };

type PrintablePdfLink = {
  id: string;
  title: string;
  printable_pdf_url: string;
  created_at: string;
  updated_at: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value));
}

export function PrintablePdfManager({ links }: { links: PrintablePdfLink[] }) {
  const formSectionRef = useRef<HTMLElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [printablePdfUrl, setPrintablePdfUrl] = useState("");
  const [search, setSearch] = useState("");
  const visibleLinks = links.filter((link) => link.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

  const [saveState, saveFormAction, savePending] = useActionState(async (previousState: FormState, formData: FormData) => {
    const result = await savePrintablePdfLink(previousState, formData);
    if (result.saved) {
      setEditingId(null);
      setTitle("");
      setPrintablePdfUrl("");
    }
    return result;
  }, {});

  function editLink(link: PrintablePdfLink) {
    setEditingId(link.id);
    setTitle(link.title);
    setPrintablePdfUrl(link.printable_pdf_url);
    formSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => titleInputRef.current?.focus(), 250);
  }

  function cancelEdit() {
    setEditingId(null);
    setTitle("");
    setPrintablePdfUrl("");
  }

  return (
    <>
      <section ref={formSectionRef} className="scroll-mt-24 border-b border-[#284a3b]/10 py-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-extrabold text-[#243d31]">{editingId ? "Edit PDF link" : "Add PDF link"}</h2>
          {editingId ? <span className="text-xs font-extrabold uppercase tracking-wide text-[#946332]">Edit mode</span> : null}
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            startTransition(() => saveFormAction(formData));
          }}
          className="mt-4 grid gap-4 lg:grid-cols-[minmax(16rem,0.9fr)_minmax(20rem,1.6fr)_auto] lg:items-end"
        >
          {editingId ? <input type="hidden" name="id" value={editingId} /> : null}
          <label className="block text-sm font-bold text-[#385245]">
            Title
            <input
              ref={titleInputRef}
              name="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              required
              className="admin-input"
            />
          </label>

          <label className="block text-sm font-bold text-[#385245]">
            Printable PDF link
            <input
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
            <button type="submit" disabled={savePending} className="admin-primary-button">
              {savePending ? "Saving..." : "Save PDF Link"}
            </button>
            {editingId ? <button type="button" onClick={cancelEdit} className="admin-secondary-button">Cancel Edit</button> : null}
          </div>
        </form>

        {saveState.saved ? <p role="status" className="mt-3 text-sm font-bold text-[#326048]">PDF link saved.</p> : null}
        {saveState.error ? <p role="alert" className="mt-3 text-sm font-bold text-[#a2472c]">{saveState.error}</p> : null}
      </section>

      <section className="py-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-extrabold text-[#243d31]">Existing PDF links</h2>
            <p className="mt-1 text-sm text-[#607066]">{links.length} {links.length === 1 ? "link" : "links"}</p>
          </div>
          {links.length ? (
            <label className="block w-full text-sm font-bold text-[#385245] sm:max-w-xs">
              Search PDF title
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search PDF title..." className="admin-input" />
            </label>
          ) : null}
        </div>

        {!links.length ? (
          <p className="mt-6 text-sm text-[#607066]">No printable PDF links have been added yet.</p>
        ) : visibleLinks.length ? (
          <div className="mt-5 overflow-x-auto border-y border-[#284a3b]/10">
            <table className="w-full min-w-[620px] border-collapse text-left text-sm">
              <thead className="bg-[#eee7da] text-xs font-extrabold uppercase tracking-wide text-[#385245]">
                <tr>
                  <th scope="col" className="px-3 py-3">Title</th>
                  <th scope="col" className="px-3 py-3">Date</th>
                  <th scope="col" className="px-3 py-3">PDF</th>
                  <th scope="col" className="px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#284a3b]/10 bg-[#fffdf8]">
                {visibleLinks.map((link) => (
                  <tr key={link.id}>
                    <td className="max-w-md px-3 py-3 font-bold text-[#243d31]">{link.title}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-[#607066]">{formatDate(link.created_at)}</td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <a href={link.printable_pdf_url} target="_blank" rel="noopener noreferrer" className="font-bold text-[#946332] underline underline-offset-2 hover:text-[#a85e32]">View PDF</a>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-4">
                        <button type="button" onClick={() => editLink(link)} className="font-bold text-[#385245] underline underline-offset-2 hover:text-[#a85e32]">Edit</button>
                        <DeletePdfLinkButton id={link.id} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-6 text-sm text-[#607066]">No PDF links match that title search.</p>
        )}
      </section>
    </>
  );
}

function DeletePdfLinkButton({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(
    (previousState: FormState) => removePrintablePdfLink(id, previousState),
    {},
  );

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm("Remove this printable PDF link?\n\nThis removes only the website listing. It does not delete the PDF from OneDrive or any other storage provider.")) {
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
