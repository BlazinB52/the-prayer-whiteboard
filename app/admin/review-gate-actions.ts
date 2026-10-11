"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { notifyContentManagers } from "@/lib/review-ready-send";
import { requireAdmin } from "@/lib/supabase/admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type GateKind = "teaching" | "devotional";

const TABLE: Record<GateKind, "teachings" | "teaching_devotionals"> = { teaching: "teachings", devotional: "teaching_devotionals" };

function pagePath(kind: GateKind, id: string) {
  return kind === "teaching" ? `/admin/teachings/${id}/edit` : `/admin/devotionals/${id}`;
}

function refresh(kind: GateKind, id: string) {
  revalidatePath(pagePath(kind, id));
  revalidatePath(kind === "teaching" ? "/admin/cm/teaching-review" : "/admin/cm/devotional-review");
  revalidatePath("/admin/cm");
}

// The Administrator opens the gate: the draft appears in the Content Managers' list, and they are emailed.
// Only a draft that has not been sent can be sent, so pressing it twice never emails anyone twice.
export async function sendForReview(kind: GateKind, id: string) {
  if (!UUID_PATTERN.test(id)) redirect("/admin");
  const { supabase, user } = await requireAdmin();
  const table = TABLE[kind];

  const { data, error } = await supabase
    .from(table)
    .update({ sent_for_review_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "draft")
    .is("sent_for_review_at", null)
    .select("id, title")
    .maybeSingle();
  if (error) redirect(`${pagePath(kind, id)}?review=error`);
  if (!data) redirect(`${pagePath(kind, id)}?review=already`);

  const { data: me } = await supabase.from("admin_authorizations").select("display_name").eq("user_id", user.id).maybeSingle();
  const notified = await notifyContentManagers({ kind, id, title: String(data.title ?? ""), senderName: me?.display_name ?? null });

  refresh(kind, id);
  const outcome = notified.recipients === 0 ? "nocm" : notified.failed > 0 ? "partial" : "sent";
  redirect(`${pagePath(kind, id)}?review=${outcome}&mailed=${notified.sent}&of=${notified.recipients}`);
}

// Closes the gate again. Proposals already submitted stay for the Administrator to decide; a Content
// Manager's unfinished draft is hidden from them until it is sent again.
export async function takeBackFromReview(kind: GateKind, id: string) {
  if (!UUID_PATTERN.test(id)) redirect("/admin");
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase
    .from(TABLE[kind])
    .update({ sent_for_review_at: null })
    .eq("id", id)
    .eq("status", "draft")
    .not("sent_for_review_at", "is", null)
    .select("id")
    .maybeSingle();
  if (error || !data) redirect(`${pagePath(kind, id)}?review=error`);

  refresh(kind, id);
  redirect(`${pagePath(kind, id)}?review=takenback`);
}
