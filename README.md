# TheOpenTranscribe

An open source transcription app that you run on your own computer.

Upload an audio or video file and get a transcript back. You can read it, copy it, or save it as a PDF.

You need your own OpenAI API key. You can create one at https://platform.openai.com/api-keys


## How to start the app


### Step 1. Install Docker

On Mac, install and open one of these:

- Docker Desktop: https://www.docker.com/products/docker-desktop
- OrbStack: https://orbstack.dev

On Windows, install Docker Desktop.

On Linux, install Docker Engine: https://docs.docker.com/engine/install

Make sure Docker is running before you continue.


### Step 2. Download the project

Open a terminal and run:

```bash
git clone https://github.com/AssilAlda/TheOpenTranscribe.git
```

Then go into the project folder:

```bash
cd TheOpenTranscribe
```

Run all the next commands from this folder.


### Step 3. Create the settings file

```bash
cp .env.example .env
```

You do not need to change anything in this file.


### Step 4. Start the app

```bash
docker compose up -d --build
```

The first time takes a few minutes.

You may see red text while it builds. That is normal.


### Step 5. Open the app

Open this address in your browser:

http://localhost:3000


### Step 6. Add your API key

- Click Provider in the menu.
- Paste your OpenAI API key.
- Click save.


### Step 7. Transcribe a file

- Click Upload files.
- Choose an audio or video file, up to 100 MB.
- Click Transcribed files to see your result.


## Stop and start again

To stop the app:

```bash
docker compose down
```

To start it again:

```bash
docker compose up -d
```

Your transcripts are saved, even when you stop the app.


## If something goes wrong


### "no configuration file provided"

You are not in the project folder.

Run `cd TheOpenTranscribe` and try again.


### "failed to connect to the docker API"

Docker is not running.

Open Docker Desktop or OrbStack and try again.

If you use Colima, run these two commands:

```bash
colima start
docker context use colima
```


### A file stays on "Queued"

The background worker is not running.

Run `docker compose ps` and check that both web and runner are running.


### A file ends as "Failed"

Your API key is probably missing or wrong.

Open Provider and check your key.


## Good to know

- The app has no login. Only use it on your own computer or home network.
- Do not put it on the internet without extra protection.
- Your API key is saved as plain text on your computer.


## Use it from the terminal instead

You can also use the app without Docker, from the terminal.

See the guide in packages/transcriber/README.md


## For developers

See CONTRIBUTING.md


## License

MIT. See the LICENSE file.
