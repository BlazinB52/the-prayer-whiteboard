import { PRINTABLE_PDF_BUCKET, isValidPdfMagicBytes } from "./printable-pdf-links.ts";

const VERIFY_FETCH_TIMEOUT_MS = 15_000;

type PublicUrlClient = {
  storage: {
    from(bucket: string): {
      getPublicUrl(path: string): { data: { publicUrl: string } };
    };
  };
};

// Verifies the uploaded object is really a PDF by reading only its first
// bytes over HTTP (the bucket is public, so a plain Range request works),
// instead of supabase.storage.download(), which would pull the whole file
// through the Next.js server's memory and defeat the point of uploading
// directly from the browser to storage. Bounded by an explicit timeout so a
// slow or unresponsive fetch can never leave the save action hanging
// forever — it fails with a clear error the admin can retry instead.
export async function verifyUploadedPdf(supabase: PublicUrlClient, path: string) {
  const { data } = supabase.storage.from(PRINTABLE_PDF_BUCKET).getPublicUrl(path);
  let response: Response;
  try {
    response = await fetch(data.publicUrl, {
      headers: { Range: "bytes=0-4" },
      signal: AbortSignal.timeout(VERIFY_FETCH_TIMEOUT_MS),
    });
  } catch {
    return false;
  }
  if (!response.ok || !response.body) return false;

  // Read directly off the stream and stop at 5 bytes, in case the server
  // doesn't honor the Range header and would otherwise send the full file.
  const reader = response.body.getReader();
  try {
    const collected: number[] = [];
    while (collected.length < 5) {
      const { done, value } = await reader.read();
      if (done) break;
      collected.push(...value);
    }
    return isValidPdfMagicBytes(new Uint8Array(collected));
  } finally {
    await reader.cancel().catch(() => {});
  }
}
