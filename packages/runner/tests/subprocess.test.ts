import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeManagedConfig } from "@theopentranscribe/provider-config";
import { afterEach, describe, expect, it, vi } from "vitest";

const spawnCaptureMock = vi.fn();
vi.mock("../src/spawnCapture.js", () => ({
  spawnCapture: (...args: unknown[]) => spawnCaptureMock(...args),
}));

const { runTranscriptionJob } = await import("../src/subprocess.js");

const tempDirs: string[] = [];
function makeTempConfigDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "totr-runner-subprocess-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  tempDirs.length = 0;
  spawnCaptureMock.mockReset();
});

describe("runTranscriptionJob", () => {
  it("invokes python -m transcriber.run_job with --input/--output and no --language when absent", async () => {
    spawnCaptureMock.mockResolvedValueOnce({ code: 0, stderrTail: "" });

    const result = await runTranscriptionJob({
      pythonBin: "/venv/bin/python",
      inputAbsolutePath: "/data/uploads/job1__a.mp3",
      outputAbsolutePath: "/data/outputs/job1.txt",
      language: null,
      env: { FOO: "bar", OPENAI_API_KEY: "sk-test-key" },
    });

    expect(result).toEqual({ ok: true, failureReason: "" });
    expect(spawnCaptureMock).toHaveBeenCalledWith(
      "/venv/bin/python",
      [
        "-m",
        "transcriber.run_job",
        "--input",
        "/data/uploads/job1__a.mp3",
        "--output",
        "/data/outputs/job1.txt",
      ],
      { FOO: "bar", OPENAI_API_KEY: "sk-test-key" },
      undefined,
      ["sk-test-key"],
    );
  });

  it("appends --language when a language is given", async () => {
    spawnCaptureMock.mockResolvedValueOnce({ code: 0, stderrTail: "" });

    await runTranscriptionJob({
      pythonBin: "/venv/bin/python",
      inputAbsolutePath: "/data/uploads/job1__a.mp3",
      outputAbsolutePath: "/data/outputs/job1.txt",
      language: "de",
      env: { OPENAI_API_KEY: "sk-test-key" },
    });

    expect(spawnCaptureMock).toHaveBeenCalledWith(
      "/venv/bin/python",
      expect.arrayContaining(["--language", "de"]),
      { OPENAI_API_KEY: "sk-test-key" },
      undefined,
      ["sk-test-key"],
    );
  });

  it("forwards an AbortSignal through to spawnCapture when given", async () => {
    spawnCaptureMock.mockResolvedValueOnce({ code: 0, stderrTail: "" });
    const controller = new AbortController();

    await runTranscriptionJob({
      pythonBin: "/venv/bin/python",
      inputAbsolutePath: "/in.mp3",
      outputAbsolutePath: "/out.txt",
      language: null,
      env: { OPENAI_API_KEY: "sk-test-key" },
      signal: controller.signal,
    });

    expect(spawnCaptureMock).toHaveBeenCalledWith(
      "/venv/bin/python",
      expect.any(Array),
      { OPENAI_API_KEY: "sk-test-key" },
      controller.signal,
      ["sk-test-key"],
    );
  });

  it("maps a non-zero exit code with stderr to ok: false with that reason", async () => {
    spawnCaptureMock.mockResolvedValueOnce({ code: 1, stderrTail: "Transcription failed: RuntimeError" });

    const result = await runTranscriptionJob({
      pythonBin: "/venv/bin/python",
      inputAbsolutePath: "/in.mp3",
      outputAbsolutePath: "/out.txt",
      language: null,
      env: { OPENAI_API_KEY: "sk-test-key" },
    });

    expect(result).toEqual({ ok: false, failureReason: "Transcription failed: RuntimeError" });
  });

  it("falls back to a generic reason when stderr was empty on failure", async () => {
    spawnCaptureMock.mockResolvedValueOnce({ code: 137, stderrTail: "" });

    const result = await runTranscriptionJob({
      pythonBin: "/venv/bin/python",
      inputAbsolutePath: "/in.mp3",
      outputAbsolutePath: "/out.txt",
      language: null,
      env: { OPENAI_API_KEY: "sk-test-key" },
    });

    expect(result.ok).toBe(false);
    expect(result.failureReason).toContain("137");
  });

  it("treats a failed-to-start process (code: null) as a failure", async () => {
    spawnCaptureMock.mockResolvedValueOnce({
      code: null,
      stderrTail: "failed to start subprocess: ENOENT",
    });

    const result = await runTranscriptionJob({
      pythonBin: "/no/such/python",
      inputAbsolutePath: "/in.mp3",
      outputAbsolutePath: "/out.txt",
      language: null,
      env: { OPENAI_API_KEY: "sk-test-key" },
    });

    expect(result).toEqual({ ok: false, failureReason: "failed to start subprocess: ENOENT" });
  });

  // Owner Decision 3: fresh per-job credential resolution (env > managed >
  // unconfigured), resolved immediately before spawn, never cached.

  it("fails safely before spawning when neither env nor managed credential exists", async () => {
    const dir = makeTempConfigDir();

    const result = await runTranscriptionJob({
      pythonBin: "/venv/bin/python",
      inputAbsolutePath: "/in.mp3",
      outputAbsolutePath: "/out.txt",
      language: null,
      env: { THEOPENTRANSCRIBE_CONFIG_DIR: dir },
    });

    expect(result.ok).toBe(false);
    expect(result.failureReason).toContain("OpenAI provider is not configured");
    expect(spawnCaptureMock).not.toHaveBeenCalled();
  });

  it("fails safely before spawning when the managed configuration is corrupt, without leaking file contents", async () => {
    const dir = makeTempConfigDir();
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(dir, "provider-config.json"), "{ not valid json, secret=sk-should-not-leak");

    const result = await runTranscriptionJob({
      pythonBin: "/venv/bin/python",
      inputAbsolutePath: "/in.mp3",
      outputAbsolutePath: "/out.txt",
      language: null,
      env: { THEOPENTRANSCRIBE_CONFIG_DIR: dir },
    });

    expect(result.ok).toBe(false);
    expect(result.failureReason).toContain("could not be read");
    expect(result.failureReason).toContain("corrupt");
    expect(result.failureReason).not.toContain("sk-should-not-leak");
    expect(spawnCaptureMock).not.toHaveBeenCalled();
  });

  it("resolves and injects the managed credential when env is absent", async () => {
    const dir = makeTempConfigDir();
    const env = { THEOPENTRANSCRIBE_CONFIG_DIR: dir };
    await writeManagedConfig("sk-managed-credential", env);
    spawnCaptureMock.mockResolvedValueOnce({ code: 0, stderrTail: "" });

    const result = await runTranscriptionJob({
      pythonBin: "/venv/bin/python",
      inputAbsolutePath: "/in.mp3",
      outputAbsolutePath: "/out.txt",
      language: null,
      env,
    });

    expect(result).toEqual({ ok: true, failureReason: "" });
    expect(spawnCaptureMock).toHaveBeenCalledWith(
      "/venv/bin/python",
      expect.any(Array),
      { THEOPENTRANSCRIBE_CONFIG_DIR: dir, OPENAI_API_KEY: "sk-managed-credential" },
      undefined,
      ["sk-managed-credential"],
    );
  });

  it("prefers the environment credential over a present managed credential", async () => {
    const dir = makeTempConfigDir();
    const env = { THEOPENTRANSCRIBE_CONFIG_DIR: dir, OPENAI_API_KEY: "sk-env-wins" };
    await writeManagedConfig("sk-managed-loses", env);
    spawnCaptureMock.mockResolvedValueOnce({ code: 0, stderrTail: "" });

    await runTranscriptionJob({
      pythonBin: "/venv/bin/python",
      inputAbsolutePath: "/in.mp3",
      outputAbsolutePath: "/out.txt",
      language: null,
      env,
    });

    expect(spawnCaptureMock).toHaveBeenCalledWith(
      "/venv/bin/python",
      expect.any(Array),
      expect.objectContaining({ OPENAI_API_KEY: "sk-env-wins" }),
      undefined,
      ["sk-env-wins"],
    );
  });

  it("does not mutate the caller's env object", async () => {
    const dir = makeTempConfigDir();
    const env = { THEOPENTRANSCRIBE_CONFIG_DIR: dir };
    await writeManagedConfig("sk-managed-credential", env);
    spawnCaptureMock.mockResolvedValueOnce({ code: 0, stderrTail: "" });

    await runTranscriptionJob({
      pythonBin: "/venv/bin/python",
      inputAbsolutePath: "/in.mp3",
      outputAbsolutePath: "/out.txt",
      language: null,
      env,
    });

    expect(env).not.toHaveProperty("OPENAI_API_KEY");
  });

  it("a job that already resolved its credential is unaffected by a later managed replacement (snapshot semantics at the call level)", async () => {
    const dir = makeTempConfigDir();
    const env = { THEOPENTRANSCRIBE_CONFIG_DIR: dir };
    await writeManagedConfig("sk-first", env);
    spawnCaptureMock.mockResolvedValueOnce({ code: 0, stderrTail: "" });

    await runTranscriptionJob({
      pythonBin: "/venv/bin/python",
      inputAbsolutePath: "/in.mp3",
      outputAbsolutePath: "/out.txt",
      language: null,
      env,
    });

    expect(spawnCaptureMock).toHaveBeenNthCalledWith(
      1,
      "/venv/bin/python",
      expect.any(Array),
      expect.objectContaining({ OPENAI_API_KEY: "sk-first" }),
      undefined,
      ["sk-first"],
    );

    // Configuration changes between jobs -- a brand new call resolves fresh.
    await writeManagedConfig("sk-second", env);
    spawnCaptureMock.mockResolvedValueOnce({ code: 0, stderrTail: "" });

    await runTranscriptionJob({
      pythonBin: "/venv/bin/python",
      inputAbsolutePath: "/in2.mp3",
      outputAbsolutePath: "/out2.txt",
      language: null,
      env,
    });

    expect(spawnCaptureMock).toHaveBeenNthCalledWith(
      2,
      "/venv/bin/python",
      expect.any(Array),
      expect.objectContaining({ OPENAI_API_KEY: "sk-second" }),
      undefined,
      ["sk-second"],
    );
  });
});
