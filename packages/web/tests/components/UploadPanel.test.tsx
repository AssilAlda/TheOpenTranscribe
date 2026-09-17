// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UploadPanel } from "@/components/UploadPanel";

function makeFile(name: string, size: number, type = "audio/wav"): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

function getFileInput(): HTMLInputElement {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

describe("UploadPanel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders "Upload" as a real section heading, labelling the panel landmark', () => {
    render(<UploadPanel onUploaded={vi.fn()} />);

    const heading = screen.getByRole("heading", { name: "Upload", level: 2 });
    expect(heading).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Upload" })).toContainElement(heading);
  });

  it("shows a client-side hint for a disallowed extension without calling the API", () => {
    const onUploaded = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<UploadPanel onUploaded={onUploaded} />);
    fireEvent.change(getFileInput(), { target: { files: [makeFile("song.exe", 1000)] } });

    expect(screen.getByText(/file type not supported/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a client-side hint for a file over the 100 MiB limit", () => {
    render(<UploadPanel onUploaded={vi.fn()} />);
    const oversized = makeFile("big.wav", 101 * 1024 * 1024);
    fireEvent.change(getFileInput(), { target: { files: [oversized] } });

    expect(screen.getByText(/larger than the/i)).toBeInTheDocument();
  });

  it("uploads a valid file and calls onUploaded on success", async () => {
    const onUploaded = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          schema_version: 1,
          job_id: "11111111-1111-4111-8111-111111111111",
          status: "QUEUED",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
          input: { media_path: "uploads/x__song.wav" },
          result: null,
          error: null,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<UploadPanel onUploaded={onUploaded} />);
    fireEvent.change(getFileInput(), { target: { files: [makeFile("song.wav", 1000)] } });

    fireEvent.click(screen.getByRole("button", { name: /start transcription/i }));

    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/jobs",
      expect.objectContaining({ method: "POST" }),
    );
    expect(screen.getByText(/job created/i)).toBeInTheDocument();
    // No Recent-jobs panel exists on Transcribe anymore (moved to
    // Transcribed Files) -- the success state instead links there.
    expect(screen.getByRole("link", { name: /view transcribed files/i })).toHaveAttribute(
      "href",
      "/files",
    );
  });

  it("shows a server-side rejection error without calling onUploaded", async () => {
    const onUploaded = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 415,
      json: async () => ({ error: { code: "signature_mismatch", message: "File content does not match its claimed extension." } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<UploadPanel onUploaded={onUploaded} />);
    fireEvent.change(getFileInput(), { target: { files: [makeFile("song.wav", 1000)] } });
    fireEvent.click(screen.getByRole("button", { name: /start transcription/i }));

    await waitFor(() =>
      expect(screen.getByText(/file content does not match/i)).toBeInTheDocument(),
    );
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it("lets the user remove a selected file before submitting", () => {
    render(<UploadPanel onUploaded={vi.fn()} />);
    fireEvent.change(getFileInput(), { target: { files: [makeFile("song.wav", 1000)] } });
    expect(screen.getByText("song.wav")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /remove selected file/i }));
    expect(screen.queryByText("song.wav")).not.toBeInTheDocument();
  });

  it('shows the compact three-line dropzone CTA ("Drop your file here" / "or" / "choose a file") without the now-redundant formats/size hint line', () => {
    render(<UploadPanel onUploaded={vi.fn()} />);

    expect(screen.getByText("Drop your file here")).toBeInTheDocument();
    expect(screen.getByText("or")).toBeInTheDocument();
    expect(screen.getByText("choose a file")).toBeInTheDocument();

    // That idle-state hint duplicated what the Transcribe page's utility
    // rail (Transcription details) now already communicates.
    expect(screen.queryByText(/up to 100 MB/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/webm/i)).not.toBeInTheDocument();
  });

  it('clicking the dropzone, including the "choose a file" text, still opens the file picker', () => {
    render(<UploadPanel onUploaded={vi.fn()} />);
    const input = getFileInput();
    const clickSpy = vi.spyOn(input, "click");

    fireEvent.click(screen.getByText("choose a file"));

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps "Start transcription" genuinely disabled (native disabled attribute) when no file is selected', () => {
    const onUploaded = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<UploadPanel onUploaded={onUploaded} />);
    const button = screen.getByRole("button", { name: /start transcription/i });

    // Real DOM `disabled` property/attribute, not a CSS-only or aria-only
    // stand-in -- this is what actually blocks clicks/keyboard activation
    // and is what the disabled-but-not-dimmed styling pass must not touch.
    expect(button).toBeDisabled();
    expect((button as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(button);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it('re-enables (native disabled=false) "Start transcription" once a valid file is selected', () => {
    render(<UploadPanel onUploaded={vi.fn()} />);
    const button = screen.getByRole("button", { name: /start transcription/i });
    expect(button).toBeDisabled();

    fireEvent.change(getFileInput(), { target: { files: [makeFile("song.wav", 1000)] } });

    expect(button).toBeEnabled();
  });
});
