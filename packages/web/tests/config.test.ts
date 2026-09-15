import { describe, expect, it } from "vitest";

import { loadConfig, WebConfigError } from "@/lib/config";

describe("loadConfig", () => {
  it("reads DATA_DIR from the given env", () => {
    expect(loadConfig({ DATA_DIR: "/tmp/data" } as unknown as NodeJS.ProcessEnv)).toEqual({
      dataDir: "/tmp/data",
    });
  });

  it("throws WebConfigError when DATA_DIR is missing", () => {
    expect(() => loadConfig({} as unknown as NodeJS.ProcessEnv)).toThrow(WebConfigError);
  });

  it("throws WebConfigError when DATA_DIR is blank", () => {
    expect(() => loadConfig({ DATA_DIR: "   " } as unknown as NodeJS.ProcessEnv)).toThrow(
      WebConfigError,
    );
  });
});
