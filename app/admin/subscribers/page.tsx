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

const PAGE_SIZE = 25;

function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function pageHref(page: number, query: string) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  const suffix = params.toString();
  return `/admin/subscribers${suffix ? `?${suffix}` : ""}`;
}

export default async function AdminSubscribersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const { supabase } = await requireAdmin();
  const params = await searchParams;
  const query = String(params.q ?? "").trim().slice(0, 120);
  const requestedPage = Number.parseInt(String(params.page ?? "1"), 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let subscriberQuery = supabase
    .from("email_subscribers")
    .select("id, first_name, email, status, confirmed_at, updated_at, sender_sync_status, sender_sync_error", { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (query) {
    const escaped = query.replace(/[%_]/g, (match) => `\\${match}`);
    subscriberQuery = subscriberQuery.or(`first_name.ilike.%${escaped}%,email.ilike.%${escaped}%,normalized_email.ilike.%${escaped}%`);
  }

  const [subscriberResult, preferenceResult] = await Promise.all([
    subscriberQuery,
    supabase.from("email_subscription_preferences").select("subscriber_id, category, status, updated_at").order("category", { ascending: true }),
  ]);
  const { data: subscribers, error, count } = subscriberResult;
  const { data: preferences } = preferenceResult;
  const rows = (subscribers as SubscriberRow[] | null) ?? [];
  const total = count ?? 0;
  const firstShown = total ? from + 1 : 0;
  const lastShown = total ? Math.min(from + rows.length, total) : 0;
  const hasPrevious = page > 1;
  const hasNext = to + 1 < total;

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
        <form className="mt-8 flex flex-col gap-3 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-4 shadow-lg shadow-[#4d5f52]/8 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm font-bold text-[#385245]">
            Search subscribers
            <input name="q" defaultValue={query} placeholder="First name or email" className="admin-input" />
          </label>
          <button type="submit" className="admin-primary-button min-h-12">Search</button>
          {query ? <Link href="/admin/subscribers" className="admin-secondary-button inline-flex min-h-12 items-center justify-center">Clear</Link> : null}
        </form>
        {error ? <p className="mt-6 text-sm font-bold text-[#a2472c]">Subscribers could not be loaded.</p> : null}
        <div className="mt-6 flex flex-col gap-3 text-sm font-bold text-[#607066] sm:flex-row sm:items-center sm:justify-between">
          <p>{total ? `Showing ${firstShown}-${lastShown} of ${total}` : "Showing 0 of 0"}{query ? ` for "${query}"` : ""}</p>
          <nav className="flex gap-2" aria-label="Subscriber pagination">
            {hasPrevious ? <Link href={pageHref(page - 1, query)} className="admin-secondary-button inline-flex min-h-10 items-center justify-center px-4">Previous</Link> : <span className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[#284a3b]/10 px-4 text-[#8a978f]">Previous</span>}
            {hasNext ? <Link href={pageHref(page + 1, query)} className="admin-secondary-button inline-flex min-h-10 items-center justify-center px-4">Next</Link> : <span className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[#284a3b]/10 px-4 text-[#8a978f]">Next</span>}
          </nav>
        </div>
        <section className="mt-6 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] shadow-lg shadow-[#4d5f52]/8">
          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              <div className="grid gap-4 border-b border-[#284a3b]/10 px-5 py-4 text-xs font-extrabold uppercase tracking-[0.14em] text-[#946332] md:grid-cols-[1fr_0.8fr_1fr_1fr_1fr_1fr]">
                <span>Subscriber</span><span>Status</span><span>Categories</span><span>Confirmed</span><span>Updated</span><span>Sender sync</span>
              </div>
              {rows.length ? rows.map((subscriber) => {
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
              }) : <p className="px-5 py-6 text-sm text-[#607066]">No subscribers found.</p>}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
