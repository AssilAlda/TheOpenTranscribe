# Getting started

A step-by-step guide for people who haven't used a terminal much.

## 1. Install Docker

TheOpenTranscribe runs inside Docker.

| Platform | Install |
|---|---|
| macOS | [Docker Desktop](https://www.docker.com/products/docker-desktop) or [OrbStack](https://orbstack.dev) |
| Windows | [Docker Desktop](https://www.docker.com/products/docker-desktop) with [WSL](https://learn.microsoft.com/windows/wsl/install) |
| Linux | [Docker Engine](https://docs.docker.com/engine/install) |

Open it and wait until it says it's running.

## 2. Open a terminal

- **macOS:** press <kbd>⌘</kbd> + <kbd>Space</kbd>, type **Terminal**, press <kbd>Enter</kbd>.
- **Windows:** in Docker Desktop, go to *Settings → Resources → WSL integration* and turn it on. Then open **Ubuntu** from the Start menu.
- **Linux:** open your terminal app.

## 3. Run the installer

Paste this and press <kbd>Enter</kbd>:

```bash
curl -fsSL https://raw.githubusercontent.com/AssilAlda/TheOpenTranscribe/main/install.sh | bash
```

The first time takes a minute or two. When it's done, the app opens at **http://localhost:3000**.

## 4. Add your OpenAI API key

1. Create a key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys).
2. In the app, click **Provider**, paste the key and click **Save**.

You only pay OpenAI for what you transcribe.

## 5. Transcribe a file

Click **Upload files** and choose an audio or video file (up to 100 MB). Open **Transcribed files** to follow it. When it's done you can read it, copy it, or download it as a PDF.

---

Something not working? See [Troubleshooting](troubleshooting.md).
