// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TranscriptionDetailsRail } from "@/components/TranscriptionDetailsRail";
import { ALLOWED_EXTENSIONS, MAX_UPLOAD_BYTES, formatBytes } from "@/lib/upload/constants";

function makeFile(name: string, size: number): File {
  const file = new File(["x"], name, { type: "audio/wav" });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("TranscriptionDetailsRail", () => {
  it('renders "Transcription details" as a real internal section heading, and labels the landmark by it', () => {
    render(<TranscriptionDetailsRail file={null} language="" justCreated={false} />);

    const heading = screen.getByRole("heading", { name: "Transcription details", level: 2 });
    expect(heading).toBeInTheDocument();
    // The <aside> is labelled by this same heading (aria-labelledby), not a
    // separate aria-label string -- a real semantic relationship, not just
    // matching visible/accessible text by coincidence.
    const rail = screen.getByRole("complementary", { name: "Transcription details" });
    expect(rail).toContainElement(heading);
  });

  it("idle state shows real facts derived from the actual upload constants, not invented figures", () => {
    render(<TranscriptionDetailsRail file={null} language="" justCreated={false} />);

    expect(screen.getByRole("complementary", { name: "Transcription details" })).toBeInTheDocument();
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    // Derived from the same MAX_UPLOAD_BYTES the upload form itself enforces.
    expect(screen.getByText(`Up to ${formatBytes(MAX_UPLOAD_BYTES)}`)).toBeInTheDocument();
    // Derived from the same ALLOWED_EXTENSIONS the upload form itself accepts.
    expect(screen.getByText(ALLOWED_EXTENSIONS.map((ext) => ext.toUpperCase()).join(", "))).toBeInTheDocument();
    expect(screen.getByText("Optional")).toBeInTheDocument();
    // The two new facts -- real, currently-supported product behavior only.
    expect(screen.getByText("Transcript + PDF export")).toBeInTheDocument();
    expect(screen.getByText("Transcribed Files")).toBeInTheDocument();
  });

  it("selected-file state shows only information actually available on the File object, plus language when entered", () => {
    const file = makeFile("interview.wav", 2048);
    render(<TranscriptionDetailsRail file={file} language="sv" justCreated={false} />);

    expect(screen.getByText("interview.wav")).toBeInTheDocument();
    expect(screen.getByText("WAV")).toBeInTheDocument();
    expect(screen.getByText(formatBytes(2048))).toBeInTheDocument();
    expect(screen.getByText("sv")).toBeInTheDocument();
    expect(screen.getByText("Ready to transcribe")).toBeInTheDocument();
    // No invented duration/word-count/estimated-time facts.
    expect(screen.queryByText(/duration/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/estimated/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/word count/i)).not.toBeInTheDocument();
  });

  it("selected-file state omits the language fact entirely when no language was entered", () => {
    const file = makeFile("interview.wav", 2048);
    render(<TranscriptionDetailsRail file={file} language="" justCreated={false} />);

    expect(screen.queryByText("Language")).not.toBeInTheDocument();
  });

  it("success state shows a job-created affordance linking to Transcribed Files, not fake progress", () => {
    const file = makeFile("interview.wav", 2048);
    render(<TranscriptionDetailsRail file={file} language="" justCreated={true} />);

    expect(screen.getByText("Job created.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view in transcribed files/i })).toHaveAttribute("href", "/files");
    expect(screen.queryByText("Ready to transcribe")).not.toBeInTheDocument();
  });
});
