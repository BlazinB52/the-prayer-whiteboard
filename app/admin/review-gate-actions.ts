"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cleanReviewNote } from "@/lib/review-ready-email";
import { listActiveContentManagers, readRecipientIds } from "@/lib/review-recipients";
import { notifyContentManagers } from "@/lib/review-ready-send";
import { REVIEW_SUBJECTS, gateTableFor, type GatedKind } from "@/lib/review-subjects";
import { requireAdmin } from "@/lib/supabase/admin";
import { formatTeachingDateShort } from "@/lib/teaching-date";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Every kind with a gate (teachings, devotionals, teaching outlines) is listed in lib/review-subjects.ts.
type GateKind = GatedKind;

function pagePath(kind: GateKind, id: string) {
  return REVIEW_SUBJECTS[kind].adminPath(id);
}

// Where the Administrator pressed the button, when that is not the item's own page. A devotional is managed from its
// teaching's devotional page as well as from its own page, so the answer comes back to whichever one was used. Only that
// one page shape is accepted, so the value can never send anyone somewhere else.
const TEACHING_DEVOTIONAL_PAGE = /^\/admin\/teachings\/[0-9a-f-]{36}\/devotional$/i;

function landingPath(kind: GateKind, id: string, returnTo?: string) {
  return kind === "devotional" && returnTo && TEACHING_DEVOTIONAL_PAGE.test(returnTo) ? returnTo : pagePath(kind, id);
}

function refresh(kind: GateKind, id: string, returnTo?: string) {
  revalidatePath(pagePath(kind, id));
  revalidatePath(landingPath(kind, id, returnTo));
  revalidatePath(`/admin/cm/${REVIEW_SUBJECTS[kind].reviewFolder}`);
  revalidatePath("/admin/cm");
}

// The Administrator sends the draft to the Content Managers they ticked, with an optional note. The first send opens the gate;
// sending again later reaches the Content Managers who were not ticked before. Only people who did not have it yet are
// emailed, so pressing it twice never emails anyone twice. Taking it back closes it for everybody.
export async function sendForReview(kind: GateKind, id: string, returnTo: string | undefined, formData?: FormData) {
  if (!UUID_PATTERN.test(id)) redirect("/admin");
  const { supabase, user } = await requireAdmin();
  const table = gateTableFor(kind);
  const landing = landingPath(kind, id, returnTo);

  const managers = await listActiveContentManagers();
  const allowed = new Map(managers.map((person) => [person.userId, person.name]));
  const chosen = readRecipientIds(formData).filter((userId) => allowed.has(userId));
  if (chosen.length === 0) redirect(`${landing}?review=nopick`);

  const { data: item, error: itemError } = await supabase.from(table).select("id, title, status, sent_for_review_at").eq("id", id).maybeSingle();
  if (itemError) redirect(`${landing}?review=error`);
  if (!item || item.status !== "draft") redirect(`${landing}?review=error`);
  const opening = !item.sent_for_review_at;

  // Who already has it. Rows left from a round that was closed do not count.
  let already = new Set<string>();
  if (opening) {
    await supabase.from("content_review_recipients").delete().eq("subject_type", kind).eq("subject_id", id);
  } else {
    const { data: rows } = await supabase.from("content_review_recipients").select("user_id").eq("subject_type", kind).eq("subject_id", id);
    already = new Set((rows ?? []).map((row) => String(row.user_id)));
  }
  const additions = chosen.filter((userId) => !already.has(userId));
  if (additions.length === 0) redirect(`${landing}?review=already`);

  // The people are recorded first, so the moment the gate opens it opens only for them.
  const sentAt = new Date().toISOString();
  const { error: recipientError } = await supabase
    .from("content_review_recipients")
    .insert(additions.map((userId) => ({ subject_type: kind, subject_id: id, user_id: userId, user_name: allowed.get(userId) ?? null, sent_at: sentAt })));
  if (recipientError) redirect(`${landing}?review=error`);

  if (opening) {
    const { data: opened, error } = await supabase
      .from(table)
      .update({ sent_for_review_at: sentAt })
      .eq("id", id)
      .eq("status", "draft")
      .is("sent_for_review_at", null)
      .select("id")
      .maybeSingle();
    if (error || !opened) {
      await supabase.from("content_review_recipients").delete().eq("subject_type", kind).eq("subject_id", id).in("user_id", additions);
      redirect(`${landing}?review=${error ? "error" : "already"}`);
    }
  }

  const { data: me } = await supabase.from("admin_authorizations").select("display_name").eq("user_id", user.id).maybeSingle();
  // A handout is named with the date of the teaching it goes with, so the email makes clear which one.
  let title = String(item.title ?? "");
  if (kind === "handout") {
    const { data: handout } = await supabase.from("teaching_handouts").select("gathering_date").eq("id", id).maybeSingle();
    if (handout?.gathering_date) title = `${title} (teaching of ${formatTeachingDateShort(handout.gathering_date)})`;
  }
  const notified = await notifyContentManagers({ kind, id, title, senderName: me?.display_name ?? null, note: cleanReviewNote(formData?.get("note")), onlyUserIds: additions });

  refresh(kind, id, returnTo);
  const outcome = notified.recipients === 0 ? "nocm" : notified.failed > 0 ? "partial" : "sent";
  redirect(`${landing}?review=${outcome}&mailed=${notified.sent}&of=${notified.recipients}`);
}

// Closes the gate again. Proposals already submitted stay for the Administrator to decide; a Content
// Manager's unfinished draft is hidden from them until it is sent again.
export async function takeBackFromReview(kind: GateKind, id: string, returnTo?: string) {
  if (!UUID_PATTERN.test(id)) redirect("/admin");
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase
    .from(gateTableFor(kind))
    .update({ sent_for_review_at: null })
    .eq("id", id)
    .eq("status", "draft")
    .not("sent_for_review_at", "is", null)
    .select("id")
    .maybeSingle();
  if (error || !data) redirect(`${landingPath(kind, id, returnTo)}?review=error`);

  refresh(kind, id, returnTo);
  redirect(`${landingPath(kind, id, returnTo)}?review=takenback`);
}
