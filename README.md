<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/logo-dark.svg">
    <img src=".github/assets/logo-light.svg" alt="TheOpenTranscribe" width="380">
  </picture>
</p>

<p align="center">Self-hosted audio &amp; video transcription.</p>

<p align="center">
  <a href="https://github.com/AssilAlda/TheOpenTranscribe/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/AssilAlda/TheOpenTranscribe?style=flat-square&label=release&color=cc0f5e"></a>
  <a href="https://github.com/AssilAlda/TheOpenTranscribe/actions/workflows/ci.yml"><img alt="Build" src="https://img.shields.io/github/actions/workflow/status/AssilAlda/TheOpenTranscribe/ci.yml?branch=main&style=flat-square&label=build"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/AssilAlda/TheOpenTranscribe?style=flat-square&color=blue"></a>
</p>

<p align="center">
  <img src=".github/assets/hero.png" alt="TheOpenTranscribe showing a finished transcript" width="100%">
</p>

---

### Installation

```bash
curl -fsSL https://raw.githubusercontent.com/AssilAlda/TheOpenTranscribe/main/install.sh | bash
```

Requires [Docker](https://www.docker.com/products/docker-desktop). The app opens at **http://localhost:3000**. Click **Provider**, add your [OpenAI API key](https://platform.openai.com/api-keys), and upload a file.

> [!TIP]
> Run the same command again to update. Your transcripts are kept.

New to the terminal? Follow the [step-by-step guide](docs/getting-started.md).

#### Installation directory

The install script sets everything up in `~/theopentranscribe`.

| Action | Command |
|---|---|
| Stop | `cd ~/theopentranscribe && docker compose down` |
| Start | `cd ~/theopentranscribe && docker compose up -d` |
| Update | Run the install command again |

### Features

- **Private.** Runs on your computer. Recordings and transcripts never leave it, except the audio sent to OpenAI for transcription.
- **Accurate.** Uses OpenAI's `gpt-4o-transcribe` with your own API key.
- **Audio and video.** MP3, MP4, M4A, WAV, WEBM, MPEG and MPGA up to 100 MB. Long recordings are split up and stitched back together automatically.
- **Export.** Read, copy, or download every transcript as a PDF.
- **CLI included.** Transcribe files or whole folders from the terminal with [`packages/transcriber`](packages/transcriber).

### Security

The app has no login and only accepts connections from your own computer by default. Don't expose it to the internet without a VPN or an authenticating reverse proxy. See [SECURITY.md](SECURITY.md) to report a vulnerability.

### Documentation

- [Getting started](docs/getting-started.md)
- [Troubleshooting](docs/troubleshooting.md)

### Contributing

Interested in contributing? Read the [contributing guide](CONTRIBUTING.md) before opening a pull request.

### License

[MIT](LICENSE)
