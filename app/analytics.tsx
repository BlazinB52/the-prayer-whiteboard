"use client";

import { useSyncExternalStore } from "react";
import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

export const ANALYTICS_OPT_OUT_STORAGE_KEY =
  "the-prayer-whiteboard.analytics.opt-out";
export const ANALYTICS_OPT_OUT_CHANGE_EVENT =
  "the-prayer-whiteboard.analytics.opt-out-change";

const excludedPathPrefixes = ["/admin"];
const excludedPaths = ["/analytics-opt-out"];

function isLocalHost(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".local")
  );
}

export function isAnalyticsOptedOut() {
  try {
    return (
      window.localStorage.getItem(ANALYTICS_OPT_OUT_STORAGE_KEY) === "true"
    );
  } catch {
    return true;
  }
}

export function setAnalyticsOptOut(isOptedOut: boolean) {
  try {
    if (isOptedOut) {
      window.localStorage.setItem(ANALYTICS_OPT_OUT_STORAGE_KEY, "true");
    } else {
      window.localStorage.removeItem(ANALYTICS_OPT_OUT_STORAGE_KEY);
    }
    window.dispatchEvent(new Event(ANALYTICS_OPT_OUT_CHANGE_EVENT));
  } catch {}
}

export function subscribeToAnalyticsOptOutChanges(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(ANALYTICS_OPT_OUT_CHANGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(ANALYTICS_OPT_OUT_CHANGE_EVENT, onStoreChange);
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

export function PrayerWhiteboardAnalytics() {
  const isOptedOut = useSyncExternalStore(
    subscribeToAnalyticsOptOutChanges,
    isAnalyticsOptedOut,
    () => true,
  );

  if (process.env.NODE_ENV !== "production") return null;
  if (process.env.NEXT_PUBLIC_VERCEL_ENV !== "production") return null;
  if (isOptedOut) return null;

  return (
    <Analytics
      mode="production"
      beforeSend={(event) => (shouldSkipAnalyticsEvent(event) ? null : event)}
    />
  );
}
