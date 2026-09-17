// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TranscribedFilesList } from "@/components/TranscribedFilesList";

function job(i: number, status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED") {
  const id = `1111111${i}-1111-4111-8111-111111111111`;
  return {
    schema_version: 1,
    job_id: id,
    status,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    input: { media_path: `uploads/${id}__recording-${i}.wav` },
    result: status === "COMPLETED" ? { output_path: "x", completed_at: new Date().toISOString() } : null,
    error: null,
  };
}

function jobsResponse(
  statuses: Array<"QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED">,
  total = statuses.length,
) {
  return {
    ok: true,
    json: async () => ({
      data: statuses.map((status, i) => job(i, status)),
      pagination: { limit: 20, offset: 0, total },
    }),
  };
}

describe("TranscribedFilesList", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows the empty state when there are no jobs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jobsResponse([])));

    render(<TranscribedFilesList onOpenJob={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/no transcriptions yet/i)).toBeInTheDocument());
  });

  it("shows skeleton placeholders only while the initial fetch is unresolved, then switches to the true empty state", async () => {
    let resolveFetch: ((value: unknown) => void) | undefined;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<TranscribedFilesList onOpenJob={vi.fn()} />);
    expect(container.querySelectorAll('[aria-hidden="true"] li').length).toBeGreaterThan(0);
    expect(screen.queryByText(/no transcriptions yet/i)).not.toBeInTheDocument();

    resolveFetch?.(jobsResponse([]));
    await waitFor(() => expect(screen.getByText(/no transcriptions yet/i)).toBeInTheDocument());
    expect(container.querySelectorAll('[aria-hidden="true"] li').length).toBe(0);
  });

  it("renders a row per job with its status, for all four statuses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jobsResponse(["QUEUED", "PROCESSING", "COMPLETED", "FAILED"])),
    );

    render(<TranscribedFilesList onOpenJob={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("recording-0.wav")).toBeInTheDocument());
    expect(screen.getByText("Queued")).toBeInTheDocument();
    expect(screen.getByText("Processing")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("shows a degraded-refresh notice (not a crash) when the fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    render(<TranscribedFilesList onOpenJob={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/having trouble refreshing/i)).toBeInTheDocument());
  });

  it("row click opens the modal for the correct job via onOpenJob, without navigating", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jobsResponse(["QUEUED"])));
    const onOpenJob = vi.fn();

    render(<TranscribedFilesList onOpenJob={onOpenJob} />);
    const row = await screen.findByText("recording-0.wav");
    const link = row.closest("a");
    expect(link).not.toBeNull();

    fireEvent.click(link!);

    expect(onOpenJob).toHaveBeenCalledTimes(1);
    expect(onOpenJob).toHaveBeenCalledWith(
      "11111110-1111-4111-8111-111111111111",
      expect.anything(),
    );
  });

  it("modified clicks (e.g. cmd/ctrl-click for a new tab) are left to the browser, not intercepted", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jobsResponse(["QUEUED"])));
    const onOpenJob = vi.fn();

    render(<TranscribedFilesList onOpenJob={onOpenJob} />);
    const row = await screen.findByText("recording-0.wav");
    const link = row.closest("a");

    fireEvent.click(link!, { metaKey: true });

    expect(onOpenJob).not.toHaveBeenCalled();
  });

  it('shows "Load more" only when more history is available, and it fetches/appends the next page', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jobsResponse(["QUEUED"], 2))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [job(1, "COMPLETED")], pagination: { limit: 20, offset: 1, total: 2 } }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<TranscribedFilesList onOpenJob={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("recording-0.wav")).toBeInTheDocument());

    const loadMoreButton = screen.getByRole("button", { name: /load more/i });
    fireEvent.click(loadMoreButton);

    await waitFor(() => expect(screen.getByText("recording-1.wav")).toBeInTheDocument());
    // The originally-loaded row is still present -- appended, not replaced.
    expect(screen.getByText("recording-0.wav")).toBeInTheDocument();
    // All history now loaded -- the button disappears.
    await waitFor(() => expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument());
  });

  it('does not show "Load more" once every job is loaded', async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jobsResponse(["QUEUED"], 1)));

    render(<TranscribedFilesList onOpenJob={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("recording-0.wav")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
  });
});
