// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { JobDetailFallbackPage } from "@/components/JobDetailFallbackPage";

const JOB_ID = "11111111-1111-4111-8111-111111111111";

describe("JobDetailFallbackPage (direct /jobs/[jobId] URL, bookmark, refresh fallback)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the shared JobStatusDetail content and a back link to Transcribed Files -- thin smoke test only, the full four-state suite already covers JobStatusDetail directly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
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
      }),
    );

    render(<JobDetailFallbackPage jobId={JOB_ID} />);

    await waitFor(() => expect(screen.getByText("recording.wav")).toBeInTheDocument());
    expect(screen.getByText(/waiting to start/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to transcribed files/i })).toHaveAttribute(
      "href",
      "/files",
    );
  });
});
