import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { normalizeHexColor, WHITEBOARD_CARD_BACK_KEY, WHITEBOARD_CARD_FRONT_KEY, type WhiteboardCardColors } from "@/lib/whiteboard-card-colors";

// A missing table, missing key or any error leaves the color null so the page keeps its built-in look.
export async function loadWhiteboardCardColors(): Promise<WhiteboardCardColors> {
  const colors: WhiteboardCardColors = { front: null, back: null };
  try {
    const client = createServiceRoleClient();
    if (!client) return colors;
    const { data, error } = await client.from("site_settings").select("key, value").in("key", [WHITEBOARD_CARD_FRONT_KEY, WHITEBOARD_CARD_BACK_KEY]);
    if (error) return colors;
    for (const row of data ?? []) {
      if (row.key === WHITEBOARD_CARD_FRONT_KEY) colors.front = normalizeHexColor(row.value);
      if (row.key === WHITEBOARD_CARD_BACK_KEY) colors.back = normalizeHexColor(row.value);
    }
  } catch {
    // Colors are cosmetic; never let them break the homepage.
  }
  return colors;
}
