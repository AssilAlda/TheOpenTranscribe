import { redactSecretText } from "@theopentranscribe/provider-config";

/**
 * Owner Decision 10 (stream-safe redaction, blocker B1 fix): Node delivers a
 * child process's stderr as arbitrarily-chunked `data` events -- there is no
 * guarantee a single logical line (let alone a single credential) arrives in
 * one chunk. Redacting each chunk independently (the original implementation)
 * could let a credential or a generic key/value secret pattern that happens
 * to straddle a chunk boundary slip through both halves unredacted, in the
 * live relay, the captured tail, and therefore jobs.error_message.
 *
 * This buffers incoming text and only redacts+emits once a full,
 * newline-terminated line has been assembled. That is safe -- not merely
 * convenient -- because every pattern in
 * @theopentranscribe/provider-config's redactSecretText matches within a
 * single line: real API keys/bearer tokens never contain a literal newline,
 * and a JSON string value's escaped newline (`\n`, two characters) never
 * introduces an actual line break either. So no possible match can span the
 * newline we buffer on, regardless of where Node happened to split the
 * underlying chunks -- reassembling a full line before redacting removes the
 * chunk-boundary question entirely rather than guessing at a "safe" carry
 * size.
 *
 * A single line that never terminates is bounded by MAX_LINE_BUFFER_CHARS to
 * avoid unbounded memory growth from a pathological child process. The
 * bound is fail-closed, not a heuristic carry window: a generic secret
 * pattern (an arbitrary-length Bearer token, a long `access_token=...`
 * value, etc.) has no fixed maximum length we could safely assume, so there
 * is no carry size that is provably large enough to guarantee a credential
 * never straddles a forced-flush cut. Rather than guess at one, once a line
 * exceeds the bound before its terminating newline arrives, NOTHING from
 * that line is ever emitted raw or partially redacted -- the whole line is
 * replaced by one fixed placeholder, and every remaining byte belonging to
 * that logical line (in this push call and any subsequent ones, until the
 * next newline) is discarded unseen. The security property: if we cannot
 * safely redact the complete line, we do not emit its content.
 */

const MAX_LINE_BUFFER_CHARS = 65536;
const OVERSIZED_LINE_PLACEHOLDER = "[stderr line too long -- suppressed]\n";

function redactLineSafely(text: string, knownSecrets: readonly string[]): string {
  try {
    return redactSecretText(text, knownSecrets);
  } catch {
    return "[stderr redaction error -- output suppressed]";
  }
}

export class StreamRedactor {
  private buffer = "";
  private suppressing = false;
  private readonly knownSecrets: readonly string[];

  constructor(knownSecrets: readonly string[] = []) {
    this.knownSecrets = knownSecrets;
  }

  /**
   * Feeds a new chunk. Returns the safe, already-redacted text ready to emit
   * now -- which may be empty if the chunk didn't complete a line.
   */
  push(chunk: string): string {
    let input = chunk;
    let safeOut = "";

    for (;;) {
      if (this.suppressing) {
        const newlineIdx = input.indexOf("\n");
        if (newlineIdx === -1) {
          // Still inside the suppressed line: discard the rest of this
          // chunk unseen and wait for the newline that ends it.
          input = "";
          break;
        }
        // The suppressed line ends here. Discard it (already represented
        // by the placeholder emitted when suppression began) and resume
        // normal handling for whatever follows the newline.
        input = input.slice(newlineIdx + 1);
        this.suppressing = false;
        continue;
      }

      const newlineIdx = input.indexOf("\n");
      if (newlineIdx !== -1) {
        const line = this.buffer + input.slice(0, newlineIdx + 1);
        this.buffer = "";
        input = input.slice(newlineIdx + 1);
        if (line.length > MAX_LINE_BUFFER_CHARS) {
          // The line completed (a newline did arrive) but its full length
          // still exceeds the bound -- treat it the same as a forced-flush
          // oversized line: never emit any of its raw content.
          safeOut += OVERSIZED_LINE_PLACEHOLDER;
        } else {
          safeOut += redactLineSafely(line, this.knownSecrets);
        }
        continue;
      }

      const candidate = this.buffer + input;
      if (candidate.length > MAX_LINE_BUFFER_CHARS) {
        // No newline yet and the line is already oversized: fail closed.
        // Nothing buffered or in this chunk for the line so far may be
        // emitted, in whole or in part. Enter suppression and discard.
        safeOut += OVERSIZED_LINE_PLACEHOLDER;
        this.buffer = "";
        this.suppressing = true;
        input = "";
        break;
      }

      this.buffer = candidate;
      input = "";
      break;
    }

    return safeOut;
  }

  /**
   * Flushes any remaining buffered (incomplete-line) content once the
   * underlying stream has ended -- there is no more data that could combine
   * with what's held to change how it should be redacted.
   *
   * If the stream ended while suppressing an oversized unterminated line,
   * that line's placeholder was already emitted by push() when suppression
   * began; there is no raw remainder to flush, so this emits nothing extra.
   */
  flush(): string {
    if (this.suppressing) {
      this.suppressing = false;
      this.buffer = "";
      return "";
    }
    const remaining = this.buffer;
    this.buffer = "";
    return remaining.length > 0 ? redactLineSafely(remaining, this.knownSecrets) : "";
  }
}
