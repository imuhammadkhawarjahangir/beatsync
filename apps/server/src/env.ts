import { config } from "dotenv";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

export const ROOT_ENV_PATH = resolve(import.meta.dirname, "../../../.env");
const serverRoot = resolve(import.meta.dirname, "..");
const legacyEnvFiles = readdirSync(serverRoot).filter(
  (fileName) => fileName === ".env" || fileName.startsWith(".env.")
);

if (legacyEnvFiles.length > 0) {
  throw new Error(
    `Remove legacy server environment file(s): ${legacyEnvFiles.join(", ")}. Use the root .env file instead.`
  );
}

// Existing process variables (for example, those injected by Docker) take precedence.
config({ path: ROOT_ENV_PATH, quiet: true });
