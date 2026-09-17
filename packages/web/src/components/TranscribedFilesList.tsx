"use client";

import type { JobDocumentLike } from "@theopentranscribe/db";

import { useJobsPolling } from "@/hooks/useJobsPolling";

import { JobStatusPill } from "./JobStatusPill";
import styles from "./TranscribedFilesList.module.css";

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSeconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSeconds < 5) return "just now";
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

function filenameFromMediaPath(mediaPath: string): string {
  const segment = mediaPath.split("/").pop() ?? mediaPath;
  return segment.replace(/^[0-9a-fA-F-]{36}__/, "");
}

function isModifiedClick(event: React.MouseEvent): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button === 1;
}

interface JobRowProps {
  job: JobDocumentLike;
  onOpen: (jobId: string, triggerElement: HTMLElement) => void;
}

function JobRow({ job, onOpen }: JobRowProps) {
  return (
    <li>
      <a
        href={`/jobs/${job.job_id}`}
        className={styles.row}
        onClick={(event) => {
          if (isModifiedClick(event)) return; // let the browser handle new-tab/save-link/etc. normally
          event.preventDefault();
          onOpen(job.job_id, event.currentTarget);
        }}
      >
        <div className={styles.rowPrimary}>
          <p className={styles.rowFilename}>{filenameFromMediaPath(job.input.media_path)}</p>
          <p className={styles.rowMeta}>
            {formatRelativeTime(job.created_at)}
            {job.input.language ? ` · ${job.input.language}` : ""}
          </p>
        </div>
        <div className={styles.rowStatus}>
          <JobStatusPill status={job.status} />
        </div>
      </a>
    </li>
  );
}

export interface TranscribedFilesListProps {
  onOpenJob: (jobId: string, triggerElement: HTMLElement) => void;
  headingId?: string;
}

export function TranscribedFilesList({ onOpenJob, headingId }: TranscribedFilesListProps) {
  const { jobs, isLoading, isLoadingMore, hasMore, error, loadMore } = useJobsPolling();

  return (
    <section className={styles.panel} aria-labelledby={headingId}>
      {isLoading && jobs.length === 0 && (
        <ul className={styles.list} aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className={styles.skeletonRow}>
              <div className={styles.skeletonLine} style={{ width: "45%" }} />
              <div className={styles.skeletonPill} />
            </li>
          ))}
        </ul>
      )}

      {!isLoading && jobs.length === 0 && !error && (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No transcriptions yet</p>
          <p className={styles.emptyBody}>Files you transcribe will show up here.</p>
        </div>
      )}

      {jobs.length > 0 && (
        <ul className={styles.list}>
          {jobs.map((job) => (
            <JobRow key={job.job_id} job={job} onOpen={onOpenJob} />
          ))}
        </ul>
      )}

      {hasMore && (
        <div className={styles.loadMoreRow}>
          <button
            type="button"
            className={styles.loadMoreButton}
            onClick={loadMore}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}

      {error && (
        <p className={styles.degradedNotice} role="status">
          Having trouble refreshing the list — showing the last known state.
        </p>
      )}
    </section>
  );
}
