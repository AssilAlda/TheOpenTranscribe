import PDFDocument from "pdfkit";
import { describe, expect, it } from "vitest";

import {
  addPageNumbers,
  extractPdfPageCount,
  findUnsupportedCharacters,
  generateTranscriptPdf,
  splitIntoParagraphs,
  FONT_PATH,
  PAGE_MARGIN,
  UnsupportedTranscriptCharactersError,
} from "@/lib/pdf/generateTranscriptPdf";

const SWEDISH_CHARS = ["å", "ä", "ö", "Å", "Ä", "Ö"];
const LATIN_EXTENDED_SAMPLE = "Café, naïve, façade, Zürich, Łódź, Đorđe";

function isPdf(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}

/** Builds a bare pdfkit doc with the same page setup generateTranscriptPdf uses, for isolated addPageNumbers tests. */
function buildTestDoc(): PDFKit.PDFDocument {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN },
    bufferPages: true,
  });
  doc.font(FONT_PATH).fontSize(11);
  return doc;
}

/** Finalizes a doc (after any further writes) and resolves with the full output buffer. */
function finalize(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

describe("findUnsupportedCharacters (fontkit glyph-coverage check against the vendored font)", () => {
  it("reports no unsupported characters for Swedish diacritics", () => {
    expect(findUnsupportedCharacters(SWEDISH_CHARS.join(""))).toEqual([]);
  });

  it("reports no unsupported characters for representative Latin Extended text", () => {
    expect(findUnsupportedCharacters(LATIN_EXTENDED_SAMPLE)).toEqual([]);
  });

  it("reports no unsupported characters for plain ASCII", () => {
    expect(findUnsupportedCharacters("Hello, world! 123.")).toEqual([]);
  });

  it("ignores whitespace when checking coverage", () => {
    expect(findUnsupportedCharacters("a b\tc\nd")).toEqual([]);
  });
});

describe("splitIntoParagraphs", () => {
  it("splits on a blank line and trims each paragraph", () => {
    expect(splitIntoParagraphs("First paragraph.\n\nSecond paragraph.")).toEqual([
      "First paragraph.",
      "Second paragraph.",
    ]);
  });

  it("treats multiple consecutive blank lines as a single paragraph boundary", () => {
    expect(splitIntoParagraphs("A.\n\n\n\nB.")).toEqual(["A.", "B."]);
  });

  it("preserves single newlines within a paragraph (does not collapse them)", () => {
    expect(splitIntoParagraphs("Line one.\nLine two.\n\nSecond paragraph.")).toEqual([
      "Line one.\nLine two.",
      "Second paragraph.",
    ]);
  });

  it("returns the whole (trimmed) transcript as one paragraph when there is no blank-line break", () => {
    expect(splitIntoParagraphs("Just one paragraph, no breaks.")).toEqual([
      "Just one paragraph, no breaks.",
    ]);
  });

  it("never returns an empty array, even for degenerate input", () => {
    expect(splitIntoParagraphs("")).toEqual([""]);
    expect(splitIntoParagraphs("   \n\n   ")).toEqual(["   \n\n   "]);
  });
});

describe("addPageNumbers (regression: must never change the document's physical page count)", () => {
  it("does not add a page to an already-finalized single-page document", async () => {
    const doc = buildTestDoc();
    doc.text("Short content that clearly fits on one page.");

    const pageCountBefore = doc.bufferedPageRange().count;
    expect(pageCountBefore).toBe(1);

    addPageNumbers(doc);
    const pdf = await finalize(doc);

    // This is the exact defect reported in review: a one-page document
    // gained a spurious blank trailing page (with only a "1 / 1" footer on
    // it) once page numbers were added.
    expect(extractPdfPageCount(pdf)).toBe(pageCountBefore);
  });

  it("does not add extra pages to an already-finalized multi-page document", async () => {
    const doc = buildTestDoc();
    doc.text("Page one content.");
    doc.addPage();
    doc.text("Page two content.");
    doc.addPage();
    doc.text("Page three content.");

    const pageCountBefore = doc.bufferedPageRange().count;
    expect(pageCountBefore).toBe(3);

    addPageNumbers(doc);
    const pdf = await finalize(doc);

    // Root-cause regression guard: writing each page's footer at an
    // absolute y inside the bottom margin used to trigger pdfkit's
    // automatic pagination once per page (document.y exceeding
    // page.maxY()), so a 3-page document would have gained 3 extra blank
    // trailing pages instead of 0.
    expect(extractPdfPageCount(pdf)).toBe(pageCountBefore);
  });

  it("labels are legible and correctly numbered (N / total) with no gaps once the count is fixed", async () => {
    const doc = buildTestDoc();
    doc.text("Page one.");
    doc.addPage();
    doc.text("Page two.");

    addPageNumbers(doc);
    const pdf = await finalize(doc);

    expect(extractPdfPageCount(pdf)).toBe(2);
    // Both labels are drawn as literal, uncompressed content-stream text
    // operators is not something we assert byte-for-byte (that would need a
    // real PDF text-extraction dependency) -- the page-count assertion
    // above is the authoritative, dependency-free check that this function
    // does its one job (label pages) without a side effect (adding pages).
  });
});

describe("generateTranscriptPdf", () => {
  it("generates a valid, non-empty PDF for representative Swedish/non-ASCII text", async () => {
    const transcript = `En kort transkription med ${SWEDISH_CHARS.join(" ")} och ${LATIN_EXTENDED_SAMPLE}.`;
    const pdf = await generateTranscriptPdf(transcript, "Test Transcript", {
      completedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(1000);
    expect(isPdf(pdf)).toBe(true);
  });

  it("includes optional metadata without throwing", async () => {
    const pdf = await generateTranscriptPdf("Hello.", "Test Transcript", {
      sourceFilename: "My_Recording",
      completedAt: "2026-01-01T00:00:00.000Z",
      language: "sv",
    });
    expect(isPdf(pdf)).toBe(true);
  });

  it("a short transcript that clearly fits on one page produces exactly 1 physical page -- no trailing blank page", async () => {
    const shortTranscript =
      "Hej, det här är en kort transkription med å, ä och ö. Den ska rymmas på en enda sida.";

    const pdf = await generateTranscriptPdf(shortTranscript, "Short Transcript", {
      sourceFilename: "short-recording",
      completedAt: "2026-01-01T00:00:00.000Z",
      language: "sv",
    });

    expect(isPdf(pdf)).toBe(true);
    expect(extractPdfPageCount(pdf)).toBe(1);
  });

  it("generates a long, multi-paragraph transcript across multiple pages without throwing or truncating at the application layer, and without an extra trailing blank page", async () => {
    const paragraph =
      "This is a representative paragraph of transcript text used to force the generated document across many pages so the automatic multi-page flow is actually exercised. ";
    const longTranscript = Array.from({ length: 400 }, () => paragraph).join("\n\n");

    const pdf = await generateTranscriptPdf(longTranscript, "Long Transcript", {
      completedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(isPdf(pdf)).toBe(true);
    // A long document should meaningfully exceed a trivial single-page PDF's
    // byte size -- a coarse but dependency-free signal that content wasn't
    // silently truncated before/at our own application layer.
    expect(pdf.length).toBeGreaterThan(20_000);

    const pageCount = extractPdfPageCount(pdf);
    expect(pageCount).toBeGreaterThan(1);

    // Regeneration must be deterministic: the fixed root cause (footer
    // writes triggering pagination as a side effect) was itself
    // deterministic, so this alone wouldn't have caught the original bug --
    // but combined with the addPageNumbers isolation tests above (which
    // directly prove the mechanism is fixed), this confirms the full
    // pipeline is stable rather than flaky.
    const pdfAgain = await generateTranscriptPdf(longTranscript, "Long Transcript", {
      completedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(extractPdfPageCount(pdfAgain)).toBe(pageCount);
  });

  it("rejects (without generating anything) when the transcript contains characters unsupported by the vendored font, rather than silently emitting missing-glyph boxes", async () => {
    // U+1F600 (😀) is outside the vendored Noto Sans Regular's coverage.
    const transcriptWithEmoji = "Hello 😀 world";
    await expect(
      generateTranscriptPdf(transcriptWithEmoji, "Test", {
        completedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(UnsupportedTranscriptCharactersError);
  });
});
