# @theopentranscribe/runner

Part of [TheOpenTranscribe](../../README.md).

The background worker. It picks up queued jobs one at a time, runs the [transcriber](../transcriber), and saves the result.

### What it does

- Polls the database for `QUEUED` jobs and claims one atomically.
- Runs `python -m transcriber.run_job` as a subprocess, with secrets redacted from anything it logs.
- Marks the job `COMPLETED` or `FAILED`.
- On startup, marks any job left in `PROCESSING` by a crash as `FAILED`. Jobs are never retried automatically, since the provider may already have charged for the first attempt.
- Touches a heartbeat file every 15 seconds for the Docker health check.

One job at a time, by design: no concurrency setting and no subprocess timeout.

### Setup

Install [`db`](../db) and [`provider-config`](../provider-config) first. This package depends on their build output.

```bash
cd packages/db && npm install
cd ../provider-config && npm install --include=dev && npm run build
cd ../runner && npm install
```

### Running

```bash
DATA_DIR=/path/to/data \
TRANSCRIBER_PYTHON_BIN=/path/to/packages/transcriber/.venv/bin/python \
npm start
```

| Variable | Required | Description |
|---|---|---|
| `DATA_DIR` | Yes | Same folder the web app uses. |
| `TRANSCRIBER_PYTHON_BIN` | Yes | The Python in the transcriber's virtualenv. |
| `OPENAI_API_KEY` | No | If set, always used. Otherwise the key saved in the app's Provider page is used. |
| `THEOPENTRANSCRIBE_CONFIG_DIR` | No | Where the saved key lives. See [`provider-config`](../provider-config). |
| `RUNNER_POLL_INTERVAL_MS` | No | How often to check for new jobs. Default `5000`. |

The API key is looked up again for every job, so a key saved in the app works without restarting the runner.

### Scripts

| Command | Description |
|---|---|
| `npm start` | Start the runner |
| `npm test` | Run the tests, including a real subprocess integration test |
| `npm run typecheck` | Type-check with `tsc` |
