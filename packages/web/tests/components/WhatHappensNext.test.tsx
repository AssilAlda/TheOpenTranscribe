// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WhatHappensNext } from "@/components/WhatHappensNext";

describe("WhatHappensNext", () => {
  it("renders the card title and the real three-step workflow, with no invented behavior", () => {
    render(<WhatHappensNext />);

    expect(screen.getByRole("heading", { name: "What happens next" })).toBeInTheDocument();

    expect(screen.getByText("Upload")).toBeInTheDocument();
    expect(screen.getByText("Your media is added as a transcription job.")).toBeInTheDocument();

    expect(screen.getByText("Transcription")).toBeInTheDocument();
    expect(screen.getByText("Follow its status in Transcribed Files.")).toBeInTheDocument();

    expect(screen.getByText("Review & export")).toBeInTheDocument();
    expect(screen.getByText("Read the transcript, copy it, or download it as PDF.")).toBeInTheDocument();

    // No invented completion time, fake progress, retries, or unsupported
    // export/AI features.
    expect(screen.queryByText(/estimated/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/retry|retries/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/summary|summarize/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/diarization/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/timestamp/i)).not.toBeInTheDocument();
  });
});
