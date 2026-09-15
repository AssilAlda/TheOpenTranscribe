import { describe, expect, it, vi } from "vitest";

const spawnCaptureMock = vi.fn();
vi.mock("../src/spawnCapture.js", () => ({
  spawnCapture: (...args: unknown[]) => spawnCaptureMock(...args),
}));

const { runTranscriptionJob } = await import("../src/subprocess.js");

describe("runTranscriptionJob", () => {
  it("invokes python -m transcriber.run_job with --input/--output and no --language when absent", async () => {
    spawnCaptureMock.mockResolvedValueOnce({ code: 0, stderrTail: "" });

    const result = await runTranscriptionJob({
      pythonBin: "/venv/bin/python",
      inputAbsolutePath: "/data/uploads/job1__a.mp3",
      outputAbsolutePath: "/data/outputs/job1.txt",
      language: null,
      env: { FOO: "bar" },
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
      { FOO: "bar" },
      undefined,
    );
  });

  it("appends --language when a language is given", async () => {
    spawnCaptureMock.mockResolvedValueOnce({ code: 0, stderrTail: "" });

    await runTranscriptionJob({
      pythonBin: "/venv/bin/python",
      inputAbsolutePath: "/data/uploads/job1__a.mp3",
      outputAbsolutePath: "/data/outputs/job1.txt",
      language: "de",
      env: {},
    });

    expect(spawnCaptureMock).toHaveBeenCalledWith(
      "/venv/bin/python",
      expect.arrayContaining(["--language", "de"]),
      {},
      undefined,
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
      env: {},
      signal: controller.signal,
    });

    expect(spawnCaptureMock).toHaveBeenCalledWith(
      "/venv/bin/python",
      expect.any(Array),
      {},
      controller.signal,
    );
  });

  it("maps a non-zero exit code with stderr to ok: false with that reason", async () => {
    spawnCaptureMock.mockResolvedValueOnce({ code: 1, stderrTail: "Transcription failed: boom" });

    const result = await runTranscriptionJob({
      pythonBin: "/venv/bin/python",
      inputAbsolutePath: "/in.mp3",
      outputAbsolutePath: "/out.txt",
      language: null,
      env: {},
    });

    expect(result).toEqual({ ok: false, failureReason: "Transcription failed: boom" });
  });

  it("falls back to a generic reason when stderr was empty on failure", async () => {
    spawnCaptureMock.mockResolvedValueOnce({ code: 137, stderrTail: "" });

    const result = await runTranscriptionJob({
      pythonBin: "/venv/bin/python",
      inputAbsolutePath: "/in.mp3",
      outputAbsolutePath: "/out.txt",
      language: null,
      env: {},
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
      env: {},
    });

    expect(result).toEqual({ ok: false, failureReason: "failed to start subprocess: ENOENT" });
  });
});
