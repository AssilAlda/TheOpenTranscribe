/**
 * Locked at Phase 5 phase start (docs/ARCHITECTURE.md §15). Application-level
 * allowlist, not a permanent record of provider capability — provider
 * capabilities may evolve independently of this list.
 */
export const ALLOWED_EXTENSIONS = [
  "mp3",
  "mp4",
  "mpeg",
  "mpga",
  "m4a",
  "wav",
  "webm",
] as const;

export type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number];

/** Locked at Phase 5 phase start: 100 MiB, an explicit v1 product/safety limit. */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export function extensionOf(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1 || lastDot === filename.length - 1) return "";
  return filename.slice(lastDot + 1).toLowerCase();
}

export function isAllowedExtension(filename: string): boolean {
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(extensionOf(filename));
}
