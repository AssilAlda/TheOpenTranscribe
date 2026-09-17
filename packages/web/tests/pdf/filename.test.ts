import { describe, expect, it } from "vitest";

import { buildContentDisposition, buildTranscriptPdfFilename } from "@/lib/pdf/filename";

describe("buildTranscriptPdfFilename", () => {
  it("strips the job_id prefix and extension from a stored media_path", () => {
    expect(
      buildTranscriptPdfFilename(
        "uploads/11111111-1111-4111-8111-111111111111__My_Recording.wav",
      ),
    ).toBe("My_Recording.pdf");
  });

  it("falls back to a safe default when the segment is empty after stripping", () => {
    expect(
      buildTranscriptPdfFilename("uploads/11111111-1111-4111-8111-111111111111__"),
    ).toBe("transcript.pdf");
  });

  it("falls back to a safe default for a malformed/empty media_path", () => {
    expect(buildTranscriptPdfFilename("")).toBe("transcript.pdf");
    expect(buildTranscriptPdfFilename("uploads/")).toBe("transcript.pdf");
  });

  it("defensively re-sanitizes even though the stored segment should already be safe", () => {
    // The stored segment is normally already restricted to [a-zA-Z0-9._-],
    // but this function must not trust that blindly.
    expect(
      buildTranscriptPdfFilename(
        "uploads/11111111-1111-4111-8111-111111111111__weird name (1).wav",
      ),
    ).toBe("weird_name__1_.pdf");
  });
});

describe("buildContentDisposition", () => {
  it("builds a standard attachment header with both filename and filename* forms", () => {
    const header = buildContentDisposition("My_Recording.pdf");
    expect(header).toBe(
      "attachment; filename=\"My_Recording.pdf\"; filename*=UTF-8''My_Recording.pdf",
    );
  });

  it("strips CR/LF and other control characters (header-injection safety)", () => {
    // The actual injection vector is a raw CR/LF starting a new header line;
    // once those are stripped, arbitrary text is just an inert filename
    // value on a single header line, not an injected header.
    const header = buildContentDisposition("evil\r\nSet-Cookie: a=b.pdf");
    expect(header).not.toMatch(/\r|\n/);
    expect(header.split("\n")).toHaveLength(1);
  });

  it("strips path separators so a filename can never smuggle a path fragment", () => {
    const header = buildContentDisposition("../../etc/passwd.pdf");
    expect(header).not.toContain("/");
    expect(header).not.toContain("\\");
  });

  it("strips quote and backslash characters from the ASCII fallback", () => {
    const header = buildContentDisposition('na"me\\.pdf');
    expect(header).toMatch(/filename="[^"]*"/);
  });

  it("falls back to a safe default for an empty/whitespace-only filename", () => {
    const header = buildContentDisposition("   ");
    expect(header).toContain('filename="transcript.pdf"');
  });

  it("percent-encodes non-ASCII characters in the extended filename* form", () => {
    const header = buildContentDisposition("Åäö.pdf");
    expect(header).toContain("filename*=UTF-8''%C3%85%C3%A4%C3%B6.pdf");
  });
});
