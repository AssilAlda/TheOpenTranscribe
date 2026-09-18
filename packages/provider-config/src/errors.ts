/**
 * Safe, secret-free error type for this package. `message` must never embed
 * raw credential material -- callers (web routes, runner) may surface
 * `code`/`message` further, so both are held to that bar at the source.
 */
export class ProviderConfigError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ProviderConfigError";
    this.code = code;
  }
}
