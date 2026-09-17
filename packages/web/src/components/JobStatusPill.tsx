import type { JobStatus } from "@theopentranscribe/db";

import styles from "./JobStatusPill.module.css";

const LABELS: Record<JobStatus, string> = {
  QUEUED: "Queued",
  PROCESSING: "Processing",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

const CLASS_NAMES: Record<JobStatus, string | undefined> = {
  QUEUED: styles.queued,
  PROCESSING: styles.processing,
  COMPLETED: styles.completed,
  FAILED: styles.failed,
};

export function JobStatusPill({ status }: { status: JobStatus }) {
  return (
    <span className={`${styles.pill} ${CLASS_NAMES[status] ?? ""}`}>
      <span className={styles.dot} aria-hidden="true" />
      {LABELS[status]}
    </span>
  );
}
