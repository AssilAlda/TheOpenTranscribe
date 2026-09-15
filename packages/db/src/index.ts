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
