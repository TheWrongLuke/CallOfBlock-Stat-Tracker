import { readFileSync } from "node:fs";
import { resolve } from "node:path";

loadDotEnv();

const clientId = process.env.DISCORD_CLIENT_ID?.trim();

if (!clientId) {
  console.error("Missing DISCORD_CLIENT_ID in discord-bot/.env");
  process.exit(1);
}

const permissions = 1024n // View Channel
  | 268435456n // Manage Roles
  | 2048n // Send Messages
  | 16384n // Embed Links
  | 65536n; // Read Message History

const url = new URL("https://discord.com/oauth2/authorize");
url.searchParams.set("client_id", clientId);
url.searchParams.set("scope", "bot applications.commands");
url.searchParams.set("permissions", permissions.toString());

console.log(url.toString());

function loadDotEnv() {
  try {
    const envPath = resolve(".env");
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator === -1) continue;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch (_error) {
    // .env is optional for this helper when DISCORD_CLIENT_ID is already set.
  }
}
