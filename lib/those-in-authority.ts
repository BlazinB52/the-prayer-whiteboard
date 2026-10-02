export const AUTHORITY_PHOTO_BUCKET = "authority-photos";
export const MAX_ACTIVE_LEADERS = 4;
export const AUTHORITY_PHOTO_SIZE = 600; // cropped square, in pixels
export const AUTHORITY_PHOTO_MAX_BYTES = 2 * 1024 * 1024;

export const LEADER_LIMITS = {
  name: 120,
  title: 120,
  photoAlt: 200,
  scriptureReference: 140,
  scriptureText: 1000,
  prayer: 300,
} as const;

export type AuthorityLeader = {
  id: string;
  name: string;
  title: string;
  photo_path: string | null;
  photo_alt: string | null;
  scripture_reference: string;
  scripture_text: string | null;
  prayer: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
  updated_by_name: string | null;
};

export type PublicAuthorityLeader = Pick<
  AuthorityLeader,
  "id" | "name" | "title" | "photo_path" | "photo_alt" | "scripture_reference" | "scripture_text" | "prayer" | "display_order"
>;

const PHOTO_PATH_PATTERN = /^leaders\/[0-9a-f-]{36}\.jpg$/;

export function isAuthorityPhotoPath(value: unknown): value is string {
  return typeof value === "string" && PHOTO_PATH_PATTERN.test(value);
}

export function authorityPhotoStoragePath(id: string) {
  return `leaders/${id}.jpg`;
}

// The bucket is public, so the URL is permanent. Each upload gets a new file
// name, so a replaced photo never shows a stale cached copy.
export function authorityPhotoUrl(path: string | null | undefined) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!path || !base || !isAuthorityPhotoPath(path)) return null;
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/${AUTHORITY_PHOTO_BUCKET}/${path}`;
}

export function leaderPhotoAlt(leader: Pick<AuthorityLeader, "name" | "photo_alt">) {
  return leader.photo_alt?.trim() || `Photo of ${leader.name}`;
}

export function isJpegBytes(bytes: Uint8Array) {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}
