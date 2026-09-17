// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { JobDetailModal } from "@/components/JobDetailModal";

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

describe("JobDetailModal", () => {
  afterEach(() => {
    // Unconditional, even if a test above throws/times out mid-way --
    // otherwise leftover fake timers leak into later tests in this file.
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is closed (not rendering job content) when jobId is null -- the DOM state contract behind the closed-dialog visual fix", () => {
    // jsdom does no real CSS layout, so it cannot verify that a closed
    // <dialog> is actually invisible/zero-space on screen (that's a real-
    // browser/manual-verification concern -- see JobDetailModal.module.css's
    // `.dialog[open]` rule). What this test CAN and does verify is the DOM
    // state contract the CSS fix depends on: no `open` attribute, and no
    // job content mounted inside -- i.e. nothing for a stray visible panel
    // to even contain.
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<JobDetailModal jobId={null} onClose={vi.fn()} />);
    const dialog = document.querySelector("dialog");
    expect(dialog).not.toBeNull();
    expect(dialog).not.toHaveAttribute("open");
    expect(dialog?.textContent?.trim()).toBe("");
    // No JobStatusDetail mounted at all when closed -- confirmed by the
    // total absence of any fetch call it would otherwise trigger.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opens and renders the correct job's status content when jobId is set (QUEUED)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => jobBody({ status: "QUEUED" }) }));

    render(<JobDetailModal jobId={JOB_ID} onClose={vi.fn()} />);

    const dialog = document.querySelector("dialog");
    expect(dialog).toHaveAttribute("open");
    await waitFor(() => expect(screen.getByText(/waiting to start/i)).toBeInTheDocument());
    // The modal body (not just the close-button chrome) actually has real
    // content -- this is the specific regression the "blank modal" bug
    // would have failed on.
    expect(document.querySelector("dialog")?.textContent).toMatch(/waiting to start/i);
  });

  it("renders the PROCESSING state inside the modal body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => jobBody({ status: "PROCESSING" }) }),
    );

    render(<JobDetailModal jobId={JOB_ID} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(/transcribing your file/i)).toBeInTheDocument());
    expect(screen.getByText("Processing")).toBeInTheDocument();
  });

  it("renders the FAILED state (safe copy) inside the modal body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () =>
          jobBody({
            status: "FAILED",
            error: { message: "raw internal diagnostic", occurred_at: "2026-01-01T00:00:00.000Z" },
          }),
      }),
    );

    render(<JobDetailModal jobId={JOB_ID} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(/couldn't be completed/i)).toBeInTheDocument());
    expect(screen.queryByText(/raw internal diagnostic/i)).not.toBeInTheDocument();
  });

  it("renders the COMPLETED state's filename/status metadata plus the transcript, Copy, and Download PDF actions (reusing JobStatusDetail/TranscriptReader as-is, not duplicating their logic)", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === `/api/jobs/${JOB_ID}`) {
        return Promise.resolve({
          ok: true,
          json: async () =>
            jobBody({ status: "COMPLETED", result: { output_path: "x", completed_at: "2026-01-01T00:00:00.000Z" } }),
        });
      }
      if (url === `/api/jobs/${JOB_ID}/result`) {
        return Promise.resolve({ ok: true, text: async () => "The transcript body." });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<JobDetailModal jobId={JOB_ID} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("The transcript body.")).toBeInTheDocument());
    // Filename/status metadata (JobStatusDetail's header), not just the transcript.
    expect(screen.getByText("recording.wav")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^copy$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download pdf/i })).toBeInTheDocument();
  });

  it("moves initial focus to the close button when opened", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => jobBody({ status: "QUEUED" }) }));

    render(<JobDetailModal jobId={JOB_ID} onClose={vi.fn()} />);

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: /close/i })));
  });

  it("clicking the explicit close button closes the dialog and calls onClose exactly once", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => jobBody({ status: "QUEUED" }) }));
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<JobDetailModal jobId={JOB_ID} onClose={onClose} />);
    await waitFor(() => expect(document.querySelector("dialog")).toHaveAttribute("open"));

    await user.click(screen.getByRole("button", { name: /close/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.querySelector("dialog")).not.toHaveAttribute("open");
  });

  it("transitions live from QUEUED to COMPLETED while still open, with no close/reopen required (JobStatusDetail's own polling drives this -- the modal doesn't need special-case logic)", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === `/api/jobs/${JOB_ID}`) {
        const status =
          fetchMock.mock.calls.filter((call: unknown[]) => call[0] === `/api/jobs/${JOB_ID}`).length <= 1
          ? "QUEUED"
          : "COMPLETED";
        return Promise.resolve({
          ok: true,
          json: async () =>
            jobBody(
              status === "COMPLETED"
                ? { status, result: { output_path: "x", completed_at: "2026-01-01T00:00:00.000Z" } }
                : { status },
            ),
        });
      }
      if (url === `/api/jobs/${JOB_ID}/result`) {
        return Promise.resolve({ ok: true, text: async () => "Now finished." });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<JobDetailModal jobId={JOB_ID} onClose={vi.fn()} />);
    // waitFor's own internal polling uses real timers, which deadlocks
    // against vi.useFakeTimers() -- flush via act()+advanceTimersByTimeAsync
    // instead, matching the pattern already used for useJobPolling's own
    // tests.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText(/waiting to start/i)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000); // useJobPolling's own ~3s cadence
    });
    expect(screen.getByText("Now finished.")).toBeInTheDocument();
  });

  it("the close button only calls dialog.close() -- the dialog's own native 'close' event is the single unified path that then calls onClose(), so any close mechanism (button, Escape/cancel, or a future programmatic close) is handled identically", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => jobBody({ status: "QUEUED" }) }));
    const onClose = vi.fn();

    render(<JobDetailModal jobId={JOB_ID} onClose={onClose} />);
    await waitFor(() => expect(document.querySelector("dialog")).toHaveAttribute("open"));

    // Simulate a close triggered by any mechanism other than our own click
    // handler (e.g. what a real browser does on Escape/cancel) by calling
    // the native close() directly -- proving the listener (not the click
    // handler) is what actually calls onClose().
    document.querySelector("dialog")!.close();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe("body scroll lock (Finding A regression coverage)", () => {
    afterEach(() => {
      document.body.style.overflow = "";
    });

    it("locks body scrolling while the dialog is open", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => jobBody({ status: "QUEUED" }) }));

      render(<JobDetailModal jobId={JOB_ID} onClose={vi.fn()} />);

      await waitFor(() => expect(document.querySelector("dialog")).toHaveAttribute("open"));
      expect(document.body.style.overflow).toBe("hidden");
    });

    it("restores the prior body overflow value (not just \"\") on normal close via the close button", async () => {
      // A non-empty starting value proves the component restores whatever
      // was actually there before, rather than always resetting to "".
      document.body.style.overflow = "scroll";
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => jobBody({ status: "QUEUED" }) }));
      const user = userEvent.setup();

      render(<JobDetailModal jobId={JOB_ID} onClose={vi.fn()} />);
      await waitFor(() => expect(document.querySelector("dialog")).toHaveAttribute("open"));
      expect(document.body.style.overflow).toBe("hidden");

      await user.click(screen.getByRole("button", { name: /close/i }));

      expect(document.body.style.overflow).toBe("scroll");
    });

    it("restores the prior body overflow value when the component unmounts while the dialog is still open -- the Finding A regression: navigating away (e.g. via Sidebar/MobileTabBar) without closing the modal first never fires the dialog's native 'close' event", async () => {
      document.body.style.overflow = "scroll";
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => jobBody({ status: "QUEUED" }) }));

      const { unmount } = render(<JobDetailModal jobId={JOB_ID} onClose={vi.fn()} />);
      await waitFor(() => expect(document.querySelector("dialog")).toHaveAttribute("open"));
      expect(document.body.style.overflow).toBe("hidden");

      unmount();

      expect(document.body.style.overflow).toBe("scroll");
    });
  });
});
