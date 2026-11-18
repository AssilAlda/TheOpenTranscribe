# Contributing to TheOpenTranscribe

Thanks for your interest in contributing! This project is a small,
self-hosted transcription app, and this guide covers what you need to build
and test it locally.

## Prerequisites

- Node.js 22
- Python 3.13 or newer
- [`ffmpeg`](https://ffmpeg.org/) and `ffprobe` available on `PATH`

## Project layout

There is no root `package.json` or npm/pnpm workspace — each package under
`packages/` is a fully standalone npm project with its own
`package.json`/`package-lock.json`/`node_modules`, linked to its sibling
packages via `file:../x` dependencies:

- `packages/contract` — Python, the JSON job contract (schema + validator)
- `packages/transcriber` — Python, the CLI transcription engine
- `packages/db` — TypeScript, SQLite (`DATA_DIR`) persistence
- `packages/provider-config` — TypeScript, managed provider-credential storage
- `packages/runner` — TypeScript, the background job runner
- `packages/web` — TypeScript/Next.js, the web API + dashboard

## Local install / build order

Because there's no workspace tool to resolve this automatically, install in
this order the first time (and any time you touch `packages/db` or
`packages/provider-config`):

```bash
cd packages/db && npm install               # builds automatically (prepare hook)
cd ../provider-config && npm install --include=dev && npm run build
cd ../runner && npm install                 # pulls in the two builds above
cd ../web && npm install                    # same
```

`packages/runner` and `packages/web` each also expose a
`build:provider-config` script, wired into their `predev`/`prebuild`/
`prestart`/`pretest`/`pretypecheck` hooks, so a plain `npm install` in either
of them will rebuild `provider-config` if it's out of date.

For the Python packages:

```bash
cd packages/transcriber && python3 -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]"
cd packages/contract/python && python3 -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]"
```

## Running tests / typechecks

Each package is tested independently — there's no root script:

| Package | Command |
|---|---|
| `packages/transcriber`, `packages/contract/python` | `pytest` |
| `packages/db`, `packages/provider-config`, `packages/runner`, `packages/web` | `npm run typecheck` and `npm test` |
| `packages/web` | `npm run build` (production build) |

CI (`.github/workflows/ci.yml`) runs all of the above, plus `npm audit`/
`pip-audit` and a Docker image build sanity check, on every push/PR to
`main`.

## Docker quickstart

If you don't want to set up Python/Node locally, `docker compose up -d
--build` runs the whole stack (web dashboard + background runner). See the
[README](README.md) for the step-by-step guide, and `.env.example` /
`docker-compose.yml` for the volumes and environment variables.

## Reporting bugs and security issues

- Bugs and feature requests: open a GitHub issue.
- Security vulnerabilities: please **don't** open a public issue — follow
  [SECURITY.md](SECURITY.md) instead.

## Pull requests

- Run the relevant package's `typecheck`/`test` (and `pytest` for the
  Python packages) before pushing — CI re-runs everything, but catching
  issues locally first is faster.
- Keep changes scoped to the package(s) they concern where possible.
- By participating you agree to follow the
  [Code of Conduct](CODE_OF_CONDUCT.md).
- This project is MIT licensed (see [LICENSE](LICENSE)); no CLA is required.
