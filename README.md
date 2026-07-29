# Beatsync

Beatsync is a high-precision web audio player built for multi-device playback. The official app is [beatsync.gg](https://www.beatsync.gg/).

https://github.com/user-attachments/assets/2aa385a7-2a07-4ab5-80b1-fda553efc57b

## Features

- **Millisecond-accurate synchronization**: Abstracts [NTP-inspired](https://en.wikipedia.org/wiki/Network_Time_Protocol) time synchronization primitives to achieve a high degree of accuracy
- **Cross-platform**: Works on any device with a modern browser (Chrome recommended for best performance)
- **Spatial audio:** Allows controlling device volumes through a virtual listening source for interesting sonic effects
- **YouTube playback:** Add YouTube video URLs and coordinate play, pause, seek, and drift correction across devices
- **Polished interface**: Smooth loading states, status indicators, and all UI elements come built-in
- **Self-hostable**: Run your own instance with a few commands


> [!NOTE]
> Beatsync is in early development. Mobile support is working, but experimental. Please consider creating an issue or contributing with a PR if you run into problems!

## Quickstart

This project uses [Turborepo](https://turbo.build/repo). Create the single root environment file:

```sh
cp .env.example .env
```

The defaults run the client against `localhost:8080` and store uploads and room backups under `apps/server/data`.
No S3 bucket is required when `STORAGE_MODE=local`. To use R2/S3 instead, set `STORAGE_MODE=s3` and fill in the
`S3_*` variables in the root `.env`.

For access from other computers on the same network, replace `localhost` in all three URL variables with the server
computer's LAN IP, add its host pattern to the comma-separated `NEXT_ALLOWED_DEV_ORIGINS` value, and ensure ports
`3000` and `8080` are reachable. Add the exact client origin, such as `http://SERVER_LAN_IP:3000`, to the
comma-separated `CORS_ALLOWED_ORIGINS` value. The root `.env` is the source of truth for both the client and server.
Remove any legacy `.env*` files under `apps/client` or `apps/server`; both apps reject them to prevent conflicting
configuration.

YouTube playback uses the official IFrame Player API and does not require an API key. Each device may need to click
**Enable playback** once because browsers can block scripted media playback until the user interacts with the page.
Only videos that are available to the participant and permit embedding can play. Unlike uploaded Web Audio tracks,
YouTube synchronization is best-effort: ads, buffering, keyframe seeking, and browser autoplay rules can introduce
visible drift before periodic correction.

Deploy the updated client, server, and shared package together, then refresh already-open room tabs. An older client
does not understand the YouTube queue-source metadata.

Before a public deployment, ensure the site's own terms and privacy policy cover its use of the YouTube IFrame
Player API and meet the current YouTube API Services policy requirements.

Run the following commands to start the server and client:

```sh
bun install          # installs once for all workspaces
bun dev              # starts both client (:3000) and server (:8080)
```

| Directory         | Purpose                                                        |
| ----------------- | -------------------------------------------------------------- |
| `apps/server`     | Bun HTTP + WebSocket server                                    |
| `apps/client`     | Next.js frontend with Tailwind & Shadcn/ui                     |
| `packages/shared` | Type-safe schemas and functions shared between client & server |
