"use client";

import Link from "next/link";

import { JobStatusDetail } from "./JobStatusDetail";
import styles from "./JobDetailFallbackPage.module.css";

/**
 * The direct-URL/bookmark/refresh fallback for /jobs/[jobId]. The normal
 * interaction is the JobDetailModal from Transcribed Files -- this route
 * stays functional on its own (no page chrome duplicated from the modal;
 * reuses the exact same JobStatusDetail, no forked status/result logic).
 */
export function JobDetailFallbackPage({ jobId }: { jobId: string }) {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.topRow}>
          <h1 className={styles.eyebrow}>Job detail</h1>
          <Link href="/files" className={styles.backLink}>
            ← Back to Transcribed Files
          </Link>
        </div>

        <JobStatusDetail jobId={jobId} />
      </div>
    </div>
  );
}
