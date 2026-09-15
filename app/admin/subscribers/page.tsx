import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/supabase/admin";
import { EMAIL_CATEGORY_LABELS, type EmailCategory } from "@/lib/email-categories";
import { maskEmail } from "@/lib/email-subscriptions";

export const metadata: Metadata = {
  title: "Email Subscribers",
  robots: { index: false, follow: false },
};

type SubscriberRow = {
  id: string;
  first_name: string;
  email: string;
  status: string;
  confirmed_at: string | null;
  updated_at: string;
  sender_sync_status: string;
  sender_sync_error: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function AdminSubscribersPage() {
  const { supabase } = await requireAdmin();
  const [{ data: subscribers, error }, { data: preferences }] = await Promise.all([
    supabase.from("email_subscribers").select("id, first_name, email, status, confirmed_at, updated_at, sender_sync_status, sender_sync_error").order("updated_at", { ascending: false }),
    supabase.from("email_subscription_preferences").select("subscriber_id, category, status, updated_at").order("category", { ascending: true }),
  ]);
  const categoriesBySubscriber = new Map<string, EmailCategory[]>();
  const lastPreferenceUpdateBySubscriber = new Map<string, string>();
  for (const preference of preferences ?? []) {
    const currentUpdatedAt = lastPreferenceUpdateBySubscriber.get(preference.subscriber_id);
    if (!currentUpdatedAt || new Date(preference.updated_at).getTime() > new Date(currentUpdatedAt).getTime()) {
      lastPreferenceUpdateBySubscriber.set(preference.subscriber_id, preference.updated_at);
    }
    if (preference.status !== "active" && preference.status !== "pending") continue;
    const category = preference.category as EmailCategory;
    const current = categoriesBySubscriber.get(preference.subscriber_id) ?? [];
    current.push(category);
    categoriesBySubscriber.set(preference.subscriber_id, current);
  }

  return (
    <main className="admin-shell">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-5 border-b border-[#284a3b]/10 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/admin" className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Back to dashboard</Link>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#243d31]">Email Subscribers</h1>
            <p className="mt-3 text-sm text-[#607066]">View subscription status, category choices, consent state, and Sender sync placeholders.</p>
          </div>
          <Link href="/subscribe" className="admin-secondary-button inline-flex items-center justify-center">Public signup</Link>
        </header>
        {error ? <p className="mt-6 text-sm font-bold text-[#a2472c]">Subscribers could not be loaded.</p> : null}
        <section className="mt-8 overflow-hidden rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] shadow-lg shadow-[#4d5f52]/8">
          <div className="grid gap-4 border-b border-[#284a3b]/10 px-5 py-4 text-xs font-extrabold uppercase tracking-[0.14em] text-[#946332] md:grid-cols-[1fr_0.8fr_1fr_1fr_1fr_1fr]">
            <span>Subscriber</span><span>Status</span><span>Categories</span><span>Confirmed</span><span>Updated</span><span>Sender sync</span>
          </div>
          {(subscribers as SubscriberRow[] | null)?.length ? (subscribers as SubscriberRow[]).map((subscriber) => {
            const categories = categoriesBySubscriber.get(subscriber.id) ?? [];
            return (
              <article key={subscriber.id} className="grid gap-3 border-b border-[#284a3b]/10 px-5 py-4 text-sm last:border-b-0 md:grid-cols-[1fr_0.8fr_1fr_1fr_1fr_1fr]">
                <div><p className="font-extrabold text-[#243d31]">{subscriber.first_name}</p><p className="mt-1 text-[#607066]">{maskEmail(subscriber.email)}</p></div>
                <p className="font-bold capitalize text-[#385245]">{subscriber.status}</p>
                <p className="text-[#607066]">{categories.length ? categories.map((category) => EMAIL_CATEGORY_LABELS[category]).join(", ") : "None"}</p>
                <p className="text-[#607066]">{formatDate(subscriber.confirmed_at)}</p>
                <p className="text-[#607066]">{formatDate(lastPreferenceUpdateBySubscriber.get(subscriber.id) ?? subscriber.updated_at)}</p>
                <p className="text-[#607066]">{subscriber.sender_sync_status}{subscriber.sender_sync_error ? `: ${subscriber.sender_sync_error}` : ""}</p>
              </article>
            );
          }) : <p className="px-5 py-6 text-sm text-[#607066]">No subscribers yet.</p>}
        </section>
      </div>
    </main>
  );
}
