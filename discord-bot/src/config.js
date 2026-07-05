import dotenv from "dotenv";

dotenv.config();

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optional(name, fallback = "") {
  return process.env[name]?.trim() || fallback;
}

function numberEnv(name, fallback, minimum = 0) {
  const raw = process.env[name];
  const parsed = Number(raw);
  if (!raw || !Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, parsed);
}

export const config = {
  discordToken: required("DISCORD_TOKEN"),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  defaultAdminChannelId: optional("DEFAULT_ADMIN_CHANNEL_ID"),
  defaultConfirmationChannelId: optional("DEFAULT_CONFIRMATION_CHANNEL_ID"),
  publicSiteUrl: optional("PUBLIC_SITE_URL", "https://thewrongluke.github.io/CallOfBlock-Stat-Tracker/#playtests"),
  pollIntervalMs: numberEnv("POLL_INTERVAL_MS", 15000, 5000),
  startupBackfillMinutes: numberEnv("STARTUP_BACKFILL_MINUTES", 0, 0),
  timeZone: optional("BOT_TIME_ZONE", "Europe/Rome"),
  stateFile: optional("BOT_STATE_FILE", ".bot-state.json")
};
