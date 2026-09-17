/**
 * Derives a safe, user-facing PDF filename from a job's persisted
 * `input.media_path` and builds an injection-safe `Content-Disposition`
 * header value for it.
 *
 * `media_path` (e.g. "uploads/<job_id>__My_Recording.wav") is NOT the
 * untouched original client-supplied filename — packages/db's
 * `sanitizeFilenameSegment` already stripped it down to
 * `[a-zA-Z0-9._-]` and prefixed it with `<job_id>__` before it was ever
 * persisted (see packages/db/src/paths.ts). This module only ever works
 * with that already-sanitized stored segment, never a raw client value.
 */

const FALLBACK_FILENAME = "transcript.pdf";

/** Strips the `<job_id>__` prefix and file extension from a stored upload filename segment. */
function baseNameFromMediaPath(mediaPath: string): string {
  const segment = mediaPath.split("/").pop() ?? "";
  const withoutJobIdPrefix = segment.replace(
    /^[0-9a-fA-F-]{36}__/,
    "",
  );
  const lastDot = withoutJobIdPrefix.lastIndexOf(".");
  const withoutExtension =
    lastDot > 0 ? withoutJobIdPrefix.slice(0, lastDot) : withoutJobIdPrefix;
  return withoutExtension;
}

/** Builds a safe "<name>.pdf" filename from a job's stored media_path. Never throws. */
export function buildTranscriptPdfFilename(mediaPath: string): string {
  const base = baseNameFromMediaPath(mediaPath).trim();
  if (base.length === 0) {
    return FALLBACK_FILENAME;
  }
  // Defensive re-sanitization: the stored segment is already restricted to
  // [a-zA-Z0-9._-], but this function must never trust that invariant blindly.
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, "_");
  return safe.length > 0 ? `${safe}.pdf` : FALLBACK_FILENAME;
}

/**
 * Builds a safe `Content-Disposition: attachment` header value for the given
 * filename, per RFC 6266: an ASCII-only `filename=` fallback plus a
 * percent-encoded `filename*=UTF-8''...` extended value. Strips CR/LF and
 * other control characters and quote/backslash characters that could break
 * out of the header value, so a filename can never be used for header
 * injection or to smuggle a path fragment.
 */
export function buildContentDisposition(filename: string): string {
  const stripped = filename.replace(/[\r\n\x00-\x1f\x7f]/g, "").trim();
  const withoutSlashes = stripped.replace(/[/\\]/g, "_");
  const safeFilename = withoutSlashes.length > 0 ? withoutSlashes : FALLBACK_FILENAME;

  const asciiFallback = safeFilename
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(safeFilename);

  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
