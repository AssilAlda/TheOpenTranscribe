# Security Policy

## Supported versions

Only the latest release (and the `main` branch) receives security fixes.

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Report it privately through GitHub instead:
**Security** tab → **Report a vulnerability**
(https://github.com/AssilAlda/TheOpenTranscribe/security/advisories/new).

Include what you found, how to reproduce it, and what an attacker could do
with it. You should get a reply within a week. Once a fix is released, the
advisory is published and you're credited unless you prefer otherwise.

## Security model (what is and isn't in scope)

TheOpenTranscribe is a **single-user, self-hosted** app with **no login**.
It is designed to run on your own computer, and by default the Docker setup
only listens on `127.0.0.1`.

In scope, for example:

- Leaking the OpenAI API key (in logs, API responses, error messages, the UI).
- Another website being able to use your running instance through your
  browser (CSRF, DNS rebinding, origin-check bypasses).
- Path traversal or file access outside `DATA_DIR` via uploads or job IDs.
- Command injection in the runner / transcriber subprocess.

Out of scope:

- Anyone who can reach the app over the network being able to use it — that
  is expected when you expose it (`THEOPENTRANSCRIBE_BIND=0.0.0.0`). Put a
  VPN or an authenticating reverse proxy in front of it.
- The API key being stored in plain text on the host (documented behavior;
  the file is created with `0600` permissions).
- Vulnerabilities in OpenAI's API or in third-party dependencies with no
  exploitable path through this app (please report those upstream).
