"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { JobDocumentLike, JobStatus } from "@theopentranscribe/db";

import { apiRequest } from "@/lib/apiClient";

const PAGE_SIZE = 20;
const POLL_INTERVAL_MS = 5000;
const ACTIVE_STATUSES: readonly JobStatus[] = ["QUEUED", "PROCESSING"];

function isActive(job: JobDocumentLike): boolean {
  return ACTIVE_STATUSES.includes(job.status);
}

function hasActiveJob(jobs: readonly JobDocumentLike[]): boolean {
  return jobs.some(isActive);
}

function isDocumentVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

/**
 * Merges a freshly-refetched first page into the full accumulated list.
 * Exported for direct unit testing. Never reorders an already-loaded job --
 * a job's created_at (and therefore its sort position) never changes, so
 * existing rows only ever get their fields updated in place; the only way
 * ordering changes is a brand-new job appearing, which is prepended.
 */
export function mergeFirstPageRefresh(
  loaded: readonly JobDocumentLike[],
  refreshedFirstPage: readonly JobDocumentLike[],
): JobDocumentLike[] {
  const refreshedById = new Map(refreshedFirstPage.map((job) => [job.job_id, job]));
  const updatedInPlace = loaded.map((job) => refreshedById.get(job.job_id) ?? job);
  const loadedIds = new Set(loaded.map((job) => job.job_id));
  const brandNew = refreshedFirstPage.filter((job) => !loadedIds.has(job.job_id));
  return [...brandNew, ...updatedInPlace];
}

interface OutOfPageEntry {
  timerId: ReturnType<typeof setTimeout> | null;
  isFetching: boolean;
}

export interface UseJobsPollingResult {
  /** Full accumulated list across every loaded page. */
  jobs: JobDocumentLike[];
  /** True only during the very first fetch. */
  isLoading: boolean;
  /** True while a loadMore() fetch is in flight. */
  isLoadingMore: boolean;
  /** More history is available beyond what's currently loaded. */
  hasMore: boolean;
  error: string | null;
  /** Fetches the next page (offset = jobs.length) and appends it. */
  loadMore: () => void;
  /** Re-fetches the first page immediately (e.g. right after an upload). */
  refresh: () => void;
}

/**
 * Backs Transcribed Files: paginated ("Load more") history plus live
 * status for every *visible/relevant* active job -- not only ones that
 * happen to still be on the first page.
 *
 * Two independent polling mechanisms:
 * 1. First-page polling (~5s while the first page itself has an active
 *    job): re-fetches offset=0/limit=20 and merges it via
 *    `mergeFirstPageRefresh` -- never touches `loadMore()`-loaded history.
 * 2. The out-of-page tracker: any loaded QUEUED/PROCESSING job that isn't
 *    covered by the most recent first-page result gets its own individual
 *    ~5s `GET /api/jobs/:jobId` poll, so it keeps updating regardless of
 *    which page it's on. Reconciled (jobs enrolled/removed) after every
 *    event that can change the loaded set or the first-page result:
 *    the initial load, a first-page refresh/refresh(), and loadMore().
 *    This is what makes an older active job revealed by "Load more" start
 *    updating immediately, rather than waiting for an unrelated first-page
 *    event that may never come.
 */
export function useJobsPolling(): UseJobsPollingResult {
  const [jobs, setJobs] = useState<JobDocumentLike[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const jobsRef = useRef<JobDocumentLike[]>([]);
  const firstPageIdsRef = useRef<Set<string>>(new Set());
  const isFetchingFirstPageRef = useRef(false);
  const firstPageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const outOfPageRef = useRef<Map<string, OutOfPageEntry>>(new Map());

  const setJobsAndRef = useCallback((next: JobDocumentLike[]) => {
    jobsRef.current = next;
    setJobs(next);
  }, []);

  // --- out-of-page tracker -------------------------------------------------

  const stopOutOfPageTracking = useCallback((jobId: string) => {
    const entry = outOfPageRef.current.get(jobId);
    if (entry?.timerId != null) clearTimeout(entry.timerId);
    outOfPageRef.current.delete(jobId);
  }, []);

  const tickOutOfPageJob = useCallback(
    async (jobId: string) => {
      const entry = outOfPageRef.current.get(jobId);
      if (!entry) return; // stopped before this tick fired
      entry.timerId = null;
      entry.isFetching = true;

      try {
        const body = await apiRequest<{ data: JobDocumentLike }>(`/api/jobs/${jobId}`);
        if (!mountedRef.current || !outOfPageRef.current.has(jobId)) return;

        setJobsAndRef(jobsRef.current.map((job) => (job.job_id === jobId ? body.data : job)));

        if (!isActive(body.data)) {
          stopOutOfPageTracking(jobId);
          return;
        }
      } catch {
        // Transient error: keep tracking, just retry on the next tick.
      }

      const stillTracked = outOfPageRef.current.get(jobId);
      if (stillTracked) {
        stillTracked.isFetching = false;
        if (isDocumentVisible()) {
          stillTracked.timerId = setTimeout(() => {
            void tickOutOfPageJob(jobId);
          }, POLL_INTERVAL_MS);
        }
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [setJobsAndRef, stopOutOfPageTracking],
  );

  const startOutOfPageTracking = useCallback(
    (jobId: string) => {
      outOfPageRef.current.set(jobId, { timerId: null, isFetching: true });
      void tickOutOfPageJob(jobId);
    },
    [tickOutOfPageJob],
  );

  /** Enrolls newly-stale-active jobs, stops ones no longer needed. Called after any event that can change `jobs` or the first-page result. */
  const reconcileOutOfPageTracker = useCallback(() => {
    const current = jobsRef.current;
    const firstPageIds = firstPageIdsRef.current;

    for (const jobId of [...outOfPageRef.current.keys()]) {
      const job = current.find((j) => j.job_id === jobId);
      const stillNeedsTracking = job !== undefined && isActive(job) && !firstPageIds.has(jobId);
      if (!stillNeedsTracking) stopOutOfPageTracking(jobId);
    }

    for (const job of current) {
      if (isActive(job) && !firstPageIds.has(job.job_id) && !outOfPageRef.current.has(job.job_id)) {
        startOutOfPageTracking(job.job_id);
      }
    }
  }, [startOutOfPageTracking, stopOutOfPageTracking]);

  // --- first-page polling ---------------------------------------------------

  const clearFirstPageTimer = useCallback(() => {
    if (firstPageTimerRef.current !== null) {
      clearTimeout(firstPageTimerRef.current);
      firstPageTimerRef.current = null;
    }
  }, []);

  const scheduleFirstPagePoll = useCallback(() => {
    clearFirstPageTimer();
    if (!isDocumentVisible()) return;
    firstPageTimerRef.current = setTimeout(() => {
      void pollFirstPage();
    }, POLL_INTERVAL_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearFirstPageTimer]);

  const pollFirstPage = useCallback(async () => {
    if (isFetchingFirstPageRef.current) return;
    isFetchingFirstPageRef.current = true;
    try {
      const body = await apiRequest<{ data: JobDocumentLike[]; pagination: { total: number } }>(
        `/api/jobs?limit=${PAGE_SIZE}&offset=0`,
      );
      if (!mountedRef.current) return;

      firstPageIdsRef.current = new Set(body.data.map((job) => job.job_id));
      const merged = mergeFirstPageRefresh(jobsRef.current, body.data);
      setJobsAndRef(merged);
      setHasMore(merged.length < body.pagination.total);
      setError(null);
      setIsLoading(false);

      reconcileOutOfPageTracker();

      if (hasActiveJob(body.data) && isDocumentVisible()) {
        scheduleFirstPagePoll();
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Couldn't refresh the job list.");
      setIsLoading(false);
      if (isDocumentVisible()) {
        scheduleFirstPagePoll();
      }
    } finally {
      isFetchingFirstPageRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reconcileOutOfPageTracker, scheduleFirstPagePoll, setJobsAndRef]);

  const refresh = useCallback(() => {
    clearFirstPageTimer();
    void pollFirstPage();
  }, [clearFirstPageTimer, pollFirstPage]);

  // --- load more -------------------------------------------------------------

  const loadMore = useCallback(() => {
    if (isLoadingMore) return;
    setIsLoadingMore(true);

    void (async () => {
      try {
        const offset = jobsRef.current.length;
        const body = await apiRequest<{ data: JobDocumentLike[]; pagination: { total: number } }>(
          `/api/jobs?limit=${PAGE_SIZE}&offset=${offset}`,
        );
        if (!mountedRef.current) return;

        const next = [...jobsRef.current, ...body.data];
        setJobsAndRef(next);
        setHasMore(next.length < body.pagination.total);
        reconcileOutOfPageTracker(); // an older active job just revealed by Load more starts tracking now
      } catch (err) {
        if (!mountedRef.current) return;
        setError(err instanceof Error ? err.message : "Couldn't load more jobs.");
      } finally {
        if (mountedRef.current) setIsLoadingMore(false);
      }
    })();
  }, [isLoadingMore, reconcileOutOfPageTracker, setJobsAndRef]);

  // --- lifecycle ---------------------------------------------------------------

  useEffect(() => {
    mountedRef.current = true;
    void pollFirstPage();

    function handleVisibilityChange() {
      if (isDocumentVisible()) {
        clearFirstPageTimer();
        void pollFirstPage();

        for (const [jobId, entry] of outOfPageRef.current) {
          if (!entry.isFetching && entry.timerId === null) {
            void tickOutOfPageJob(jobId);
          }
        }
      } else {
        clearFirstPageTimer();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      mountedRef.current = false;
      clearFirstPageTimer();
      for (const jobId of [...outOfPageRef.current.keys()]) stopOutOfPageTracking(jobId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { jobs, isLoading, isLoadingMore, hasMore, error, loadMore, refresh };
}
