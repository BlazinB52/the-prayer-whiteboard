"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/admin";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { normalizeHexColor, WHITEBOARD_CARD_BACK_KEY, WHITEBOARD_CARD_FRONT_KEY } from "@/lib/whiteboard-card-colors";

type FormState = { error?: string; saved?: boolean; reset?: boolean };

export async function saveWhiteboardCardColors(_: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const client = createServiceRoleClient();
  if (!client) return { error: "Colors could not be saved." };

  if (formData.get("intent") === "reset") {
    const { error } = await client.from("site_settings").delete().in("key", [WHITEBOARD_CARD_FRONT_KEY, WHITEBOARD_CARD_BACK_KEY]);
    if (error) return { error: "Colors could not be reset." };
    revalidatePath("/");
    revalidatePath("/espanol");
    revalidatePath("/admin");
    return { reset: true };
  }

  const front = normalizeHexColor(formData.get("front"));
  const back = normalizeHexColor(formData.get("back"));
  if (!front || !back) return { error: "Choose a valid color for both cards." };

  const { error } = await client.from("site_settings").upsert([
    { key: WHITEBOARD_CARD_FRONT_KEY, value: front, updated_at: new Date().toISOString() },
    { key: WHITEBOARD_CARD_BACK_KEY, value: back, updated_at: new Date().toISOString() },
  ]);
  if (error) return { error: "Colors could not be saved." };
  revalidatePath("/");
  revalidatePath("/espanol");
  revalidatePath("/admin");
  return { saved: true };
}
