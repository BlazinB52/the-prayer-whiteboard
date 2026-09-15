"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { submitSubscription, type SubscribeState } from "./actions";
import { EMAIL_CATEGORIES, EMAIL_CATEGORY_LABELS, type EmailCategory } from "@/lib/email-categories";

const initialState: SubscribeState = {};

export function SubscribeForm() {
  const [state, action, pending] = useActionState(submitSubscription, initialState);
  const [selected, setSelected] = useState<Record<EmailCategory, boolean>>({
    weekly_updates: true,
    teachings: true,
    devotionals: true,
  });
  const allSelected = useMemo(() => EMAIL_CATEGORIES.every((category) => selected[category]), [selected]);

  if (state.submitted) {
    return (
      <div role="status" className="rounded-2xl border border-[#326048]/20 bg-[#e7efe9] p-5 text-[#244a3a]">
        <h2 className="text-2xl font-extrabold">Almost done.</h2>
        <p className="mt-3 leading-7">
          Check your inbox for a confirmation email from The Prayer Whiteboard. If you do not see it soon, please check Junk, Spam, or Promotions.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5 shadow-xl shadow-[#4d5f52]/8 sm:p-7">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-bold text-[#385245]">
          First name
          <input name="firstName" autoComplete="given-name" required maxLength={120} className="admin-input" />
        </label>
        <label className="block text-sm font-bold text-[#385245]">
          Email
          <input name="email" type="email" autoComplete="email" required maxLength={320} className="admin-input" />
        </label>
      </div>
      <label className="hidden">
        Website
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
      <fieldset className="mt-6">
        <legend className="text-sm font-extrabold text-[#385245]">Choose email updates</legend>
        <button
          type="button"
          onClick={() => setSelected({ weekly_updates: !allSelected, teachings: !allSelected, devotionals: !allSelected })}
          className="mt-3 inline-flex min-h-10 items-center rounded-xl border border-[#284a3b]/15 bg-white px-4 text-sm font-extrabold text-[#244a3a] transition hover:border-[#a85e32]/40 hover:text-[#a85e32]"
        >
          Select All
        </button>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {EMAIL_CATEGORIES.map((category) => (
            <label key={category} className="flex min-h-14 items-center gap-3 rounded-xl border border-[#284a3b]/10 bg-white px-4 text-sm font-bold text-[#385245]">
              <input
                name={category}
                type="checkbox"
                checked={selected[category]}
                onChange={(event) => setSelected((current) => ({ ...current, [category]: event.target.checked }))}
              />
              {EMAIL_CATEGORY_LABELS[category]}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="mt-6 flex gap-3 text-sm font-bold leading-6 text-[#385245]">
        <input name="privacyConsent" type="checkbox" required className="mt-1" />
        <span>
          I agree to receive the selected emails from The Prayer Whiteboard and understand I can change preferences or unsubscribe later. See the{" "}
          <Link href="/privacy" className="text-[#9d5a2f] underline underline-offset-2">Privacy Policy</Link>.
        </span>
      </label>
      {state.error ? <p role="alert" className="mt-4 text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="mt-6 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#244a3a] px-6 text-base font-extrabold !text-white shadow-xl shadow-[#244a3a]/20 transition hover:-translate-y-0.5 hover:bg-[#1d3d30] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">
        {pending ? "Submitting..." : "Subscribe"} <ArrowRight aria-hidden="true" size={18} />
      </button>
      <p className="mt-4 text-sm leading-6 text-[#607066]">
        After you subscribe, we will send one confirmation email. You will not receive these updates unless you confirm your subscription.
      </p>
    </form>
  );
}
