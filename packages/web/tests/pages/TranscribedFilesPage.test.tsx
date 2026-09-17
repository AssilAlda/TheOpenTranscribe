// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import TranscribedFilesPage from "../../app/files/page";

const JOB_ID = "11111111-1111-4111-8111-111111111111";

function jobsListResponse() {
  return {
    ok: true,
    json: async () => ({
      data: [
        {
          schema_version: 1,
          job_id: JOB_ID,
          status: "QUEUED",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
          input: { media_path: `uploads/${JOB_ID}__recording.wav` },
          result: null,
          error: null,
        },
      ],
      pagination: { limit: 20, offset: 0, total: 1 },
    }),
  };
}

function jobDetailResponse() {
  return {
    ok: true,
    json: async () => ({
      data: {
        schema_version: 1,
        job_id: JOB_ID,
        status: "QUEUED",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
        input: { media_path: `uploads/${JOB_ID}__recording.wav` },
        result: null,
        error: null,
      },
    }),
  };
}

describe("TranscribedFilesPage (/files) -- full integration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the shared page header (\"Transcribed files\", synced with the active nav label) and the supporting copy above the list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jobsListResponse()));

    render(<TranscribedFilesPage />);

    expect(screen.getByRole("heading", { name: "Transcribed files", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Every transcription you’ve started, newest first.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("recording.wav")).toBeInTheDocument());
  });

  it("clicking a row opens the modal for that job, and closing it restores focus to the row that opened it", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === `/api/jobs/${JOB_ID}`) return Promise.resolve(jobDetailResponse());
      return Promise.resolve(jobsListResponse());
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<TranscribedFilesPage />);
    await waitFor(() => expect(screen.getByText("recording.wav")).toBeInTheDocument());

    const row = screen.getByText("recording.wav").closest("a")!;
    await user.click(row);

    await waitFor(() => expect(document.querySelector("dialog")).toHaveAttribute("open"));
    await waitFor(() => expect(screen.getByText(/waiting to start/i)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /close/i }));

    expect(document.querySelector("dialog")).not.toHaveAttribute("open");
    expect(document.activeElement).toBe(row);
  });
});
