import type { NextConfig } from "next";
import { config } from "dotenv";
import { readdirSync } from "node:fs";
import path from "node:path";

const workspaceRoot = path.join(import.meta.dirname, "../..");
const legacyEnvFiles = readdirSync(import.meta.dirname).filter(
  (fileName) => fileName === ".env" || fileName.startsWith(".env.")
);

if (legacyEnvFiles.length > 0) {
  throw new Error(
    `Remove legacy client environment file(s): ${legacyEnvFiles.join(", ")}. Use the root .env file instead.`
  );
}

config({ path: path.join(workspaceRoot, ".env"), quiet: true });

const allowedDevOrigins = (process.env.NEXT_ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: workspaceRoot,
  reactCompiler: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.scdn.co",
      },
      {
        protocol: "https",
        hostname: "is1-ssl.mzstatic.com",
      },
      {
        protocol: "https",
        hostname: "lastfm.freetls.fastly.net",
      },
      {
        protocol: "https",
        hostname: "static.qobuz.com",
      },
      {
        protocol: "https",
        hostname: "i.ytimg.com",
      },
    ],
  },
  // This is required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,
  allowedDevOrigins,
};

export default nextConfig;
