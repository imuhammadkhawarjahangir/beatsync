To install dependencies:
```sh
bun install
```

Create the server environment file:

```sh
cp .env.example .env
```

Local filesystem storage is enabled by default:

```env
STORAGE_MODE=local
LOCAL_STORAGE_PATH=./data
LOCAL_PUBLIC_URL=http://localhost:8080
```

This stores uploaded audio and room-state backups under `apps/server/data` when the server is run from this
workspace. For LAN access, set `LOCAL_PUBLIC_URL` to `http://SERVER_LAN_IP:8080`.

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
