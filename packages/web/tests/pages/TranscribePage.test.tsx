// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import TranscribePage from "../../app/page";

function makeFile(name: string, size: number): File {
  const file = new File(["x"], name, { type: "audio/wav" });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

function getFileInput(): HTMLInputElement {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

describe("TranscribePage (/)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the shared page header (\"Upload files\", synced with the active nav label) plus the upload workspace, and no history/Recent-jobs panel (moved to Transcribed Files)", () => {
    render(<TranscribePage />);

    expect(screen.getByRole("heading", { name: "Upload files", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Transcribe audio and video")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start transcription/i })).toBeInTheDocument();

    // The old "Recent jobs" panel, and its network call, must not be present here anymore.
    expect(screen.queryByText(/recent jobs/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /transcribed files/i })).not.toBeInTheDocument();
  });

  it("does not itself poll the jobs-list API -- that responsibility moved entirely to Transcribed Files", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<TranscribePage />);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders the Transcription details rail and the What happens next card alongside the upload workflow, defaulting to its idle facts", () => {
    render(<TranscribePage />);

    expect(screen.getByRole("heading", { name: "Transcription details" })).toBeInTheDocument();
    expect(screen.getByText("OpenAI")).toBeInTheDocument();

    const whatsNext = within(screen.getByRole("complementary", { name: "What happens next" }));
    expect(whatsNext.getByText("Upload")).toBeInTheDocument();
    expect(whatsNext.getByText("Transcription")).toBeInTheDocument();
    expect(whatsNext.getByText("Review & export")).toBeInTheDocument();

    // The old "Recent jobs" panel must not be present here (moved to Transcribed Files).
    expect(screen.queryByText(/recent jobs/i)).not.toBeInTheDocument();
  });

  it("renders \"Transcription details\" as a real section heading inside the utility card, not as a separate page-level heading", () => {
    render(<TranscribePage />);

    const heading = screen.getByRole("heading", { name: "Transcription details", level: 2 });
    const rail = screen.getByRole("complementary", { name: "Transcription details" });
    expect(rail).toContainElement(heading);
  });

  it("selecting a file in the upload workflow updates the rail to reflect that same file, without controlling UploadPanel", () => {
    render(<TranscribePage />);

    fireEvent.change(getFileInput(), { target: { files: [makeFile("interview.wav", 2048)] } });

    // The filename now appears in both UploadPanel's own selected-file
    // treatment (kept as-is) and the rail's mirrored fact -- proving the
    // rail complements rather than replaces UploadPanel's existing UI.
    expect(screen.getAllByText("interview.wav").length).toBeGreaterThanOrEqual(2);

    const rail = within(screen.getByRole("complementary", { name: "Transcription details" }));
    expect(rail.getByText("Ready to transcribe")).toBeInTheDocument();

    // What happens next stays stable regardless of the selected-file state.
    expect(screen.getByRole("heading", { name: "What happens next" })).toBeInTheDocument();
  });

  it("after a successful upload, the rail shows the job-created affordance linking to Transcribed Files", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          schema_version: 1,
          job_id: "11111111-1111-4111-8111-111111111111",
          status: "QUEUED",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
          input: { media_path: "uploads/x__interview.wav" },
          result: null,
          error: null,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TranscribePage />);
    fireEvent.change(getFileInput(), { target: { files: [makeFile("interview.wav", 2048)] } });
    fireEvent.click(screen.getByRole("button", { name: /start transcription/i }));

    const rail = within(screen.getByRole("complementary", { name: "Transcription details" }));
    await waitFor(() => expect(rail.getByText("Job created.")).toBeInTheDocument());
    expect(rail.getByRole("link", { name: /view in transcribed files/i })).toHaveAttribute("href", "/files");
  });
});
