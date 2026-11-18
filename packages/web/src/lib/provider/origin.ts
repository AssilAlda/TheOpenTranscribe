/**
 * Origin validation for state-changing Provider/settings routes, anchored to
 * a trusted origin the server itself decides -- never to the request's own
 * inbound `Host` header. A naive `Origin === reflected Host` check is
 * bypassable via DNS rebinding: an attacker's own page (whose Origin and Host
 * already agree with each other, by definition of same-origin requests) can
 * have its hostname's DNS re-pointed, after initial page load, at this server
 * -- passing a check that only compares Origin against Host, since both
 * headers still agree with each other on the attacker's hostname. This module
 * never reads `Host` or any `X-Forwarded-*` header for this decision -- there
 * is no reverse-proxy support, and internet exposure without an external
 * protection layer remains an unsupported deployment model.
 *
 * Trusted origins:
 *   1. Any `http(s)://localhost|127.0.0.1|[::1]` origin, at any port --
 *      safe regardless of the request's own headers, because a remote
 *      attacker's page can never genuinely have "localhost"/"127.0.0.1"/
 *      "[::1]" as ITS OWN origin without already running code on the
 *      victim's machine (a materially different, out-of-scope threat
 *      model than a remote page attacking a local service).
 *   2. Any origin explicitly listed in THEOPENTRANSCRIBE_TRUSTED_ORIGINS
 *      (comma-separated exact origins, e.g.
 *      "http://192.168.1.50:3000,http://transcribe.lan:3000") -- the
 *      concrete mechanism an operator opts a trusted-LAN deployment into,
 *      beyond plain localhost. Not required for the default localhost
 *      deployment model.
 *
 * A missing Origin header is rejected outright, not treated as trusted by
 * default: a real browser always sends Origin on a state-changing fetch/
 * XHR issued from a page context, so this never breaks the actual Provider
 * UI, and it avoids an ambiguous "no evidence either way" case on the one
 * class of route that mutates a credential.
 */

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function isLoopbackOrigin(origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  return LOOPBACK_HOSTNAMES.has(url.hostname.toLowerCase());
}

function explicitlyTrustedOrigins(env: NodeJS.ProcessEnv): Set<string> {
  const raw = env.THEOPENTRANSCRIBE_TRUSTED_ORIGINS;
  if (!raw || raw.trim() === "") return new Set();
  return new Set(
    raw
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );
}

export function isTrustedOrigin(origin: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (isLoopbackOrigin(origin)) return true;
  return explicitlyTrustedOrigins(env).has(origin);
}

/**
 * True only if the request carries an `Origin` header and it is trusted.
 * Never consults `Host`/`X-Forwarded-*`. Callers reject the request (403)
 * on `false` -- kept as a pure boolean here so the route handler owns the
 * actual HTTP-error mapping.
 */
export function isRequestOriginTrusted(request: Request, env: NodeJS.ProcessEnv = process.env): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return isTrustedOrigin(origin, env);
}
