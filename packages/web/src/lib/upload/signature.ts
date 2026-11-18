/**
 * Lightweight, streaming-compatible file-signature ("magic byte") checks.
 * Hardening on top of the extension allowlist, not full media-validity
 * verification, and not a single "one magic sequence per extension"
 * assumption -- related extensions are grouped into their real container
 * family.
 *
 * Actual guarantee per family (stated plainly, not oversold):
 * - mpeg-audio (.mp3/.mpga/.mpeg): leading ID3v2 tag OR a valid MPEG audio
 *   frame-sync word. Does not validate the audio data itself.
 * - iso-bmff (.mp4/.m4a): an "ftyp" box type within the first 32 bytes.
 *   Doesn't verify box structure/length fields beyond that, and doesn't
 *   distinguish audio-only .m4a from video-capable .mp4 at this layer.
 * - webm (.webm): EBML magic AND an EBML DocType value of literally "webm"
 *   found within the bounded prefix -- specifically rules out a same-family
 *   Matroska (.mkv) file renamed to .webm, but does not walk/verify EBML
 *   element structure otherwise.
 * - wav (.wav): RIFF....WAVE header. Doesn't validate the fmt/data chunks.
 * None of these prove the file is playable/well-formed media -- the
 * transcription provider may still reject a structurally valid container
 * with corrupt/unsupported audio.
 */

// 128 bytes is enough to reliably reach the EBML DocType element in a
// real-world WebM/Matroska header (needed to tell "webm" apart from
// "matroska" -- see matchesWebm below), while still being a small, bounded
// prefix -- never the whole file.
const SIGNATURE_PREFIX_BYTES = 128;

/** Accumulates only the first `cap` bytes seen across streamed chunks. */
export class SignatureSniffer {
  private readonly chunks: Buffer[] = [];
  private collected = 0;
  private readonly cap: number;

  constructor(cap: number = SIGNATURE_PREFIX_BYTES) {
    this.cap = cap;
  }

  push(chunk: Buffer): void {
    if (this.collected >= this.cap) return;
    const remaining = this.cap - this.collected;
    const slice = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
    this.chunks.push(Buffer.from(slice));
    this.collected += slice.length;
  }

  prefix(): Buffer {
    return Buffer.concat(this.chunks, this.collected);
  }
}

export type ContainerFamily = "mpeg-audio" | "iso-bmff" | "webm" | "wav";

const EXTENSION_TO_FAMILY: Record<string, ContainerFamily> = {
  mp3: "mpeg-audio",
  mpga: "mpeg-audio",
  mpeg: "mpeg-audio",
  mp4: "iso-bmff",
  m4a: "iso-bmff",
  webm: "webm",
  wav: "wav",
};

export function familyForExtension(extension: string): ContainerFamily | undefined {
  return EXTENSION_TO_FAMILY[extension.toLowerCase()];
}

function matchesMpegAudio(prefix: Buffer): boolean {
  // ID3v2 tag prefix ("ID3"), common at the start of .mp3 files.
  if (prefix.length >= 3 && prefix[0] === 0x49 && prefix[1] === 0x44 && prefix[2] === 0x33) {
    return true;
  }
  // MPEG audio frame sync word: 11 set bits (0xFF + top 3 bits of next byte).
  if (prefix.length >= 2 && prefix[0] === 0xff && (prefix[1]! & 0xe0) === 0xe0) {
    return true;
  }
  return false;
}

function matchesIsoBmff(prefix: Buffer): boolean {
  // ISO Base Media File Format: the first box is almost always "ftyp" with
  // its 4-byte type field at offset 4 (a 4-byte box-size field precedes it).
  // Search a bounded window rather than requiring exactly offset 4, so an
  // otherwise-legitimate file with a larger leading box (e.g. an 8-byte
  // "largesize" box header) isn't rejected on a brittle fixed offset.
  const searchWindow = prefix.subarray(0, Math.min(prefix.length, 32));
  return searchWindow.includes("ftyp", 0, "ascii");
}

function matchesWebm(prefix: Buffer): boolean {
  // EBML header magic (0x1A45DFA3) is shared by WebM *and* plain Matroska --
  // it alone only proves "EBML container", not "WebM specifically". WebM is
  // a constrained profile of Matroska whose EBML header always declares its
  // DocType as the literal ASCII string "webm" (element ID 0x4282); a
  // renamed/mislabeled .mkv (DocType "matroska") will not contain it. This
  // is a bounded substring search, not a full EBML parse -- it doesn't walk
  // element IDs/lengths -- but it does distinguish "confirmed WebM" from
  // "some EBML-based container" within the same lightweight-check budget.
  const hasEbmlMagic =
    prefix.length >= 4 &&
    prefix[0] === 0x1a &&
    prefix[1] === 0x45 &&
    prefix[2] === 0xdf &&
    prefix[3] === 0xa3;
  if (!hasEbmlMagic) return false;
  return prefix.includes("webm", 4, "ascii");
}

function matchesWav(prefix: Buffer): boolean {
  if (prefix.length < 12) return false;
  return (
    prefix.subarray(0, 4).toString("ascii") === "RIFF" &&
    prefix.subarray(8, 12).toString("ascii") === "WAVE"
  );
}

/**
 * Confirms the collected leading bytes are consistent with the container
 * family implied by the upload's (already allowlisted) extension.
 */
export function matchesContainerFamily(family: ContainerFamily, prefix: Buffer): boolean {
  switch (family) {
    case "mpeg-audio":
      return matchesMpegAudio(prefix);
    case "iso-bmff":
      return matchesIsoBmff(prefix);
    case "webm":
      return matchesWebm(prefix);
    case "wav":
      return matchesWav(prefix);
  }
}
