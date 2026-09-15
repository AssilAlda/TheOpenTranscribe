import { describe, expect, it } from "vitest";

import {
  familyForExtension,
  matchesContainerFamily,
  SignatureSniffer,
} from "@/lib/upload/signature";

describe("familyForExtension", () => {
  it("groups related extensions into their real container family", () => {
    expect(familyForExtension("mp3")).toBe("mpeg-audio");
    expect(familyForExtension("mpga")).toBe("mpeg-audio");
    expect(familyForExtension("mpeg")).toBe("mpeg-audio");
    expect(familyForExtension("mp4")).toBe("iso-bmff");
    expect(familyForExtension("m4a")).toBe("iso-bmff");
    expect(familyForExtension("webm")).toBe("webm");
    expect(familyForExtension("wav")).toBe("wav");
  });

  it("is case-insensitive and returns undefined for unknown extensions", () => {
    expect(familyForExtension("WAV")).toBe("wav");
    expect(familyForExtension("exe")).toBeUndefined();
  });
});

describe("matchesContainerFamily", () => {
  it("accepts an ID3-tagged mp3 prefix", () => {
    const prefix = Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00]);
    expect(matchesContainerFamily("mpeg-audio", prefix)).toBe(true);
  });

  it("accepts a raw MPEG frame-sync mp3 prefix", () => {
    const prefix = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
    expect(matchesContainerFamily("mpeg-audio", prefix)).toBe(true);
  });

  it("rejects a non-mpeg prefix for mpeg-audio", () => {
    expect(matchesContainerFamily("mpeg-audio", Buffer.from("not audio"))).toBe(false);
  });

  it("accepts an ISO-BMFF ftyp box for mp4/m4a", () => {
    const prefix = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x18]),
      Buffer.from("ftypM4A "),
    ]);
    expect(matchesContainerFamily("iso-bmff", prefix)).toBe(true);
  });

  it("rejects a short or non-ftyp prefix for iso-bmff", () => {
    expect(matchesContainerFamily("iso-bmff", Buffer.from([0x00, 0x00]))).toBe(false);
    expect(matchesContainerFamily("iso-bmff", Buffer.from("randombytes!"))).toBe(false);
  });

  it("accepts an EBML header whose DocType is literally 'webm'", () => {
    // EBML magic, then (roughly) an EBML header containing the DocType
    // element (ID 0x4282) with value "webm" -- matches the real-world
    // structure closely enough for the bounded substring check.
    const prefix = Buffer.concat([
      Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01]),
      Buffer.from([0x42, 0x82, 0x84]),
      Buffer.from("webm"),
    ]);
    expect(matchesContainerFamily("webm", prefix)).toBe(true);
  });

  it("rejects a non-EBML prefix for webm", () => {
    expect(matchesContainerFamily("webm", Buffer.from([0x00, 0x00, 0x00, 0x00]))).toBe(false);
  });

  it("rejects EBML content whose DocType is 'matroska', not 'webm' (a mislabeled .mkv)", () => {
    const prefix = Buffer.concat([
      Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01]),
      Buffer.from([0x42, 0x82, 0x88]),
      Buffer.from("matroska"),
    ]);
    expect(matchesContainerFamily("webm", prefix)).toBe(false);
  });

  it("accepts a RIFF/WAVE header for wav", () => {
    const prefix = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WAVE")]);
    expect(matchesContainerFamily("wav", prefix)).toBe(true);
  });

  it("rejects a RIFF header without WAVE for wav", () => {
    const prefix = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("AVI ")]);
    expect(matchesContainerFamily("wav", prefix)).toBe(false);
  });
});

describe("SignatureSniffer", () => {
  it("retains only the first `cap` bytes across multiple pushed chunks", () => {
    const sniffer = new SignatureSniffer(8);
    sniffer.push(Buffer.from([1, 2, 3, 4, 5]));
    sniffer.push(Buffer.from([6, 7, 8, 9, 10]));
    expect(sniffer.prefix()).toEqual(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]));
  });

  it("ignores chunks pushed after the cap is reached", () => {
    const sniffer = new SignatureSniffer(4);
    sniffer.push(Buffer.from([1, 2, 3, 4]));
    sniffer.push(Buffer.from([5, 6, 7, 8]));
    expect(sniffer.prefix()).toEqual(Buffer.from([1, 2, 3, 4]));
  });
});
