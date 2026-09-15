import { describe, expect, it } from "vitest";

import { loadConfig, RunnerConfigError } from "../src/config.js";

function baseEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return {
    DATA_DIR: "/tmp/data",
    TRANSCRIBER_PYTHON_BIN: "/usr/bin/python3",
    ...overrides,
  };
}

describe("loadConfig", () => {
  it("throws when DATA_DIR is missing", () => {
    const env = baseEnv();
    delete env.DATA_DIR;
    expect(() => loadConfig(env)).toThrow(RunnerConfigError);
  });

  it("throws when TRANSCRIBER_PYTHON_BIN is missing", () => {
    const env = baseEnv();
    delete env.TRANSCRIBER_PYTHON_BIN;
    expect(() => loadConfig(env)).toThrow(RunnerConfigError);
  });

  it("defaults pollIntervalMs to 5000", () => {
    const config = loadConfig(baseEnv());
    expect(config.pollIntervalMs).toBe(5000);
  });

  it("honors a valid RUNNER_POLL_INTERVAL_MS override", () => {
    const config = loadConfig(baseEnv({ RUNNER_POLL_INTERVAL_MS: "2000" }));
    expect(config.pollIntervalMs).toBe(2000);
  });

  it("falls back to the default for an invalid RUNNER_POLL_INTERVAL_MS", () => {
    const config = loadConfig(baseEnv({ RUNNER_POLL_INTERVAL_MS: "not-a-number" }));
    expect(config.pollIntervalMs).toBe(5000);
  });

  it("falls back to the default for a non-positive RUNNER_POLL_INTERVAL_MS", () => {
    const config = loadConfig(baseEnv({ RUNNER_POLL_INTERVAL_MS: "-5" }));
    expect(config.pollIntervalMs).toBe(5000);
  });
});
