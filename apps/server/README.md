To install dependencies:

```sh
bun install
```

From the repository root, create the shared environment file:

```sh
cp .env.example .env
```

The root `.env` is loaded by both the client and server. Do not create an app-level `.env*` file; the server rejects
legacy files to prevent conflicting configuration. Local filesystem storage is enabled by default:

```env
STORAGE_MODE=local
LOCAL_STORAGE_PATH=./data
LOCAL_PUBLIC_URL=http://localhost:8080
CORS_ALLOWED_ORIGINS=http://localhost:3000
```

This stores uploaded audio and room-state backups under `apps/server/data` when the server is run from this
workspace. Docker Compose mounts the Docker-managed `beatsync_server-data` volume at the same `data` directory when
`STORAGE_MODE=local`. For LAN access, set `LOCAL_PUBLIC_URL` to `http://SERVER_LAN_IP:8080`.

`CORS_ALLOWED_ORIGINS` is a comma-separated list of exact browser origins permitted to call the HTTP API and open
WebSocket connections. Use `*` only when intentionally allowing every origin. In S3/R2 mode, the object-storage
bucket needs its own matching CORS policy because those audio requests do not pass through this server.

Docker Compose hardcodes the server to a 1 CPU limit, a 1 GiB memory limit, and a 256 MiB memory reservation.

To use R2 or another S3-compatible service, set `STORAGE_MODE=s3` and configure `S3_BUCKET_NAME`, `S3_PUBLIC_URL`,
`S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY`.

YouTube URL syntax and video IDs are validated and canonicalized by the server before being added to a room. This
does not verify that a video exists, is public in every participant's region, or permits embedding. Playback stays
in the official client-side YouTube iframe, so the server does not download or store YouTube media and no YouTube
API key is required. YouTube preparation has a 10-second readiness timeout; playback is cancelled if no client can
prepare the video.

To run:

```sh
bun run dev
```

The HTTP and WebSocket server listens on http://localhost:8080.
