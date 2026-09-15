import { describe, expect, it } from "vitest";

import { spawnCapture } from "../src/spawnCapture.js";

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
});
