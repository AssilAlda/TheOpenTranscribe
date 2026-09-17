// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useJobPolling } from "@/hooks/useJobPolling";

const JOB_ID = "11111111-1111-4111-8111-111111111111";

function jobResponse(status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED") {
  return {
    ok: true,
    json: async () => ({
      data: {
        schema_version: 1,
        job_id: JOB_ID,
        status,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
        input: { media_path: `uploads/${JOB_ID}__file.wav` },
        result: status === "COMPLETED" ? { output_path: "x", completed_at: "2026-01-01T00:00:00.000Z" } : null,
        error: status === "FAILED" ? { message: "boom", occurred_at: "2026-01-01T00:00:00.000Z" } : null,
      },
    }),
  };
}

function notFoundResponse() {
  return {
    ok: false,
    status: 404,
    json: async () => ({ error: { code: "job_not_found", message: "No job found." } }),
  };
}

/** Flushes the microtask chain of any already-in-flight (non-timer) fetch/promise work. */
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

describe("useJobPolling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Component-tree cleanup itself is handled globally in
    // tests/setup/jsdomSetup.ts.
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("fetches immediately on mount", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jobResponse("QUEUED"));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useJobPolling(JOB_ID));
    await flush();

    expect(result.current.job?.status).toBe("QUEUED");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps polling (~3s) while QUEUED/PROCESSING and stops once COMPLETED", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jobResponse("QUEUED"))
      .mockResolvedValueOnce(jobResponse("PROCESSING"))
      .mockResolvedValueOnce(jobResponse("COMPLETED"));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useJobPolling(JOB_ID));
    await flush();
    expect(result.current.job?.status).toBe("QUEUED");

    await advance(3000);
    expect(result.current.job?.status).toBe("PROCESSING");

    await advance(3000);
    expect(result.current.job?.status).toBe("COMPLETED");

    expect(fetchMock).toHaveBeenCalledTimes(3);

    // No further polling after reaching a terminal status.
    await advance(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("sets notFound and stops polling on a 404, without retrying forever", async () => {
    const fetchMock = vi.fn().mockResolvedValue(notFoundResponse());
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useJobPolling(JOB_ID));
    await flush();

    expect(result.current.notFound).toBe(true);

    await advance(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("pauses while the document is hidden and refreshes immediately when it becomes visible again", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jobResponse("PROCESSING"));
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() => useJobPolling(JOB_ID));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    act(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await advance(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no scheduled poll fired while hidden

    await act(async () => {
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2); // immediate refresh on return
  });

  it("never issues an overlapping request while a fetch is already in flight", async () => {
    let resolveFetch: (() => void) | undefined;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = () => resolve(jobResponse("PROCESSING"));
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() => useJobPolling(JOB_ID));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // The first fetch is still pending. Advancing time shouldn't start a
    // second overlapping request before it resolves.
    await advance(5000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFetch?.();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
