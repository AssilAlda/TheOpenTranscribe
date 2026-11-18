/**
 * HTTP hardening scoped to the Provider/settings API surface only -- not an
 * app-wide header change. Every response from these routes gets
 * Cache-Control: no-store (credential-adjacent status must never be served
 * later from a cache) and X-Content-Type-Options: nosniff (cheap
 * defense-in-depth, no downside).
 */
export function withProviderSecurityHeaders(response: Response): Response {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}
