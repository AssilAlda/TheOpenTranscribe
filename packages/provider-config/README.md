# @theopentranscribe/provider-config

Part of [TheOpenTranscribe](../../README.md).

Stores and resolves the OpenAI API key. The [web app](../web) saves the key from the Provider page, and the [runner](../runner) reads it for each job.

### How the key is resolved

| Priority | Source | Notes |
|---|---|---|
| 1 | `OPENAI_API_KEY` environment variable | Always wins. Shown as locked in the app. |
| 2 | Key saved from the Provider page | Stored in `provider-config.json` in the config folder. |
| 3 | None | Jobs fail with a clear message asking you to add a key. |

### Config folder

| Setting | Folder |
|---|---|
| `THEOPENTRANSCRIBE_CONFIG_DIR` set | That folder (must be an absolute path) |
| Otherwise, `XDG_CONFIG_HOME` set | `$XDG_CONFIG_HOME/theopentranscribe` |
| Otherwise | `~/.theopentranscribe` |

In Docker this is `/config`, backed by its own volume, separate from the data volume.

### Safety

- Written atomically with owner-only permissions (`0600` file, `0700` folder).
- The web app only writes; the runner only reads.
- `toSafeProviderStatus()` is the only thing the UI ever sees: whether a key is configured and where it comes from, never the key itself.
- `redactSecretText()` strips keys from any text before it's logged or shown.

### Usage

```ts
import { resolveOpenAIConfig, toSafeProviderStatus } from "@theopentranscribe/provider-config";

const resolved = await resolveOpenAIConfig();
const status = toSafeProviderStatus(resolved); // safe to send to the browser
```

### Scripts

| Command | Description |
|---|---|
| `npm run build` | Compile to `dist/` (needed by `runner` and `web`) |
| `npm test` | Run the tests |
| `npm run typecheck` | Type-check with `tsc` |
