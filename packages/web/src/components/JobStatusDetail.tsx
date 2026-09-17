"use client";

import { useJobPolling } from "@/hooks/useJobPolling";

import { JobStatusPill } from "./JobStatusPill";
import styles from "./JobStatusDetail.module.css";
import { TranscriptReader } from "./TranscriptReader";

function filenameFromMediaPath(mediaPath: string): string {
  const segment = mediaPath.split("/").pop() ?? mediaPath;
  return segment.replace(/^[0-9a-fA-F-]{36}__/, "");
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Safe, product-facing copy for a FAILED job. The persisted `error.message`
 * (raw runner/subprocess/provider diagnostics -- may include stderr,
 * tracebacks, or filesystem paths) is never rendered anywhere in this UI,
 * not even behind a disclosure -- it stays available internally in the
 * database/logging layer only.
 */
const FAILED_HEADLINE = "Transcription couldn't be completed.";
const FAILED_BODY = "Check the service logs for more information, then try again when the issue is resolved.";

function QueuedIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 7.5v4.5l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ProcessingIcon() {
  return (
    <span className={styles.processingIcon} aria-hidden="true">
      <span className={styles.processingBar} />
      <span className={styles.processingBar} />
      <span className={styles.processingBar} />
    </span>
  );
}

function FailedIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function StatusState({
  tone,
  icon,
  headline,
  body,
}: {
  tone: "queued" | "processing";
  icon: React.ReactNode;
  headline: string;
  body: string;
}) {
  return (
    <div className={`${styles.stateSurface} ${styles[tone]}`}>
      <span className={styles.stateIconBadge}>{icon}</span>
      <div className={styles.stateText}>
        <p className={styles.stateHeadline}>{headline}</p>
        <p className={styles.stateBody}>{body}</p>
      </div>
    </div>
  );
}

function FailedState({ error }: { error: { occurred_at: string } }) {
  return (
    <div className={`${styles.stateSurface} ${styles.failed}`} role="alert">
      <span className={styles.stateIconBadge}>
        <FailedIcon />
      </span>
      <div className={styles.stateText}>
        <p className={styles.stateHeadline}>{FAILED_HEADLINE}</p>
        <p className={styles.stateBody}>{FAILED_BODY}</p>
        <p className={styles.stateTimestamp}>{formatDateTime(error.occurred_at)}</p>
      </div>
    </div>
  );
}

/**
 * The reusable job status/result presentation -- shared verbatim by the
 * JobDetailModal (normal interaction, opened from Transcribed Files) and
 * the direct /jobs/[jobId] fallback route. No page chrome (no <main>,
 * container, Brand, or back-link) -- callers own that. Polls its own status
 * via useJobPolling, same as before the shell split.
 */
export function JobStatusDetail({ jobId }: { jobId: string }) {
  const { job, isLoading, error, notFound } = useJobPolling(jobId);

  return (
    <div className={styles.root}>
      {isLoading && !job && (
        <div className={styles.loadingCard} aria-hidden="true">
          <div className={styles.skeletonLine} style={{ width: "40%", height: 24 }} />
          <div className={styles.skeletonLine} style={{ width: "60%" }} />
        </div>
      )}

      {notFound && (
        <div className={styles.notFoundCard}>
          <p className={styles.notFoundTitle}>Job not found</p>
          <p className={styles.notFoundBody}>
            This job doesn&rsquo;t exist, or the link may be incorrect.
          </p>
        </div>
      )}

      {job && (
        <>
          <header className={styles.header}>
            <h2 className={styles.title}>{filenameFromMediaPath(job.input.media_path)}</h2>
            <div className={styles.metaRow}>
              <JobStatusPill status={job.status} />
              <span className={styles.metaText}>Created {formatDateTime(job.created_at)}</span>
              {job.input.language && (
                <span className={styles.metaText}>Language: {job.input.language}</span>
              )}
            </div>
          </header>

          {error && (
            <p className={styles.degradedNotice} role="status">
              Having trouble refreshing this job&rsquo;s status — showing the last known state.
            </p>
          )}

          {job.status === "QUEUED" && (
            <StatusState
              tone="queued"
              icon={<QueuedIcon />}
              headline="Waiting to start"
              body="Your transcription will begin shortly."
            />
          )}

          {job.status === "PROCESSING" && (
            <StatusState
              tone="processing"
              icon={<ProcessingIcon />}
              headline="Transcribing your file"
              body="This can take a little while for longer files."
            />
          )}

          {job.status === "FAILED" && job.error && <FailedState error={job.error} />}

          {job.status === "COMPLETED" && <TranscriptReader jobId={job.job_id} />}
        </>
      )}
    </div>
  );
}
