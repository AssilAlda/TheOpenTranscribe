<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/banner-dark.svg">
  <img src=".github/assets/banner-light.svg" alt="TheOpenTranscribe — self-hosted audio and video transcription" width="100%">
</picture>

<br>
<br>

[![CI](https://github.com/AssilAlda/TheOpenTranscribe/actions/workflows/ci.yml/badge.svg)](https://github.com/AssilAlda/TheOpenTranscribe/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-cc0f5e.svg)](LICENSE)
![Self-hosted](https://img.shields.io/badge/self--hosted-Docker-2496ED?logo=docker&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-web-000000?logo=nextdotjs&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.13-3776AB?logo=python&logoColor=white)

**Upload an audio or video file, get a clean transcript back.**<br>
Read it, copy it, or save it as a PDF — all from an app that runs on your own computer.

[**Quick start**](#-quick-start) · [Features](#-features) · [Screenshots](#-screenshots) · [Troubleshooting](#-troubleshooting) · [Security](#-security) · [Contributing](#-contributing)

</div>

<br>

## ✨ Features

<table>
  <tr>
    <td width="33%" valign="top">
      <h3>🏠 Runs on your machine</h3>
      Your recordings and transcripts are stored locally. No accounts, no cloud dashboard, no third-party storage.
    </td>
    <td width="33%" valign="top">
      <h3>🎯 High accuracy</h3>
      Powered by OpenAI's <code>gpt-4o-transcribe</code>, using your own API key — you only pay OpenAI for what you use.
    </td>
    <td width="33%" valign="top">
      <h3>🎬 Audio &amp; video</h3>
      MP3, MP4, M4A, WAV, WEBM, MPEG and MPGA, up to 100 MB. Long recordings are split automatically and stitched back together.
    </td>
  </tr>
  <tr>
    <td width="33%" valign="top">
      <h3>📄 Copy or export to PDF</h3>
      Read the transcript in a clean reader view, copy it with one click, or download a nicely formatted PDF.
    </td>
    <td width="33%" valign="top">
      <h3>📊 Live job tracking</h3>
      Every upload becomes a job you can follow from <em>Queued</em> → <em>Processing</em> → <em>Completed</em>.
    </td>
    <td width="33%" valign="top">
      <h3>⌨️ Terminal mode</h3>
      Prefer the command line? Transcribe single files or whole folders with the built-in CLI.
    </td>
  </tr>
</table>

## 📸 Screenshots

<table>
  <tr>
    <td colspan="2"><img src=".github/assets/upload.png" alt="Upload page: drop a file, pick an optional language and start the transcription"></td>
  </tr>
  <tr>
    <td width="50%"><img src=".github/assets/transcribed-files.png" alt="Transcribed files: every job with its status"></td>
    <td width="50%"><img src=".github/assets/transcript.png" alt="Transcript view with Copy and Download PDF buttons"></td>
  </tr>
  <tr>
    <td align="center"><sub><b>Transcribed files</b> — follow every job's status</sub></td>
    <td align="center"><sub><b>Transcript</b> — read, copy or download as PDF</sub></td>
  </tr>
</table>

## 🚀 Quick start

> [!NOTE]
> **You need two things:**
> 1. **Docker** — [Docker Desktop](https://www.docker.com/products/docker-desktop) or [OrbStack](https://orbstack.dev) on Mac, Docker Desktop on Windows, [Docker Engine](https://docs.docker.com/engine/install) on Linux.
> 2. **An OpenAI API key** — create one at [platform.openai.com/api-keys](https://platform.openai.com/api-keys).

**Already comfortable with Docker?** These three commands are all you need:

```bash
git clone https://github.com/AssilAlda/TheOpenTranscribe.git && cd TheOpenTranscribe
cp .env.example .env
docker compose up -d --build
```

Then open **http://localhost:3000**, add your API key under **Provider**, and upload a file. 🎉

<details>
<summary><b>👣 New to this? Follow the step-by-step guide</b></summary>

<br>

**Step 1 — Install Docker**

Install and open Docker Desktop or OrbStack (see the note above). Make sure Docker is running before you continue.

**Step 2 — Download the project**

Open a terminal and run:

```bash
git clone https://github.com/AssilAlda/TheOpenTranscribe.git
cd TheOpenTranscribe
```

Run all the next commands from this folder.

**Step 3 — Create the settings file**

```bash
cp .env.example .env
```

You don't need to change anything in this file.

**Step 4 — Start the app**

```bash
docker compose up -d --build
```

The first time takes a few minutes. You may see red text while it builds — that's normal.

**Step 5 — Open the app**

Open **http://localhost:3000** in your browser.

**Step 6 — Add your API key**

Click **Provider** in the menu, paste your OpenAI API key and click **Save**.

**Step 7 — Transcribe a file**

Click **Upload files**, choose an audio or video file (up to 100 MB), then open **Transcribed files** to see your result.

</details>

### Stop and start again

| What you want | Command |
|---|---|
| ⏹️ Stop the app | `docker compose down` |
| ▶️ Start it again | `docker compose up -d` |
| 🔄 Update to the latest version | `git pull && docker compose up -d --build` |

> [!TIP]
> Your transcripts are kept in a Docker volume, so they are still there after you stop or update the app.

## 🛟 Troubleshooting

<details>
<summary><b>"no configuration file provided"</b></summary>
<br>

You're not in the project folder. Run `cd TheOpenTranscribe` and try again.

</details>

<details>
<summary><b>"failed to connect to the docker API"</b></summary>
<br>

Docker isn't running. Open Docker Desktop or OrbStack and try again.

If you use Colima:

```bash
colima start
docker context use colima
```

</details>

<details>
<summary><b>A file stays on "Queued"</b></summary>
<br>

The background worker isn't running. Run `docker compose ps` and check that both **web** and **runner** are running.

</details>

<details>
<summary><b>A file ends as "Failed"</b></summary>
<br>

Your API key is probably missing or wrong. Open **Provider** and check your key.

</details>

## 🔒 Security

> [!IMPORTANT]
> **TheOpenTranscribe has no login.** It's built for one person on their own computer.
> - By default it only accepts connections from **your own computer** (`127.0.0.1`).
> - To use it from other devices on your home network, see `THEOPENTRANSCRIBE_BIND` in [`.env.example`](.env.example). Anyone who can reach the app can use your API key.
> - **Never expose it to the internet** without extra protection, such as a VPN or a reverse proxy with login.

> [!WARNING]
> Your API key is stored as plain text on your computer (in a file only your user can read). Treat the machine accordingly.

Found a vulnerability? Please report it privately — see [SECURITY.md](SECURITY.md).

## 🧩 How it works

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/architecture-dark.svg">
  <img src=".github/assets/architecture-light.svg" alt="Architecture: the browser uploads to web, web queues a job in SQLite, the runner picks it up and starts the transcriber, which sends audio chunks to the OpenAI API and writes the transcript back." width="100%">
</picture>

| Package | What it does |
|---|---|
| [`packages/web`](packages/web) | Next.js dashboard and HTTP API |
| [`packages/runner`](packages/runner) | Background worker that picks up queued jobs |
| [`packages/transcriber`](packages/transcriber) | Python transcription engine and CLI |
| [`packages/db`](packages/db) | SQLite storage for jobs |
| [`packages/provider-config`](packages/provider-config) | Safe storage of the API key |
| [`packages/contract`](packages/contract) | Shared JSON job format |

## ⌨️ Use it from the terminal

Don't want the web app? The transcription engine also works as a standalone CLI:

```bash
theopentranscribe path/to/recording.mp4 --language en
```

See [`packages/transcriber/README.md`](packages/transcriber/README.md) for setup.

## 🤝 Contributing

Contributions are welcome! Read [CONTRIBUTING.md](CONTRIBUTING.md) to get set up, and please follow the [Code of Conduct](CODE_OF_CONDUCT.md).

Bugs and ideas → [open an issue](https://github.com/AssilAlda/TheOpenTranscribe/issues/new/choose).

## 📄 License

[MIT](LICENSE) © Assil Alda

<div align="center">
<br>
<sub>If TheOpenTranscribe is useful to you, a ⭐ on GitHub helps others find it.</sub>
</div>
