"use client";

import { useActionState } from "react";
import type { PublishTeachingState } from "./actions";

type Action = (state: PublishTeachingState) => Promise<PublishTeachingState>;

const confirmationMessage = [
  "This teaching will become publicly available.",
  "It will replace the currently featured homepage teaching.",
  "The previous featured teaching will remain published and available under Previous Gatherings.",
  "",
  "Publish and feature this teaching now?",
].join("\n");

const espanolConfirmationMessage = [
  "This teaching will become publicly available on the Español homepage (/espanol).",
  "It will replace the currently featured Español teaching; the English homepage is not changed.",
  "No email is sent to subscribers.",
  "",
  "Publish this teaching to the Español homepage now?",
].join("\n");

const espanolDeepDiveConfirmationMessage = [
  "This Deep Dive will become publicly available on the Español homepage (/espanol).",
  "The English site is not changed and no email is sent.",
  "",
  "Publish this Deep Dive now?",
].join("\n");

const deepDiveConfirmationMessage = [
  "This Deep Dive will become publicly available in the Deep Dives collection.",
  "It will not replace the featured homepage teaching.",
  "",
  "Publish this Deep Dive now?",
].join("\n");

export function PublishFeatureButton({ action, teachingType = "standard", language = "en" }: { action: Action; teachingType?: "standard" | "deep_dive"; language?: "en" | "es" }) {
  const [state, formAction, isPending] = useActionState(action, {});
  const isDeepDive = teachingType === "deep_dive";
  const isEspanol = language === "es";

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm(isEspanol ? (isDeepDive ? espanolDeepDiveConfirmationMessage : espanolConfirmationMessage) : isDeepDive ? deepDiveConfirmationMessage : confirmationMessage)) {
          event.preventDefault();
        }
      }}
      className="mt-4"
    >
      {state.error ? <p role="alert" className="mb-3 text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#a85e32] px-5 font-extrabold text-white transition hover:bg-[#8f4f2a] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="!text-white">{isPending ? "Publishing..." : isDeepDive ? "Publish Deep Dive" : isEspanol ? "Publish to Español Homepage" : "Publish and Feature on Homepage"}</span>
      </button>
    </form>
  );
}
