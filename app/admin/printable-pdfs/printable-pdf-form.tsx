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
  created_at: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value));
}

// A hung request (network stall, an unresponsive endpoint) should never
// leave the form stuck on a spinner forever — each step below is bounded so
// it eventually surfaces a clear, retryable error instead.
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out. Please try again.`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function PrintablePdfManager({ links }: { links: PrintablePdfLink[] }) {
  const router = useRouter();
  const titleInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();
  const [phase, setPhase] = useState<"idle" | "uploading" | "saving">("idle");
  const [saveState, setSaveState] = useState<FormState>({});
  const visibleLinks = links.filter((link) => link.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("pdfFile");

    if (!(file instanceof File) || !file.size) {
      setSaveState({ error: "Choose a PDF file." });
      return;
    }

    setSaveState({});
    startTransition(async () => {
      try {
        setPhase("uploading");
        const target = await withTimeout(createPrintablePdfUploadTarget(), 15_000, "Creating the upload destination");
        if (target.error || !target.path || !target.token) {
          setSaveState({ error: target.error ?? "The secure upload destination could not be created." });
          return;
        }

        const supabase = createClient();
        const { error: uploadError } = await withTimeout(
          supabase.storage.from("printable-pdfs").uploadToSignedUrl(target.path, target.token, file, {
            cacheControl: "public, max-age=31536000, immutable",
          }),
          120_000,
          "Uploading the PDF",
        );
        if (uploadError) {
          await cleanupPrintablePdfUpload(target.path);
          setSaveState({ error: "The PDF could not be uploaded. Please try again." });
          return;
        }

        setPhase("saving");
        const saveForm = new FormData();
        saveForm.set("title", title);
        saveForm.set("storagePath", target.path);

        const result = await withTimeout(savePrintablePdfLink({}, saveForm), 30_000, "Saving the PDF link");
        if (result.error) {
          await cleanupPrintablePdfUpload(target.path);
          setSaveState({ error: result.error });
          return;
        }

        setTitle("");
        if (fileInputRef.current) fileInputRef.current.value = "";
        setSaveState({ saved: true });
        router.refresh();
      } catch (error) {
        setSaveState({ error: error instanceof Error ? error.message : "Something went wrong. Please try again." });
      } finally {
        setPhase("idle");
      }
    });
  }

  const statusLabel = phase === "uploading" ? "Uploading PDF..." : phase === "saving" ? "Saving..." : "Save PDF Link";

  return (
    <>
      <section className="border-b border-[#284a3b]/10 py-7">
        <h2 className="text-xl font-extrabold text-[#243d31]">Add PDF link</h2>

        <form onSubmit={submit} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
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
              PDF file
              <input ref={fileInputRef} name="pdfFile" type="file" accept="application/pdf" required className="admin-input py-2" />
              <span className="mt-1 block text-xs font-normal text-[#607066]">PDF only, up to 25 MB.</span>
            </label>
          </div>

          <button type="submit" disabled={pending} className="admin-primary-button">
            {statusLabel}
          </button>
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
                      <DeletePdfLinkButton id={link.id} />
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
        if (!window.confirm("Remove this printable PDF link?\n\nThis permanently deletes the stored PDF file as well as the website listing.")) {
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
