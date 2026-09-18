import { dataResponse } from "@/lib/http";

// Phase 8: dependency-free liveness endpoint for the Docker/compose
// healthcheck. Deliberately never opens the DB connection -- a slow or
// locked SQLite file is a distinct, more specific failure already surfaced
// by /api/jobs, not something a liveness probe should conflate with process
// liveness.
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return dataResponse({ status: "ok" });
}
