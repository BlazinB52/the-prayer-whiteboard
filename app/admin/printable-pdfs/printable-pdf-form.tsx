"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  cleanupPrintablePdfUpload,
  createPrintablePdfUploadTarget,
  deleteOrphanedPrintablePdfStorageFiles,
  removePrintablePdfLink,
  savePrintablePdfLink,
  scanPrintablePdfStorageCleanup,
  type PrintablePdfCleanupDeleteState,
  type PrintablePdfCleanupScanState,
} from "./actions";

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

function formatDateTime(value: string | null) {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatBytes(value: number | null) {
  if (value === null) return "Unknown";
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB"];
  let size = value / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatAge(ageMs: number) {
  const hours = Math.floor(ageMs / (60 * 60 * 1000));
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"}`;
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

      <PrintablePdfStorageCleanup />
    </>
  );
}

function PrintablePdfStorageCleanup() {
  const [pending, startTransition] = useTransition();
  const [scanState, setScanState] = useState<PrintablePdfCleanupScanState>({});
  const [deleteState, setDeleteState] = useState<PrintablePdfCleanupDeleteState | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const files = scanState.files ?? [];
  const selectedSet = new Set(selectedPaths);

  function scan() {
    setDeleteState(null);
    startTransition(async () => {
      const result = await scanPrintablePdfStorageCleanup();
      setScanState(result);
      setSelectedPaths([]);
    });
  }

  function togglePath(path: string, checked: boolean) {
    setSelectedPaths((current) => (checked ? Array.from(new Set([...current, path])) : current.filter((value) => value !== path)));
  }

  function deleteSelected() {
    if (!selectedPaths.length) return;
    if (
      !window.confirm(
        "Permanently delete the selected orphaned PDF files from Supabase Storage?\n\nThese files are not referenced by any Printable PDF Link record.\n\nThis action cannot be undone.",
      )
    ) {
      return;
    }

    startTransition(async () => {
      const result = await deleteOrphanedPrintablePdfStorageFiles(selectedPaths);
      setDeleteState(result);
      setSelectedPaths([]);
      const refreshed = await scanPrintablePdfStorageCleanup();
      setScanState(refreshed);
    });
  }

  return (
    <section className="border-t border-[#284a3b]/10 py-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-[#243d31]">Storage Cleanup</h2>
          <p className="mt-1 text-sm text-[#607066]">Find unreferenced printable PDF files that are older than the safety window.</p>
        </div>
        <button type="button" onClick={scan} disabled={pending} className="admin-secondary-button">
          {pending ? "Working..." : "Scan for orphaned PDFs"}
        </button>
      </div>

      {scanState.error ? <p role="alert" className="mt-4 text-sm font-bold text-[#a2472c]">{scanState.error}</p> : null}

      {scanState.scannedAt && !scanState.error ? (
        files.length ? (
          <div className="mt-5">
            <div className="overflow-x-auto border-y border-[#284a3b]/10">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead className="bg-[#eee7da] text-xs font-extrabold uppercase tracking-wide text-[#385245]">
                  <tr>
                    <th scope="col" className="w-12 px-3 py-3">Select</th>
                    <th scope="col" className="px-3 py-3">Storage path</th>
                    <th scope="col" className="px-3 py-3">Size</th>
                    <th scope="col" className="px-3 py-3">Uploaded</th>
                    <th scope="col" className="px-3 py-3">Age</th>
                    <th scope="col" className="px-3 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#284a3b]/10 bg-[#fffdf8]">
                  {files.map((file) => (
                    <tr key={file.path}>
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selectedSet.has(file.path)}
                          onChange={(event) => togglePath(file.path, event.target.checked)}
                          aria-label={`Select ${file.path}`}
                          className="h-4 w-4 accent-[#946332]"
                        />
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-[#243d31]">{file.path}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-[#607066]">{formatBytes(file.size)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-[#607066]">{formatDateTime(file.updatedAt ?? file.createdAt)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-[#607066]">{formatAge(file.ageMs)}</td>
                      <td className="whitespace-nowrap px-3 py-3 font-bold text-[#326048]">Orphaned</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button type="button" onClick={deleteSelected} disabled={pending || !selectedPaths.length} className="admin-danger-button mt-4 disabled:opacity-60">
              Delete Selected
            </button>
          </div>
        ) : (
          <p role="status" className="mt-4 text-sm font-bold text-[#326048]">No orphaned printable PDF files found.</p>
        )
      ) : null}

      {deleteState ? (
        <div className="mt-4 space-y-2 text-sm">
          {deleteState.deleted.length ? (
            <p role="status" className="font-bold text-[#326048]">
              Deleted {deleteState.deleted.length} orphaned {deleteState.deleted.length === 1 ? "file" : "files"}.
            </p>
          ) : null}
          {deleteState.error ? <p role="alert" className="font-bold text-[#a2472c]">{deleteState.error}</p> : null}
          {deleteState.skipped.length ? (
            <div className="text-[#a2472c]">
              <p className="font-bold">{deleteState.skipped.length} {deleteState.skipped.length === 1 ? "file was" : "files were"} not deleted.</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {deleteState.skipped.map((item) => (
                  <li key={`${item.path}-${item.reason}`}>
                    <span className="font-mono text-xs">{item.path}</span>: {item.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
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
