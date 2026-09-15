import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildOutputRelativePath,
  buildUploadRelativePath,
  ensureDataDirLayout,
  isDataDirRelativePath,
  PathSafetyError,
  resolveDataDir,
  resolveWithinDataDir,
  sanitizeFilenameSegment,
} from "../src/paths.js";

const tempDirs: string[] = [];
function makeTempDataDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "totr-db-paths-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  // temp dirs are process-scoped scratch space; no explicit cleanup required
  // for the test run, but keep the array from growing unbounded across a
  // long watch session.
  tempDirs.length = 0;
});

describe("isDataDirRelativePath", () => {
  it.each([
    "uploads/abc__file.mp4",
    "outputs/abc.txt",
    "a/b/c.txt",
    "file.txt",
  ])("accepts %s", (value) => {
    expect(isDataDirRelativePath(value)).toBe(true);
  });

  it.each([
    ["/etc/passwd", "leading slash"],
    ["\\windows\\file", "leading backslash"],
    ["C:/file.txt", "drive letter"],
    ["../escape.txt", "parent traversal"],
    ["uploads/../../escape.txt", "embedded parent traversal"],
    ["", "empty string"],
  ])("rejects %s (%s)", (value) => {
    expect(isDataDirRelativePath(value)).toBe(false);
  });
});

describe("resolveDataDir", () => {
  it("resolves a relative path to an absolute one", () => {
    const resolved = resolveDataDir("./some-data-dir");
    expect(resolved).toMatch(/some-data-dir$/);
    expect(resolved.startsWith("/") || /^[a-zA-Z]:/.test(resolved)).toBe(true);
  });

  it("throws on an empty path", () => {
    expect(() => resolveDataDir("")).toThrow(PathSafetyError);
  });
});

describe("resolveWithinDataDir", () => {
  it("resolves a safe relative path", () => {
    const dataDir = makeTempDataDir();
    const resolved = resolveWithinDataDir(dataDir, "uploads/job__file.mp4");
    expect(resolved).toBe(join(resolveDataDir(dataDir), "uploads", "job__file.mp4"));
  });

  it("rejects traversal outside DATA_DIR", () => {
    const dataDir = makeTempDataDir();
    expect(() => resolveWithinDataDir(dataDir, "../outside.txt")).toThrow(PathSafetyError);
  });

  it("rejects an absolute path", () => {
    const dataDir = makeTempDataDir();
    expect(() => resolveWithinDataDir(dataDir, "/etc/passwd")).toThrow(PathSafetyError);
  });
});

describe("sanitizeFilenameSegment", () => {
  it("strips directory components from a malicious filename", () => {
    expect(sanitizeFilenameSegment("../../etc/passwd")).not.toContain("/");
    expect(sanitizeFilenameSegment("../../etc/passwd")).not.toContain("..");
  });

  it("replaces unsafe characters", () => {
    expect(sanitizeFilenameSegment("my file (final)!.mp4")).toBe("my_file__final__.mp4");
  });

  it("keeps a normal filename intact", () => {
    expect(sanitizeFilenameSegment("interview.mp3")).toBe("interview.mp3");
  });

  it("never returns an empty string", () => {
    expect(sanitizeFilenameSegment("...")).not.toBe("");
    expect(sanitizeFilenameSegment("")).toBe("file");
  });
});

describe("buildUploadRelativePath / buildOutputRelativePath", () => {
  it("builds paths matching the locked DATA_DIR layout", () => {
    const jobId = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
    expect(buildUploadRelativePath(jobId, "interview.mp3")).toBe(
      `uploads/${jobId}__interview.mp3`,
    );
    expect(buildOutputRelativePath(jobId)).toBe(`outputs/${jobId}.txt`);
  });

  it("produced paths are always valid DATA_DIR-relative paths", () => {
    const jobId = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
    expect(isDataDirRelativePath(buildUploadRelativePath(jobId, "../../evil.mp4"))).toBe(true);
    expect(isDataDirRelativePath(buildOutputRelativePath(jobId))).toBe(true);
  });
});

describe("ensureDataDirLayout", () => {
  it("creates DATA_DIR, uploads/, and outputs/", () => {
    const dataDir = makeTempDataDir();
    const nested = join(dataDir, "nested-data-dir");
    const root = ensureDataDirLayout(nested);
    expect(existsSync(root)).toBe(true);
    expect(existsSync(join(root, "uploads"))).toBe(true);
    expect(existsSync(join(root, "outputs"))).toBe(true);
  });
});
