export { jobs } from "./schema.js";
export type { JobRow, NewJobRow } from "./schema.js";

export { openDb } from "./client.js";
export type { DbClient, OpenDbOptions } from "./client.js";

export {
  jobDocumentToRow,
  rowToJobDocument,
  JobLifecycleError,
  JOB_STATUSES,
} from "./mapper.js";
export type { JobDocumentLike, JobStatus, JobRowValues } from "./mapper.js";

export {
  resolveDataDir,
  ensureDataDirLayout,
  dbFilePath,
  isDataDirRelativePath,
  resolveWithinDataDir,
  sanitizeFilenameSegment,
  buildUploadRelativePath,
  buildOutputRelativePath,
  PathSafetyError,
  DATA_DIR_DB_FILENAME,
  DATA_DIR_UPLOADS_SUBDIR,
  DATA_DIR_OUTPUTS_SUBDIR,
} from "./paths.js";

// Re-exported so consumers (e.g. the Phase 4 runner) building queries
// against `jobs` use this package's own drizzle-orm instance rather than
// installing a second copy — without a shared workspace root, two installed
// copies of drizzle-orm produce structurally-incompatible types for the
// same logical query-builder objects.
export { eq, and, sql } from "drizzle-orm";
