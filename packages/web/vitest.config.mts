import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Default environment stays "node" (matches the existing lib/route
    // tests, which need real fs/DB access, not a DOM). Component tests opt
    // into jsdom individually via a `// @vitest-environment jsdom` docblock
    // at the top of the file -- see tests/components/*.test.tsx.
    setupFiles: ["./tests/setup/jsdomSetup.ts"],
  },
});
