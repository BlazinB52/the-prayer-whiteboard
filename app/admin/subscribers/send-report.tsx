"use client";

import { useActionState } from "react";
import { sendReportAction, type SendReportState } from "./actions";

const formatDate = (value: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export function SendReport() {
  const [state, formAction, pending] = useActionState<SendReportState>(sendReportAction, {});
  const rows = state.rows;
  const totalMissed = rows?.reduce((sum, row) => sum + row.missed.length, 0) ?? 0;
  const notSent = rows?.filter((row) => row.notSent).length ?? 0;
  return (
    <section className="mt-8 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5 shadow-lg shadow-[#4d5f52]/8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-[#243d31]">Did this week&apos;s emails go out?</h2>
          <p className="mt-1 text-sm text-[#607066]">Checks every weekly update, teaching and devotional sent in the last 7 days and lists anyone who did not receive it.</p>
        </div>
        <form action={formAction}>
          <button type="submit" disabled={pending} className="admin-primary-button min-h-11 disabled:opacity-60">{pending ? "Checking…" : "Check this week's sends"}</button>
        </form>
      </div>
      {state.error ? <p role="alert" className="mt-4 text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
      {rows ? (
        <div className="mt-5" role="status">
          <p className={`text-sm font-extrabold ${totalMissed || notSent ? "text-[#a2472c]" : "text-[#326048]"}`}>
            {!rows.length ? "Nothing was sent in the last 7 days." : totalMissed || notSent ? [notSent ? `${notSent} published ${notSent === 1 ? "teaching has" : "teachings have"} no email sent yet.` : "", totalMissed ? `${totalMissed} missed ${totalMissed === 1 ? "delivery" : "deliveries"}.` : ""].filter(Boolean).join(" ") : `All ${rows.length} sends reached everyone.`}
          </p>
          <ul className="mt-3 divide-y divide-[#284a3b]/10 text-sm">
            {rows.map((row, index) => (
              <li key={`${row.sentAt}-${index}`} className="py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-bold text-[#243d31]">{row.kind}: {row.title}{row.language === "es" ? " (Español)" : ""}</p>
                  <p className={`font-extrabold ${row.missed.length || row.notSent ? "text-[#a2472c]" : "text-[#326048]"}`}>{row.notSent ? `Email not sent (would reach ${row.expected})` : `${row.delivered} of ${row.expected} received`}</p>
                </div>
                <p className="text-xs text-[#607066]">{formatDate(row.sentAt)} · {row.status}</p>
                {row.missed.length ? (
                  <ul className="mt-2 space-y-1 text-[#7a4a1d]">
                    {row.missed.map((person) => <li key={person.email}>{person.firstName} ({person.email}) — {person.reason}</li>)}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
