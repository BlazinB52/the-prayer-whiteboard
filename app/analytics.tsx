"use client";

import { useSyncExternalStore } from "react";
import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";
import { usePathname } from "next/navigation";

export type AnalyticsPreference =
  | "unknown"
  | "opted-out"
  | "opted-in"
  | "storage-unavailable";

export const ANALYTICS_OPT_OUT_STORAGE_KEY =
  "the-prayer-whiteboard.analytics.opt-out";
export const ANALYTICS_OPT_OUT_CHANGE_EVENT =
  "the-prayer-whiteboard.analytics.opt-out-change";

const excludedPathPrefixes = ["/admin"];
const excludedPaths = ["/analytics-opt-out"];
let analyticsPreference: AnalyticsPreference = "unknown";
let hasReadAnalyticsPreference = false;

function isLocalHost(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".local")
  );
}

export function isAnalyticsOptedOut() {
  return getAnalyticsPreferenceSnapshot() !== "opted-in";
}

export function getAnalyticsPreferenceSnapshot(): AnalyticsPreference {
  return analyticsPreference;
}

export function getServerAnalyticsPreferenceSnapshot(): AnalyticsPreference {
  return "unknown";
}

function readAnalyticsPreference(): AnalyticsPreference {
  try {
    return window.localStorage.getItem(ANALYTICS_OPT_OUT_STORAGE_KEY) === "true"
      ? "opted-out"
      : "opted-in";
  } catch {
    return "storage-unavailable";
  }
}

export function initializeAnalyticsPreference() {
  analyticsPreference = readAnalyticsPreference();
  hasReadAnalyticsPreference = true;
  window.dispatchEvent(new Event(ANALYTICS_OPT_OUT_CHANGE_EVENT));
}

export function setAnalyticsOptOut(isOptedOut: boolean) {
  try {
    if (isOptedOut) {
      window.localStorage.setItem(ANALYTICS_OPT_OUT_STORAGE_KEY, "true");
    } else {
      window.localStorage.removeItem(ANALYTICS_OPT_OUT_STORAGE_KEY);
    }
    analyticsPreference = isOptedOut ? "opted-out" : "opted-in";
    hasReadAnalyticsPreference = true;
    window.dispatchEvent(new Event(ANALYTICS_OPT_OUT_CHANGE_EVENT));
  } catch {
    analyticsPreference = "storage-unavailable";
    hasReadAnalyticsPreference = true;
    window.dispatchEvent(new Event(ANALYTICS_OPT_OUT_CHANGE_EVENT));
  }
}

export function subscribeToAnalyticsOptOutChanges(onStoreChange: () => void) {
  function handleStoreChange() {
    analyticsPreference = readAnalyticsPreference();
    hasReadAnalyticsPreference = true;
    onStoreChange();
  }

  window.addEventListener("storage", handleStoreChange);
  window.addEventListener(ANALYTICS_OPT_OUT_CHANGE_EVENT, handleStoreChange);

  if (!hasReadAnalyticsPreference) {
    window.setTimeout(handleStoreChange, 0);
  }

  return () => {
    window.removeEventListener("storage", handleStoreChange);
    window.removeEventListener(
      ANALYTICS_OPT_OUT_CHANGE_EVENT,
      handleStoreChange,
    );
  };
}

function shouldSkipAnalyticsEvent(event: BeforeSendEvent) {
  if (process.env.NODE_ENV !== "production") return true;
  if (process.env.NEXT_PUBLIC_VERCEL_ENV !== "production") return true;
  if (typeof window === "undefined") return true;

  const currentUrl = new URL(event.url, window.location.href);

  if (isLocalHost(window.location.hostname) || isLocalHost(currentUrl.hostname)) {
    return true;
  }

  if (excludedPaths.includes(currentUrl.pathname)) return true;

  if (
    excludedPathPrefixes.some(
      (prefix) =>
        currentUrl.pathname === prefix ||
        currentUrl.pathname.startsWith(`${prefix}/`),
    )
  ) {
    return true;
  }

  return isAnalyticsOptedOut();
}

function isExcludedPath(pathname: string | null) {
  if (!pathname) return true;
  if (excludedPaths.includes(pathname)) return true;

  return excludedPathPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function PrayerWhiteboardAnalytics() {
  const pathname = usePathname();
  const preference = useSyncExternalStore(
    subscribeToAnalyticsOptOutChanges,
    getAnalyticsPreferenceSnapshot,
    getServerAnalyticsPreferenceSnapshot,
  );

  if (process.env.NODE_ENV !== "production") return null;
  if (process.env.NEXT_PUBLIC_VERCEL_ENV !== "production") return null;
  if (isExcludedPath(pathname)) return null;
  if (preference !== "opted-in") return null;

  return (
    <Analytics
      mode="production"
      beforeSend={(event) => (shouldSkipAnalyticsEvent(event) ? null : event)}
    />
  );
}
