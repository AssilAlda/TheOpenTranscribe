import { randomBytes } from "node:crypto";

import { DATA_DIR_UPLOADS_SUBDIR } from "@theopentranscribe/db";

/**
 * A distinctive temp-upload filename pattern (leading dot + "tmp-" prefix),
 * inside the same uploads/ subdirectory as the final upload path so the
 * eventual rename to the final path is same-filesystem/atomic. Distinctive on
 * purpose: a future startup-cleanup pass can identify abandoned temp uploads
 * left behind by a hard process crash without touching real
 * `<job_id>__<safe_filename>` uploads.
 */
export function buildTempUploadRelativePath(jobId: string): string {
  const random = randomBytes(8).toString("hex");
  return `${DATA_DIR_UPLOADS_SUBDIR}/.tmp-${jobId}-${random}`;
}
