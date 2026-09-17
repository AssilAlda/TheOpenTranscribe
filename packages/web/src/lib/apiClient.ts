/**
 * Minimal shared client-side fetch helper for the dashboard (Phase 6). Talks
 * to the existing Phase 5 same-origin API's `{data:...}`/`{error:{code,
 * message}}` envelope -- does not duplicate any job-persistence logic, just
 * parses the response shape already defined by src/lib/http.ts.
 */

export interface ApiErrorBody {
  code: string;
  message: string;
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
}

/** Fetches JSON from the API and returns the parsed body as-is (e.g. `{data, pagination}` or `{data}`). */
export async function apiRequest<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const err = (body as { error?: ApiErrorBody } | null)?.error;
    throw new ApiRequestError(
      res.status,
      err?.code ?? "unknown_error",
      err?.message ?? `Request failed with status ${res.status}.`,
    );
  }

  return body as T;
}
