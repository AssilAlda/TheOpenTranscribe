// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mergeFirstPageRefresh, useJobsPolling } from "@/hooks/useJobsPolling";

function makeJob(
  i: number,
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED",
  overrides: Record<string, unknown> = {},
) {
  return {
    schema_version: 1,
    job_id: `1111111${i}-1111-4111-8111-111111111111`,
    status,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    input: { media_path: `uploads/x__file${i}.wav` },
    result: status === "COMPLETED" ? { output_path: "x", completed_at: "2026-01-01T00:00:00.000Z" } : null,
    error: null,
    ...overrides,
  };
}

function jobsResponse(
  statuses: Array<"QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED">,
  total = statuses.length,
  offset = 0,
) {
  return {
    ok: true,
    json: async () => ({
      data: statuses.map((status, i) => makeJob(i, status)),
      pagination: { limit: 20, offset, total },
    }),
  };
}

function jobResponse(i: number, status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED") {
  return { ok: true, json: async () => ({ data: makeJob(i, status) }) };
}

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("useJobsPolling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("fetches immediately on mount", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jobsResponse(["QUEUED"]));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useJobsPolling());
    await flush();

    expect(result.current.jobs).toHaveLength(1);
    expect(result.current.isLoading).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps polling (~5s) while an active job is present and stops once all jobs are terminal", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jobsResponse(["QUEUED"]))
      .mockResolvedValueOnce(jobsResponse(["PROCESSING"]))
      .mockResolvedValueOnce(jobsResponse(["COMPLETED"]));
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() => useJobsPolling());
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await advance(5000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await advance(5000);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // All jobs are now terminal -- no further polling.
    await advance(20_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not schedule polling when the initial load has no active jobs", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jobsResponse(["COMPLETED", "FAILED"]));
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() => useJobsPolling());
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await advance(20_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("preserves previously loaded jobs and keeps retrying after a fetch error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jobsResponse(["QUEUED"]))
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(jobsResponse(["COMPLETED"]));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useJobsPolling());
    await flush();
    expect(result.current.jobs[0]?.status).toBe("QUEUED");

    await advance(5000);
    expect(result.current.error).toBeTruthy();
    // Previously loaded data is preserved, not cleared, on a failed refresh.
    expect(result.current.jobs[0]?.status).toBe("QUEUED");

    await advance(5000);
    expect(result.current.error).toBeNull();
    expect(result.current.jobs[0]?.status).toBe("COMPLETED");
  });

  it("refresh() fetches immediately without waiting for the next interval, e.g. right after an upload", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jobsResponse([]))
      .mockResolvedValueOnce(jobsResponse(["QUEUED"]));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useJobsPolling());
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.jobs).toHaveLength(0);

    await act(async () => {
      result.current.refresh();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.jobs).toHaveLength(1);
  });
});

describe("mergeFirstPageRefresh (pure function)", () => {
  it("updates an existing job's fields in place without moving its position", () => {
    const loaded = [makeJob(0, "PROCESSING"), makeJob(1, "QUEUED")];
    const refreshed = [makeJob(0, "COMPLETED"), makeJob(1, "QUEUED")];

    const merged = mergeFirstPageRefresh(loaded, refreshed);

    expect(merged.map((j) => j.job_id)).toEqual(loaded.map((j) => j.job_id));
    expect(merged[0]?.status).toBe("COMPLETED");
  });

  it("prepends genuinely new jobs at the top, never reordering existing ones", () => {
    const loaded = [makeJob(0, "QUEUED"), makeJob(1, "COMPLETED")];
    const refreshed = [makeJob(2, "QUEUED"), makeJob(0, "QUEUED")]; // job 2 is brand new

    const merged = mergeFirstPageRefresh(loaded, refreshed);

    expect(merged.map((j) => j.job_id)).toEqual([
      "11111112-1111-4111-8111-111111111111",
      "11111110-1111-4111-8111-111111111111",
      "11111111-1111-4111-8111-111111111111",
    ]);
  });

  it("never duplicates a job_id", () => {
    const loaded = [makeJob(0, "QUEUED")];
    const refreshed = [makeJob(0, "PROCESSING")];

    const merged = mergeFirstPageRefresh(loaded, refreshed);

    expect(merged).toHaveLength(1);
  });
});

describe("useJobsPolling: loadMore / pagination", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("hasMore reflects pagination.total vs. loaded jobs.length", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jobsResponse(["COMPLETED"], 5)));

    const { result } = renderHook(() => useJobsPolling());
    await flush();

    expect(result.current.hasMore).toBe(true);
  });

  it("loadMore() appends the next page without touching already-loaded rows, and updates hasMore", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jobsResponse(["COMPLETED"], 2, 0))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [makeJob(1, "FAILED")], pagination: { limit: 20, offset: 1, total: 2 } }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useJobsPolling());
    await flush();
    expect(result.current.jobs).toHaveLength(1);
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      result.current.loadMore();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.jobs).toHaveLength(2);
    expect(result.current.jobs[0]?.job_id).toBe("11111110-1111-4111-8111-111111111111"); // original row untouched, still first
    expect(result.current.jobs[1]?.job_id).toBe("11111111-1111-4111-8111-111111111111");
    expect(result.current.hasMore).toBe(false);
  });

  it("a periodic first-page poll tick does not reset or duplicate loadMore()-loaded history", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jobsResponse(["QUEUED"], 2, 0)) // initial first page
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [makeJob(1, "COMPLETED")], pagination: { limit: 20, offset: 1, total: 2 } }),
      }) // loadMore
      .mockResolvedValueOnce(jobsResponse(["PROCESSING"], 2, 0)); // next first-page poll tick
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useJobsPolling());
    await flush();
    await act(async () => {
      result.current.loadMore();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.jobs).toHaveLength(2);

    await advance(5000); // first-page poll tick (job 0 is active, so it was scheduled)
    expect(result.current.jobs).toHaveLength(2); // still 2, not reset/duplicated
    expect(result.current.jobs[0]?.status).toBe("PROCESSING"); // updated in place
    expect(result.current.jobs[1]?.job_id).toBe("11111111-1111-4111-8111-111111111111"); // loadMore row untouched
  });
});

describe("useJobsPolling: out-of-page active-job tracker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("regression: an older PROCESSING job revealed by loadMore() begins individual polling immediately, even though first-page polling is stopped (page 1 is terminal-only)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jobsResponse(["COMPLETED"], 2, 0)) // page 1: terminal-only -> first-page polling stops
      .mockResolvedValueOnce({
        // loadMore reveals an older PROCESSING job
        ok: true,
        json: async () => ({ data: [makeJob(1, "PROCESSING")], pagination: { limit: 20, offset: 1, total: 2 } }),
      })
      .mockResolvedValueOnce(jobResponse(1, "PROCESSING")) // individual poll #1 -- still active
      .mockResolvedValueOnce(jobResponse(1, "COMPLETED")); // individual poll #2 -- now terminal
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useJobsPolling());
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Confirm first-page polling is indeed stopped (terminal-only page 1).
    await advance(20_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The individual out-of-page poller starts immediately when loadMore()
    // reveals the active job -- its first fetch happens right away, in the
    // same flush as loadMore() itself, not delayed behind some later,
    // unrelated first-page event.
    await act(async () => {
      result.current.loadMore();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3); // initial(1) + loadMore(1) + immediate individual poll(1)
    expect(result.current.jobs[1]?.status).toBe("PROCESSING");

    // Its next individual tick fires on the normal ~5s cadence.
    await advance(5000);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result.current.jobs[1]?.status).toBe("COMPLETED");

    // Terminal now -- its individual polling stops; no further requests.
    await advance(20_000);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("never issues two concurrent requests for the same out-of-page job", async () => {
    let resolveJobFetch: ((value: unknown) => void) | undefined;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jobsResponse(["COMPLETED"], 2, 0))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [makeJob(1, "QUEUED")], pagination: { limit: 20, offset: 1, total: 2 } }),
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveJobFetch = resolve;
          }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useJobsPolling());
    await flush();
    await act(async () => {
      result.current.loadMore();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3); // list, list, individual-poll-in-flight

    // Advancing time while that individual fetch is still unresolved must
    // not start a second overlapping request for the same job.
    await advance(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await act(async () => {
      resolveJobFetch?.(jobResponse(1, "QUEUED"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("stops individually tracking a job once it's covered again by a first-page refresh, without a duplicate individual request", async () => {
    const JOB1_ID = "11111111-1111-4111-8111-111111111111";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jobsResponse(["COMPLETED"], 2, 0)) // initial page 1: terminal-only
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [makeJob(1, "PROCESSING")], pagination: { limit: 20, offset: 1, total: 2 } }),
      }) // loadMore reveals job 1 (PROCESSING), out-of-page -> individually tracked
      .mockResolvedValueOnce(jobResponse(1, "PROCESSING")) // job 1's immediate individual tick
      .mockResolvedValueOnce(jobsResponse(["COMPLETED", "PROCESSING"], 2, 0)) // refresh(): job 1 now included in page 1's own result, still PROCESSING
      .mockResolvedValue(jobsResponse(["COMPLETED", "PROCESSING"], 2, 0)); // any further first-page polling (job 1 is still active on page 1)
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useJobsPolling());
    await flush();
    await act(async () => {
      result.current.loadMore();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3); // initial + loadMore + job1's immediate individual tick

    await act(async () => {
      result.current.refresh();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);

    const individualCallsSoFar = fetchMock.mock.calls.filter(([url]) => url === `/api/jobs/${JOB1_ID}`).length;
    expect(individualCallsSoFar).toBe(1); // only the one tick from before job 1 was covered by page 1

    // Advance well past another individual-poll interval -- job 1 must not
    // receive a second individual request now that the first page's own
    // refresh covers it (the list endpoint may keep polling normally --
    // that's a different endpoint and not what this assertion is about).
    await advance(10_000);
    const individualCallsAfter = fetchMock.mock.calls.filter(([url]) => url === `/api/jobs/${JOB1_ID}`).length;
    expect(individualCallsAfter).toBe(1); // unchanged
  });
});
