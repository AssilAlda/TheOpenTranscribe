"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { JobDocumentLike, JobStatus } from "@theopentranscribe/db";

import { apiRequest, ApiRequestError } from "@/lib/apiClient";

const POLL_INTERVAL_MS = 3000;
const TERMINAL_STATUSES: readonly JobStatus[] = ["COMPLETED", "FAILED"];

function isDocumentVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

export interface UseJobPollingResult {
  job: JobDocumentLike | null;
  isLoading: boolean;
  error: string | null;
  /** True when the error is permanent (invalid/unknown job_id) -- retrying won't help, so polling stops. */
  notFound: boolean;
}

/**
 * Polls GET /api/jobs/:jobId (~3s) while the job is QUEUED/PROCESSING,
 * stopping immediately once it reaches COMPLETED/FAILED. Pauses while the
 * tab is hidden and refreshes immediately on becoming visible again. A
 * fetch failure preserves the previously loaded job and keeps retrying.
 */
export function useJobPolling(jobId: string): UseJobPollingResult {
  const [job, setJob] = useState<JobDocumentLike | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const isFetchingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const statusRef = useRef<JobStatus | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleNext = useCallback(() => {
    clearTimer();
    if (!isDocumentVisible()) return;
    timerRef.current = setTimeout(() => {
      void poll();
    }, POLL_INTERVAL_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearTimer]);

  const poll = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const body = await apiRequest<{ data: JobDocumentLike }>(`/api/jobs/${jobId}`);
      if (!mountedRef.current) return;
      statusRef.current = body.data.status;
      setJob(body.data);
      setError(null);
      setNotFound(false);
      setIsLoading(false);
      if (!TERMINAL_STATUSES.includes(body.data.status) && isDocumentVisible()) {
        scheduleNext();
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Couldn't refresh this job.");
      setIsLoading(false);

      // A 400/404 on the job we're already tracking means the job_id itself
      // is invalid/unknown -- a permanent condition, not worth retrying
      // forever. Any other error (5xx, network) is treated as transient.
      const isPermanent = err instanceof ApiRequestError && (err.status === 400 || err.status === 404);
      if (isPermanent) {
        setNotFound(true);
        return;
      }

      const knownTerminal = statusRef.current !== null && TERMINAL_STATUSES.includes(statusRef.current);
      if (!knownTerminal && isDocumentVisible()) {
        scheduleNext();
      }
    } finally {
      isFetchingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, scheduleNext]);

  useEffect(() => {
    mountedRef.current = true;
    statusRef.current = null;
    setIsLoading(true);
    setJob(null);
    setError(null);
    setNotFound(false);
    void poll();

    function handleVisibilityChange() {
      if (isDocumentVisible()) {
        clearTimer();
        void poll();
      } else {
        clearTimer();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      mountedRef.current = false;
      clearTimer();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  return { job, isLoading, error, notFound };
}
