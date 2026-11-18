// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { JobStatusDetail } from "@/components/JobStatusDetail";

const JOB_ID = "11111111-1111-4111-8111-111111111111";

function jobBody(overrides: Record<string, unknown>) {
  return {
    data: {
      schema_version: 1,
      job_id: JOB_ID,
      status: "QUEUED",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      input: { media_path: `uploads/${JOB_ID}__recording.wav` },
      result: null,
      error: null,
      ...overrides,
    },
  };
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

describe("JobStatusDetail", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows the not-found state for an unknown job, without leaking internal storage details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ error: { code: "job_not_found", message: "No job found." } }, false, 404),
      ),
    );

    render(<JobStatusDetail jobId={JOB_ID} />);
    await waitFor(() => expect(screen.getByText(/job not found/i)).toBeInTheDocument());
    expect(screen.queryByText(/DATA_DIR/i)).not.toBeInTheDocument();
  });

  it("shows the QUEUED state with product-facing copy (no internal process terminology)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(jobBody({ status: "QUEUED" }))));

    const { container } = render(<JobStatusDetail jobId={JOB_ID} />);
    await waitFor(() => expect(screen.getByText(/waiting to start/i)).toBeInTheDocument());
    expect(screen.getByText("Queued")).toBeInTheDocument();
    expect(screen.getByText(/your transcription will begin shortly/i)).toBeInTheDocument();

    // Regression guard for the "exposes internal implementation concept" bug:
    // no mention of the runner/worker process anywhere in the rendered copy.
    expect(container.textContent).not.toMatch(/runner/i);
  });

  it("shows the PROCESSING state with product-facing copy", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(jobBody({ status: "PROCESSING" }))));

    render(<JobStatusDetail jobId={JOB_ID} />);
    await waitFor(() => expect(screen.getByText(/transcribing your file/i)).toBeInTheDocument());
    expect(screen.getByText("Processing")).toBeInTheDocument();
  });

  it("shows only a safe generic FAILED message and NEVER renders the raw persisted error.message anywhere, in any form", async () => {
    const rawBackendDiagnostic =
      "Traceback (most recent call last): File \"/Users/owner/data/uploads/x.wav\", " +
      "line 12, in run_job\nENOENT: runner subprocess failed reading /Users/owner/.venv/bin/python";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          jobBody({
            status: "FAILED",
            error: {
              message: rawBackendDiagnostic,
              occurred_at: "2026-01-01T00:00:00.000Z",
            },
          }),
        ),
      ),
    );

    const { container } = render(<JobStatusDetail jobId={JOB_ID} />);
    await waitFor(() => expect(screen.getByText(/couldn't be completed/i)).toBeInTheDocument());

    // Safe, generic, product-facing copy is shown.
    expect(
      screen.getByText(/check the service logs for more information/i),
    ).toBeInTheDocument();

    // The raw backend diagnostic must not appear anywhere in the rendered
    // output -- not as visible text, not inside a collapsed <details>, not
    // in any attribute. There is no technical-details disclosure at all.
    expect(container.querySelector("details")).toBeNull();
    expect(screen.queryByText(/Traceback/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ENOENT/)).not.toBeInTheDocument();
    expect(container.innerHTML).not.toContain("/Users/owner");
    expect(container.innerHTML.toLowerCase()).not.toContain("runner");

    // No retry action yet.
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it("shows the completed transcript, and Copy uses the Clipboard API with accessible feedback", async () => {
    // userEvent.setup() installs its own navigator.clipboard stub, so the
    // custom writeText mock must be installed AFTER setup() or it gets
    // silently overwritten (found while writing this test).
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === `/api/jobs/${JOB_ID}`) {
        return Promise.resolve(
          jsonResponse(
            jobBody({
              status: "COMPLETED",
              result: { output_path: "outputs/x.txt", completed_at: "2026-01-01T00:00:00.000Z" },
            }),
          ),
        );
      }
      if (url === `/api/jobs/${JOB_ID}/result`) {
        return Promise.resolve({ ok: true, text: async () => "Hello, this is the transcript." });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<JobStatusDetail jobId={JOB_ID} />);

    await waitFor(() =>
      expect(screen.getByText("Hello, this is the transcript.")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: /^copy$/i }));
    expect(writeText).toHaveBeenCalledWith("Hello, this is the transcript.");
    await waitFor(() => expect(screen.getByText(/^copied$/i)).toBeInTheDocument());
  });

  it("shows a distinct transcript-load error (not a FAILED job) when the result fetch fails, with retry", async () => {
    let resultCallCount = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === `/api/jobs/${JOB_ID}`) {
        return Promise.resolve(
          jsonResponse(
            jobBody({
              status: "COMPLETED",
              result: { output_path: "outputs/x.txt", completed_at: "2026-01-01T00:00:00.000Z" },
            }),
          ),
        );
      }
      if (url === `/api/jobs/${JOB_ID}/result`) {
        resultCallCount += 1;
        if (resultCallCount === 1) {
          return Promise.resolve({ ok: false, text: async () => "" });
        }
        return Promise.resolve({ ok: true, text: async () => "Recovered transcript." });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<JobStatusDetail jobId={JOB_ID} />);

    // Job status stays COMPLETED (shown via the status pill), even though
    // the transcript itself failed to load. These are two independent async
    // fetches (job status vs. transcript), so each is awaited separately
    // rather than assuming one completing implies the other has too.
    await waitFor(() => expect(screen.getByText("Completed")).toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByText(/transcript couldn't be retrieved/i)).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(screen.getByText("Recovered transcript.")).toBeInTheDocument());
  });
});
