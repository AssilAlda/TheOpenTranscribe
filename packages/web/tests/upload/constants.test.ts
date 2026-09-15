import { describe, expect, it } from "vitest";

import { extensionOf, isAllowedExtension } from "@/lib/upload/constants";

describe("upload extension allowlist (locked docs/ARCHITECTURE.md §15)", () => {
  it.each(["mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm"])(
    "accepts .%s",
    (ext) => {
      expect(isAllowedExtension(`file.${ext}`)).toBe(true);
    },
  );

  it("is case-insensitive", () => {
    expect(isAllowedExtension("FILE.WAV")).toBe(true);
    expect(isAllowedExtension("file.Mp3")).toBe(true);
  });

  it("rejects extensions outside the allowlist", () => {
    expect(isAllowedExtension("file.exe")).toBe(false);
    expect(isAllowedExtension("file.txt")).toBe(false);
    expect(isAllowedExtension("file")).toBe(false);
  });

  it("extensionOf handles missing/trailing-dot filenames safely", () => {
    expect(extensionOf("file")).toBe("");
    expect(extensionOf("file.")).toBe("");
    expect(extensionOf("a.b.wav")).toBe("wav");
  });
});
