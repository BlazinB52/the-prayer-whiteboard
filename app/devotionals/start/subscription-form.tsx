"use client";

import { useState } from "react";

export function DevotionalSubscriptionForm() {
  const [message, setMessage] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("Subscription connection coming next.");
  }

  return (
    <form onSubmit={handleSubmit} className="mt-7 space-y-5">
      <label className="block text-sm font-bold text-[#385245]">
        First name
        <input
          name="firstName"
          type="text"
          autoComplete="given-name"
          required
          className="mt-2 min-h-12 w-full rounded-xl border border-[#284a3b]/15 bg-[#fffdf8] px-4 text-base text-[#243126] outline-none transition focus:border-[#a85e32]/55 focus:ring-4 focus:ring-[#f1c66f]/25"
        />
      </label>
      <label className="block text-sm font-bold text-[#385245]">
        Email address
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="mt-2 min-h-12 w-full rounded-xl border border-[#284a3b]/15 bg-[#fffdf8] px-4 text-base text-[#243126] outline-none transition focus:border-[#a85e32]/55 focus:ring-4 focus:ring-[#f1c66f]/25"
        />
      </label>
      <button
        type="submit"
        className="inline-flex min-h-13 w-full items-center justify-center rounded-2xl bg-[#244a3a] px-6 text-base font-extrabold text-white shadow-xl shadow-[#244a3a]/15 transition hover:bg-[#1d3d30] sm:w-auto"
      >
        Start the 7-Day Devotional
      </button>
      {message ? (
        <p className="rounded-xl border border-[#d2a34f]/25 bg-[#fff8e8] px-4 py-3 text-sm font-bold text-[#6f604f]">
          {message}
        </p>
      ) : null}
    </form>
  );
}
