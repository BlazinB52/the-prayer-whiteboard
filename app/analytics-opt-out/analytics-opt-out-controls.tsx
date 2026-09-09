"use client";

import { useSyncExternalStore } from "react";
import {
  ANALYTICS_OPT_OUT_CHANGE_EVENT,
  isAnalyticsOptedOut,
  setAnalyticsOptOut,
} from "../analytics";

export function AnalyticsOptOutControls() {
  const isOptedOut = useSyncExternalStore(
    subscribeToOptOutChanges,
    isAnalyticsOptedOut,
    () => false,
  );

  function updatePreference(nextValue: boolean) {
    setAnalyticsOptOut(nextValue);
  }

  const statusText =
    isOptedOut
      ? "Analytics counting is disabled for this browser."
      : "Analytics counting is enabled for this browser.";

  return (
    <section className="rounded-xl border border-[#284a3b]/12 bg-white px-6 py-7 shadow-sm shadow-[#4d5f52]/10 sm:px-8">
      <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">
        Browser preference
      </p>
      <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-[#243d31]">
        Analytics opt-out
      </h1>
      <p className="mt-4 text-lg font-bold text-[#385245]">{statusText}</p>
      <p className="mt-4 leading-7 text-[#5b6a61]">
        This setting is stored only in this browser on this device. Repeat it on
        each browser or device you want excluded. Clearing browsing data,
        localStorage, or site data will remove the exclusion.
      </p>
      <div className="mt-7 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => updatePreference(true)}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#244a3a] px-5 text-sm font-extrabold text-white transition hover:bg-[#1d3d30]"
        >
          Exclude this browser
        </button>
        <button
          type="button"
          onClick={() => updatePreference(false)}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#284a3b]/15 bg-white px-5 text-sm font-extrabold text-[#244a3a] transition hover:border-[#a45e2e]/40 hover:text-[#a45e2e]"
        >
          Count this browser again
        </button>
      </div>
    </section>
  );
}

function subscribeToOptOutChanges(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(ANALYTICS_OPT_OUT_CHANGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(ANALYTICS_OPT_OUT_CHANGE_EVENT, onStoreChange);
  };
}
