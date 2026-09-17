import { openSync as openFontSync, type Font } from "fontkit";
import PDFDocument from "pdfkit";
import path from "node:path";

// `import.meta.dirname` does not survive Next.js/Turbopack's server bundling
// for Route Handlers (it evaluates to `undefined` at build/runtime inside
// the bundle) -- found and fixed during Phase 6's own `next build` check.
// `process.cwd()` is the reliable anchor instead: Next.js always runs (dev,
// build, and `next start`) with cwd set to this package's root.
/** Exported for reuse by tests that need to build a comparable reference pdfkit document. */
export const FONT_PATH = path.join(process.cwd(), "src", "lib", "pdf", "fonts", "NotoSans-Regular.ttf");

/** 1 inch, in PDF points. Exported for reuse by tests that need a comparable reference document. */
export const PAGE_MARGIN = 72;
/** PDF points, between paragraphs -- within the owner-approved 6-10pt range. Exported for direct assertion in tests. */
export const PARAGRAPH_GAP = 8;

export interface TranscriptPdfMetadata {
  /** Safe source filename derived from the job's stored media_path (see filename.ts). Never the raw client filename. */
  sourceFilename?: string;
  completedAt: string;
  language?: string;
}

export class UnsupportedTranscriptCharactersError extends Error {
  readonly unsupportedCharacters: readonly string[];

  constructor(unsupportedCharacters: readonly string[]) {
    super(
      "Transcript contains characters that are not supported by the PDF export font.",
    );
    this.name = "UnsupportedTranscriptCharactersError";
    this.unsupportedCharacters = unsupportedCharacters;
  }
}

let cachedFont: Font | null = null;

/** Loads (and caches) the vendored Noto Sans font via fontkit, for glyph-coverage checks. */
function loadFont(): Font {
  if (!cachedFont) {
    const font = openFontSync(FONT_PATH);
    if (!("hasGlyphForCodePoint" in font)) {
      throw new Error(
        `Vendored PDF font at ${FONT_PATH} is a font collection, not a single font.`,
      );
    }
    cachedFont = font;
  }
  return cachedFont;
}

/**
 * Returns the distinct, non-whitespace characters in `text` that the
 * vendored PDF export font has no glyph for. Checked directly against the
 * embedded font's actual coverage via fontkit's `hasGlyphForCodePoint`, not
 * assumed from the font family name (docs/ARCHITECTURE.md's Phase 6 section
 * records why: Noto Sans Regular alone does not cover every script, and
 * this must never be silently guessed).
 */
export function findUnsupportedCharacters(text: string): string[] {
  const font = loadFont();
  const unsupported = new Set<string>();

  for (const char of text) {
    if (/\s/.test(char)) continue;
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined) continue;
    if (!font.hasGlyphForCodePoint(codePoint)) {
      unsupported.add(char);
    }
  }

  return [...unsupported];
}

/**
 * Splits a transcript into paragraphs on one-or-more blank lines, trimming
 * each paragraph's own leading/trailing whitespace. Single newlines *within*
 * a paragraph are left untouched (still rendered as forced line breaks by
 * pdfkit, exactly as before) -- only blank-line-delimited paragraph
 * boundaries are treated specially, per the original transcript structure.
 * Never collapses the transcript into one continuous block, and always
 * returns at least one (possibly empty) element so the caller's render loop
 * has something to render even for a degenerate input.
 */
export function splitIntoParagraphs(transcript: string): string[] {
  const paragraphs = transcript
    .split(/\n[ \t]*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
  return paragraphs.length > 0 ? paragraphs : [transcript];
}

/**
 * Adds "N / total" footers to every buffered page, using the real physical
 * page count at the time this runs (not a count captured earlier).
 *
 * pdfkit's automatic pagination triggers whenever the document's y cursor
 * (including an explicit y passed to .text()) exceeds `page.maxY()`, i.e.
 * `page.height - margins.bottom` -- which a footer placed inside the bottom
 * margin always does by design. Left alone, writing the very last page's
 * footer silently appends a new blank page to hold it (the root cause of a
 * real bug found in review: a one-page transcript produced a trailing blank
 * second page, whose footer then incorrectly read "1 / 1"). Temporarily
 * zeroing the current page's bottom margin while writing the footer keeps
 * that y within `maxY()`, so the footer never triggers pagination as a
 * side effect.
 */
export function addPageNumbers(doc: PDFKit.PDFDocument): void {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const originalBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    const label = `${i - range.start + 1} / ${range.count}`;
    doc
      .fontSize(9)
      .fillColor("#888888")
      .text(label, PAGE_MARGIN, doc.page.height - PAGE_MARGIN + 24, {
        align: "center",
        width: doc.page.width - PAGE_MARGIN * 2,
        lineBreak: false,
      });

    doc.page.margins.bottom = originalBottomMargin;
  }
}

/**
 * Reads the physical page count directly declared in a generated PDF's own
 * page tree (`/Type /Pages ... /Count N`), which pdfkit always writes as
 * plain, uncompressed ASCII in the object dictionary (only content streams
 * are zlib-compressed) -- confirmed by inspecting real generated output.
 * A tiny, dependency-free way to assert the *actual* physical page count a
 * generation call produced, without adding a second PDF-parsing library.
 */
export function extractPdfPageCount(pdf: Buffer): number {
  // Only the page tree's own /Pages object declares /Count in a pdfkit
  // document -- no other object type does -- so a direct scan is reliable.
  const match = /\/Count\s+(\d+)/.exec(pdf.toString("latin1"));
  if (!match || !match[1]) {
    throw new Error("Could not find a /Pages page count in the generated PDF.");
  }
  return Number(match[1]);
}

/**
 * Generates a professional, multi-page PDF rendering of a completed
 * transcript, embedding the vendored Noto Sans font for Unicode support.
 * Entirely in-memory and ephemeral -- the returned buffer is never written
 * to DATA_DIR; this function has no filesystem side effects of its own
 * beyond reading the already-vendored, committed font file.
 *
 * Throws UnsupportedTranscriptCharactersError (without generating anything)
 * if the transcript contains characters the vendored font can't render --
 * callers must translate that into a safe, honest failure response rather
 * than ever producing a PDF with missing-glyph boxes.
 */
export function generateTranscriptPdf(
  transcript: string,
  title: string,
  metadata: TranscriptPdfMetadata,
): Promise<Buffer> {
  const unsupported = findUnsupportedCharacters(transcript);
  if (unsupported.length > 0) {
    return Promise.reject(new UnsupportedTranscriptCharactersError(unsupported));
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: {
        top: PAGE_MARGIN,
        bottom: PAGE_MARGIN,
        left: PAGE_MARGIN,
        right: PAGE_MARGIN,
      },
      bufferPages: true,
      info: { Title: title },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err: Error) => reject(err));

    doc.font(FONT_PATH);

    doc.fontSize(20).fillColor("#111111").text(title, { align: "left" });
    doc.moveDown(0.75);

    doc.fontSize(10).fillColor("#555555");
    if (metadata.sourceFilename) {
      doc.text(`Source: ${metadata.sourceFilename}`);
    }
    doc.text(`Completed: ${metadata.completedAt}`);
    if (metadata.language) {
      doc.text(`Language: ${metadata.language}`);
    }
    doc.moveDown(1.25);

    doc.fontSize(11).fillColor("#000000");
    // pdfkit's `paragraphGap` option only fires once, after the very last
    // line of a single .text() call -- passing the whole transcript (with
    // blank lines between paragraphs) as one call never actually used it;
    // the visible gap was just a raw blank line's full line-height, which
    // read as too large. Rendering one .text() call per paragraph instead
    // makes `paragraphGap` apply between each of them, as intended, while
    // still preserving single newlines and multi-page flow within a
    // paragraph exactly as before.
    const paragraphs = splitIntoParagraphs(transcript);
    paragraphs.forEach((paragraph, index) => {
      const isLast = index === paragraphs.length - 1;
      doc.text(paragraph, {
        align: "left",
        lineGap: 4,
        paragraphGap: isLast ? 0 : PARAGRAPH_GAP,
      });
    });

    addPageNumbers(doc);

    doc.end();
  });
}
