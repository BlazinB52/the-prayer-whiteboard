"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteHandout, setHandoutDate } from "./actions";

export function HandoutDateForm({ id, date }: { id: string; date: string }) {
  const router = useRouter();
  const [value, setValue] = useState(date);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="mt-4 flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        startTransition(async () => {
          const result = await setHandoutDate(id, value);
          if (result.error) setMessage({ ok: false, text: result.error });
          else {
            setMessage({ ok: true, text: "Teaching date saved." });
            router.refresh();
          }
        });
      }}
    >
      <label className="block text-sm font-bold text-[#385245]">
        Teaching date
        <input type="date" required value={value} onChange={(event) => setValue(event.target.value)} disabled={pending} className="admin-input" />
      </label>
      <button type="submit" disabled={pending || value === date} className="admin-secondary-button"><span>{pending ? "Saving..." : "Change date"}</span></button>
      {message ? <p role={message.ok ? "status" : "alert"} className={`text-sm font-bold ${message.ok ? "text-[#326048]" : "text-[#a2472c]"}`}>{message.text}</p> : null}
    </form>
  );
}

export function DeleteHandoutButton({ id }: { id: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Delete this handout and every Content Manager proposal on it? This cannot be undone.")) return;
          setError(null);
          startTransition(async () => {
            const result = await deleteHandout(id);
            if (result.error) setError(result.error);
            else router.push("/admin/handouts");
          });
        }}
        className="admin-secondary-button text-[#a2472c]"
      >
        <span>{pending ? "Deleting..." : "Delete handout"}</span>
      </button>
      {error ? <p role="alert" className="mt-2 text-sm font-bold text-[#a2472c]">{error}</p> : null}
    </div>
  );
}
