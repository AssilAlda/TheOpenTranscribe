# Troubleshooting

### "Docker is not installed" / "Docker is installed but not running"

Install Docker (see [Getting started](getting-started.md)), open it, wait until it's running, and run the install command again.

Using Colima?

```bash
colima start
docker context use colima
```

### "Port 3000 is already used by another program"

Install on another port:

```bash
curl -fsSL https://raw.githubusercontent.com/AssilAlda/TheOpenTranscribe/main/install.sh | THEOPENTRANSCRIBE_PORT=3001 bash
```

The app then opens at http://localhost:3001.

### "no configuration file provided"

You're not in the app folder. Run `cd ~/theopentranscribe` first.

### A file stays on "Queued"

The background worker isn't running. Check that both `web` and `runner` are up:

```bash
cd ~/theopentranscribe && docker compose ps
```

Running the install command again restarts anything that stopped.

### A file ends as "Failed"

Your API key is probably missing or wrong. Open **Provider** in the app and check it.

### See the logs

```bash
cd ~/theopentranscribe && docker compose logs --tail 100
```

Still stuck? [Open an issue](https://github.com/AssilAlda/TheOpenTranscribe/issues/new/choose) and include the logs (check them for anything private first).
