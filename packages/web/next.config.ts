import { resolve } from "node:path";
import type { NextConfig } from "next";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..");

const nextConfig: NextConfig = {
  // @theopentranscribe/db ships its raw TypeScript source (main: "./src/index.ts",
  // matching packages/runner's existing consumption pattern) rather than a
  // compiled dist/ -- Next.js doesn't transform node_modules by default, so
  // this package needs to be opted in explicitly.
  transpilePackages: ["@theopentranscribe/db"],
  // @theopentranscribe/db is a sibling package (packages/db), linked into
  // node_modules via a `file:../db` symlink, matching packages/runner's
  // existing standalone-package pattern (docs/ARCHITECTURE.md §15's
  // workspace-tooling decision) -- its real location is outside
  // packages/web's own root, so both webpack and Turbopack need to be told
  // the true monorepo root to resolve/trace outside packages/web.
  outputFileTracingRoot: REPO_ROOT,
  experimental: {
    externalDir: true,
  },
  turbopack: {
    root: REPO_ROOT,
  },
};

export default nextConfig;
