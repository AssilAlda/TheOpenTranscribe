import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveConfigDir } from "../src/configDir.js";
import { ProviderConfigError } from "../src/errors.js";

describe("resolveConfigDir", () => {
  it("uses THEOPENTRANSCRIBE_CONFIG_DIR when set to an absolute path", () => {
    const dir = resolveConfigDir({ THEOPENTRANSCRIBE_CONFIG_DIR: "/srv/theopentranscribe/config" });
    expect(dir).toBe("/srv/theopentranscribe/config");
  });

  it("rejects a relative THEOPENTRANSCRIBE_CONFIG_DIR value", () => {
    expect(() => resolveConfigDir({ THEOPENTRANSCRIBE_CONFIG_DIR: "relative/path" })).toThrow(
      ProviderConfigError,
    );
  });

  it("does not depend on CWD when the env var is unset", () => {
    const a = resolveConfigDir({});
    const b = resolveConfigDir({});
    expect(a).toBe(b);
  });

  it("falls back to $XDG_CONFIG_HOME/theopentranscribe when XDG_CONFIG_HOME is set and absolute", () => {
    const dir = resolveConfigDir({ XDG_CONFIG_HOME: "/home/user/.config" });
    expect(dir).toBe(join("/home/user/.config", "theopentranscribe"));
  });

  it("ignores a relative XDG_CONFIG_HOME and falls back to the home-directory default", () => {
    const dir = resolveConfigDir({ XDG_CONFIG_HOME: "relative/config" });
    expect(dir).toBe(join(homedir(), ".theopentranscribe"));
  });

  it("falls back to ~/.theopentranscribe when nothing is set", () => {
    const dir = resolveConfigDir({});
    expect(dir).toBe(join(homedir(), ".theopentranscribe"));
  });

  it("is independent of DATA_DIR -- never derives from it", () => {
    const dir = resolveConfigDir({ DATA_DIR: "/srv/theopentranscribe/data" });
    expect(dir).not.toContain("/srv/theopentranscribe/data");
  });
});
