"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cleanupPrintablePdfUpload, createPrintablePdfUploadTarget, removePrintablePdfLink, savePrintablePdfLink } from "./actions";

type FormState = { error?: string; saved?: boolean; removed?: boolean };

type PrintablePdfLink = {
  id: string;
  title: string;
  href: string;
  isStorageBacked: boolean;
  created_at: string;
  updated_at: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value));
}

export function PrintablePdfManager({ links }: { links: PrintablePdfLink[] }) {
  const router = useRouter();
  const formSectionRef = useRef<HTMLElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingHref, setEditingHref] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();
  const [saveState, setSaveState] = useState<FormState>({});
  const visibleLinks = links.filter((link) => link.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

  function editLink(link: PrintablePdfLink) {
    setEditingId(link.id);
    setEditingHref(link.href);
    setTitle(link.title);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setSaveState({});
    formSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => titleInputRef.current?.focus(), 250);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingHref(null);
    setTitle("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    setSaveState({});
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("pdfFile");
    const hasFile = file instanceof File && file.size > 0;

    if (!editingId && !hasFile) {
      setSaveState({ error: "Choose a PDF file." });
      return;
    }

    setSaveState({});
    startTransition(async () => {
      let storagePath: string | null = null;

      if (hasFile) {
        const target = await createPrintablePdfUploadTarget();
        if (target.error || !target.path || !target.token) {
          setSaveState({ error: target.error ?? "The secure upload destination could not be created." });
          return;
        }

        const supabase = createClient();
        const { error: uploadError } = await supabase.storage
          .from("printable-pdfs")
          .uploadToSignedUrl(target.path, target.token, file as File, {
            cacheControl: "public, max-age=31536000, immutable",
          });
        if (uploadError) {
          await cleanupPrintablePdfUpload(target.path);
          setSaveState({ error: "The PDF could not be uploaded. Please try again." });
          return;
        }

        storagePath = target.path;
      }

      const saveForm = new FormData();
      saveForm.set("title", title);
      if (editingId) saveForm.set("id", editingId);
      if (storagePath) saveForm.set("storagePath", storagePath);

      const result = await savePrintablePdfLink({}, saveForm);
      if (result.error) {
        if (storagePath) await cleanupPrintablePdfUpload(storagePath);
        setSaveState({ error: result.error });
        return;
      }

      setEditingId(null);
      setEditingHref(null);
      setTitle("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setSaveState({ saved: true });
      router.refresh();
    });
  }

  return (
    <>
      <section ref={formSectionRef} className="scroll-mt-24 border-b border-[#284a3b]/10 py-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-extrabold text-[#243d31]">{editingId ? "Edit PDF link" : "Add PDF link"}</h2>
          {editingId ? <span className="text-xs font-extrabold uppercase tracking-wide text-[#946332]">Edit mode</span> : null}
        </div>

        <form onSubmit={submit} className="mt-4 grid gap-4 lg:grid-cols-[minmax(16rem,0.9fr)_minmax(20rem,1.6fr)_auto] lg:items-end">
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
            {editingId ? "Replace PDF file" : "PDF file"}
            <input ref={fileInputRef} name="pdfFile" type="file" accept="application/pdf" className="admin-input py-2" />
            {editingId ? (
              <span className="mt-1 block text-xs font-normal text-[#607066]">
                Leave blank to keep the current file.{" "}
                <a href={editingHref ?? undefined} target="_blank" rel="noopener noreferrer" className="font-bold text-[#946332] underline underline-offset-2">
                  View current PDF
                </a>
              </span>
            ) : (
              <span className="mt-1 block text-xs font-normal text-[#607066]">PDF only, up to 25 MB.</span>
            )}
          </label>

          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={pending} className="admin-primary-button">
              {pending ? "Saving..." : "Save PDF Link"}
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
                      <a href={link.href} target="_blank" rel="noopener noreferrer" className="font-bold text-[#946332] underline underline-offset-2 hover:text-[#a85e32]">View PDF</a>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-4">
                        <button type="button" onClick={() => editLink(link)} className="font-bold text-[#385245] underline underline-offset-2 hover:text-[#a85e32]">Edit</button>
                        <DeletePdfLinkButton id={link.id} isStorageBacked={link.isStorageBacked} />
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

function DeletePdfLinkButton({ id, isStorageBacked }: { id: string; isStorageBacked: boolean }) {
  const [state, formAction, pending] = useActionState(
    (previousState: FormState) => removePrintablePdfLink(id, previousState),
    {},
  );

  const confirmMessage = isStorageBacked
    ? "Remove this printable PDF link?\n\nThis permanently deletes the stored PDF file as well as the website listing."
    : "Remove this printable PDF link?\n\nThis removes only the website listing. It does not delete the PDF from OneDrive or any other storage provider.";

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm(confirmMessage)) {
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
