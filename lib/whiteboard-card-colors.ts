export const WHITEBOARD_CARD_FRONT_KEY = "whiteboard_card_front_color";
export const WHITEBOARD_CARD_BACK_KEY = "whiteboard_card_back_color";

// What the cards look like when nothing has been saved: the front card is this color; the back card is the tan
// shape (#bb7a3c at 18%) whose closest solid color over the cream page is shown in the picker.
export const DEFAULT_FRONT_CARD_COLOR = "#fafafa";
export const DEFAULT_BACK_CARD_PICKER_COLOR = "#ecdcc9";

export type WhiteboardCardColors = { front: string | null; back: string | null };

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function normalizeHexColor(value: unknown): string | null {
  const color = String(value ?? "").trim().toLowerCase();
  return HEX_COLOR.test(color) ? color : null;
}

// An unset color returns no style, so the page's own classes (the original look) apply.
export function whiteboardCardStyles(colors: WhiteboardCardColors) {
  return {
    front: colors.front ? { backgroundColor: colors.front } : undefined,
    back: colors.back ? { backgroundColor: colors.back } : undefined,
  };
}
