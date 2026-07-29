This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

From the repository root, create the shared environment file:

```bash
cp .env.example .env
```

The root `.env` is the single source of truth for both the client and server. Do not create an app-level `.env*`
file; the client rejects legacy files to prevent conflicting configuration. Its client endpoint defaults are:

```env
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_WS_URL=ws://localhost:8080/ws
NEXT_ALLOWED_DEV_ORIGINS=local.beatsync.gg,10.0.0.*,192.168.100.*
CORS_ALLOWED_ORIGINS=http://localhost:3000
```

Replace `localhost` with the backend computer's LAN IP when opening the client from another device. Add any
additional Next.js development host patterns to `NEXT_ALLOWED_DEV_ORIGINS`, and add each exact browser origin to
`CORS_ALLOWED_ORIGINS`. Both values are comma-separated. Then run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

YouTube queue entries use the official IFrame Player API and require no additional environment variables. Browsers
may require each participant to click **Enable playback** once before synchronized playback can start. The browser
must be able to reach `youtube.com`, and the video must be available and embeddable for that participant. YouTube
playback is best-effort because ads, buffering, keyframe seeking, and autoplay policies can introduce drift. Iframe
audio cannot use Beatsync's Web Audio low-pass filter.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
