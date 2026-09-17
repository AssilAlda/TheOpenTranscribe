// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDownloadTranscriptPdf } from "@/hooks/useDownloadTranscriptPdf";

const JOB_ID = "11111111-1111-4111-8111-111111111111";

describe("useDownloadTranscriptPdf", () => {
  let createObjectURLMock: ReturnType<typeof vi.fn>;
  let revokeObjectURLMock: ReturnType<typeof vi.fn>;
  let clickMock: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    createObjectURLMock = vi.fn().mockReturnValue("blob:mock-url");
    revokeObjectURLMock = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL: createObjectURLMock, revokeObjectURL: revokeObjectURLMock });

    // Avoid spying on HTMLAnchorElement.prototype.click directly (its DOM
    // lib type doesn't play well with vi.spyOn's overload inference here) --
    // instead observe the real click event, which the anchor's .click()
    // call dispatches and bubbles up to document.
    clickMock = vi.fn<() => void>();
    document.addEventListener("click", clickMock);
  });

  afterEach(() => {
    document.removeEventListener("click", clickMock);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("on success: fetches the PDF, downloads it via a Blob object URL, and returns to idle", async () => {
    const blob = new Blob(["%PDF-fake"], { type: "application/pdf" });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-disposition": 'attachment; filename="My_File.pdf"' }),
      blob: async () => blob,
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useDownloadTranscriptPdf(JOB_ID));

    await act(async () => {
      result.current.download();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/jobs/${JOB_ID}/result/pdf`,
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(createObjectURLMock).toHaveBeenCalledWith(blob);
    expect(clickMock).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:mock-url");
    expect(result.current.state).toBe("idle");
    expect(result.current.errorMessage).toBeNull();
  });

  it("on failure: surfaces a friendly error and supports retry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ error: { code: "job_not_completed", message: "not completed" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-disposition": 'attachment; filename="t.pdf"' }),
        blob: async () => new Blob(["%PDF-fake"]),
      });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useDownloadTranscriptPdf(JOB_ID));

    await act(async () => {
      result.current.download();
    });
    expect(result.current.state).toBe("error");
    expect(result.current.errorMessage).toBe("This job hasn't finished yet.");

    // Retry succeeds.
    await act(async () => {
      result.current.download();
    });
    expect(result.current.state).toBe("idle");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("de-dupes overlapping clicks while a request is already generating", async () => {
    let resolveFetch: ((value: unknown) => void) | undefined;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(() => useDownloadTranscriptPdf(JOB_ID));

    act(() => {
      result.current.download();
    });
    rerender();
    expect(result.current.state).toBe("generating");

    act(() => {
      result.current.download(); // second click while generating -- should be ignored
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFetch?.({
        ok: true,
        headers: new Headers({ "content-disposition": 'attachment; filename="t.pdf"' }),
        blob: async () => new Blob(["%PDF-fake"]),
      });
    });
    expect(result.current.state).toBe("idle");
  });

  it("aborts the in-flight request on unmount and does not update state afterward", async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result, unmount } = renderHook(() => useDownloadTranscriptPdf(JOB_ID));

    act(() => {
      result.current.download();
    });
    expect(result.current.state).toBe("generating");

    unmount();

    // Should not throw and should not attempt to update state on an unmounted hook.
    await act(async () => {
      await Promise.resolve();
    });
  });
});
