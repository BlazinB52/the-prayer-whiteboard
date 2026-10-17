"use client";

import { useMemo, useSyncExternalStore } from "react";

// "My Place" ticks are a private reminder for whoever is editing, kept in this browser only. They are never sent
// to the server and have no effect on what is saved or submitted. Shared by the Content Managers' review form and
// the Administrator's text editor so both behave the same way.
const PROOFED_EVENT = "review-proofed-change";

export function useProofed(storageKey: string) {
  const raw = useSyncExternalStore(
    (notify) => {
      window.addEventListener(PROOFED_EVENT, notify);
      window.addEventListener("storage", notify);
      return () => {
        window.removeEventListener(PROOFED_EVENT, notify);
        window.removeEventListener("storage", notify);
      };
    },
    () => {
      try {
        return window.localStorage.getItem(storageKey) ?? "";
      } catch {
        return "";
      }
    },
    () => "",
  );
  const proofed = useMemo(() => {
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return new Set<string>(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []);
    } catch {
      return new Set<string>();
    }
  }, [raw]);
  const toggle = (key: string, checked: boolean) => {
    const next = new Set(proofed);
    if (checked) next.add(key);
    else next.delete(key);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify([...next]));
    } catch {
      // Storage can be unavailable (private window); the reminder simply will not stick.
    }
    window.dispatchEvent(new Event(PROOFED_EVENT));
  };
  return { proofed, toggle };
}
