"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { requestBackupNow, type BackupNowState } from "./backup-now-action";

// While a request is waiting or running, the page re-reads its status every few seconds.
export function BackupNow({ active }: { active: boolean }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(requestBackupNow, {} as BackupNowState);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => router.refresh(), 8000);
    return () => window.clearInterval(timer);
  }, [active, router]);

  return (
    <form action={formAction}>
      {state.error ? <p role="alert" className="mb-2 text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
      <button type="submit" disabled={pending || active} className="admin-primary-button">
        {pending ? "Requesting..." : active ? "Backup in progress" : "Back up now"}
      </button>
    </form>
  );
}
