/**
 * Shared response envelope for the web API: `{ data: ... }` on success,
 * `{ error: { code, message } }` on failure, with a real HTTP status code
 * in both cases.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function dataResponse<T>(data: T, status = 200): Response {
  return Response.json({ data }, { status });
}

export function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

export function apiErrorToResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return errorResponse(err.status, err.code, err.message);
  }
  // eslint-disable-next-line no-console
  console.error("Unhandled error in API route:", err);
  return errorResponse(500, "internal_error", "An unexpected error occurred.");
}
