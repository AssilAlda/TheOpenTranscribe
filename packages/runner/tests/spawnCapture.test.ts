import { afterEach, describe, expect, it, vi } from "vitest";

import { spawnCapture } from "../src/spawnCapture.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("spawnCapture", () => {
  it("resolves with code 0 on success", async () => {
    const result = await spawnCapture(process.execPath, ["-e", "process.exit(0)"], process.env);
    expect(result.code).toBe(0);
  });

  it("captures a non-zero exit code and stderr output", async () => {
    const result = await spawnCapture(
      process.execPath,
      ["-e", "console.error('boom'); process.exit(1)"],
      process.env,
    );
    expect(result.code).toBe(1);
    expect(result.stderrTail).toContain("boom");
  });

  it("reports a start failure via code: null instead of throwing", async () => {
    const result = await spawnCapture("/no/such/executable-xyz", [], process.env);
    expect(result.code).toBeNull();
    expect(result.stderrTail).toContain("failed to start subprocess");
  });

  it("truncates stderr to the last MAX_STDERR_TAIL_CHARS characters", async () => {
    const script = "console.error('a'.repeat(5000)); process.exit(1)";
    const result = await spawnCapture(process.execPath, ["-e", script], process.env);
    expect(result.code).toBe(1);
    expect(result.stderrTail.length).toBeLessThanOrEqual(4000);
  });

  // Owner Decision 10: this is the mandatory, centralized redaction backstop
  // for all subprocess stderr -- applied regardless of what the child
  // process actually prints.

  it("redacts an Authorization: Bearer header emitted by the child process", async () => {
    const script = "console.error('Authorization: Bearer sk-should-not-appear-1234567890'); process.exit(1)";
    const result = await spawnCapture(process.execPath, ["-e", script], process.env);
    expect(result.stderrTail).not.toContain("sk-should-not-appear-1234567890");
  });

  it("redacts a known-secret exact value even outside a recognized pattern", async () => {
    const secret = "totally-unstructured-secret-value-xyz";
    const script = `console.error('unexpected dump: ${secret}'); process.exit(1)`;
    const result = await spawnCapture(process.execPath, ["-e", script], process.env, undefined, [secret]);
    expect(result.stderrTail).not.toContain(secret);
  });

  it("does not affect stderr that contains no secret material", async () => {
    const script = "console.error('ordinary failure: file not found'); process.exit(1)";
    const result = await spawnCapture(process.execPath, ["-e", script], process.env);
    expect(result.stderrTail).toContain("ordinary failure: file not found");
  });

  // Blocker B1: cross-chunk redaction. streamRedactor.test.ts exercises the
  // StreamRedactor class directly with deterministic, hand-picked chunk
  // boundaries; these prove the real end-to-end wiring through an actual
  // child process, writing to stderr in two separate calls (separated by a
  // macrotask boundary so Node reliably delivers them as separate `data`
  // events) so a credential split exactly at the write boundary is still
  // fully redacted in the live-relayed output and the captured tail alike.

  it("never reconstructs an Authorization header split across two real stderr writes", async () => {
    const script = [
      "process.stderr.write('Authorization: Bearer sk-secret-PA');",
      "setTimeout(() => { process.stderr.write('RT-123456\\n'); process.exit(1); }, 30);",
    ].join(" ");
    const result = await spawnCapture(process.execPath, ["-e", script], process.env);
    expect(result.stderrTail).not.toContain("sk-secret-PART-123456");
  });

  it("never reconstructs a JSON api_key value split across two real stderr writes", async () => {
    const script = [
      "process.stderr.write(JSON.stringify({api_key: 'sk-secret-'}).slice(0, -2));",
      "setTimeout(() => { process.stderr.write('123456\"}\\n'); process.exit(1); }, 30);",
    ].join(" ");
    const result = await spawnCapture(process.execPath, ["-e", script], process.env);
    expect(result.stderrTail).not.toContain("sk-secret-123456");
  });

  it("never reconstructs an exact known credential split across two real stderr writes", async () => {
    const secret = "sk-known-real-spawn-secret-value";
    const mid = Math.floor(secret.length / 2);
    const script = [
      `process.stderr.write(${JSON.stringify(secret.slice(0, mid))});`,
      `setTimeout(() => { process.stderr.write(${JSON.stringify(secret.slice(mid))} + '\\n'); process.exit(1); }, 30);`,
    ].join(" ");
    const result = await spawnCapture(process.execPath, ["-e", script], process.env, undefined, [secret]);
    expect(result.stderrTail).not.toContain(secret);
  });

  // Blocker B1 re-review, TEST I: a real child process forced into genuine
  // separate `data` events for a single oversized, unterminated line -- one
  // write pushes the line past the internal bound with no newline, a later
  // write (across a real macrotask boundary) appends a known secret and
  // finally terminates the line. Proves the fail-closed placeholder path
  // through the actual wiring, on BOTH sinks: the live relay to this test
  // process's own stderr, and the captured/persisted tail.

  it("suppresses an oversized unterminated line spanning real separate stderr writes on both the live relay and the captured tail", async () => {
    const secret = "sk-real-spawn-oversized-secret-should-not-leak";
    const fillerLen = 70_000; // > MAX_LINE_BUFFER_CHARS (65536), no newline yet
    const script = [
      `process.stderr.write('x'.repeat(${fillerLen}));`,
      `setTimeout(() => { process.stderr.write(${JSON.stringify(secret)} + '\\n'); process.exit(1); }, 30);`,
    ].join(" ");

    const liveWrites: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
      liveWrites.push(typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString("utf-8"));
      return true;
    });

    const result = await spawnCapture(process.execPath, ["-e", script], process.env, undefined, [secret]);
    const liveOutput = liveWrites.join("");

    expect(result.stderrTail).not.toContain(secret);
    expect(result.stderrTail).not.toContain("x".repeat(100));
    expect(result.stderrTail).toContain("[stderr line too long -- suppressed]");

    expect(liveOutput).not.toContain(secret);
    expect(liveOutput).not.toContain("x".repeat(100));
    expect(liveOutput).toContain("[stderr line too long -- suppressed]");
  });
});
