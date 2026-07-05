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

function listEnv(name) {
  return (process.env[name] || "")
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function jsonObjectEnv(name) {
  const raw = process.env[name]?.trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    throw new Error(`Invalid JSON in ${name}: ${error.message}`);
  }
}

export const config = {
  discordToken: required("DISCORD_TOKEN"),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  statsExportTable: optional("STATS_EXPORT_TABLE", "cob_stats_exports"),
  statsExportRowId: optional("STATS_EXPORT_ROW_ID", "live"),
  defaultAdminChannelId: optional("DEFAULT_ADMIN_CHANNEL_ID"),
  defaultConfirmationChannelId: optional("DEFAULT_CONFIRMATION_CHANNEL_ID"),
  discordGuildId: optional("DISCORD_GUILD_ID"),
  discordAdminRoleId: optional("DISCORD_ADMIN_ROLE_ID"),
  publicSiteUrl: optional("PUBLIC_SITE_URL", "https://thewrongluke.github.io/CallOfBlock-Stat-Tracker/#playtests"),
  pollIntervalMs: numberEnv("POLL_INTERVAL_MS", 15000, 5000),
  adminRoleSyncIntervalMs: numberEnv("ADMIN_ROLE_SYNC_INTERVAL_MS", 60000, 10000),
  leaderboardRoleSyncConfigPath: optional("LEADERBOARD_ROLE_SYNC_CONFIG_PATH"),
  leaderboardRoleGuildId: optional("LEADERBOARD_ROLE_GUILD_ID"),
  leaderboardRoleIds: listEnv("LEADERBOARD_ROLE_IDS"),
  leaderboardRoleSyncMode: optional("LEADERBOARD_ROLE_SYNC_MODE"),
  leaderboardRoleSyncSort: optional("LEADERBOARD_ROLE_SYNC_SORT", "wins").toLowerCase(),
  leaderboardRoleSyncIntervalMs: numberEnv("LEADERBOARD_ROLE_SYNC_INTERVAL_MS", 60000, 10000),
  leaderboardPlayerBindings: jsonObjectEnv("LEADERBOARD_PLAYER_BINDINGS"),
  minecraftUsercachePath: optional("MINECRAFT_USERCACHE_PATH"),
  startupBackfillMinutes: numberEnv("STARTUP_BACKFILL_MINUTES", 0, 0),
  timeZone: optional("BOT_TIME_ZONE", "Europe/Rome"),
  stateFile: optional("BOT_STATE_FILE", ".bot-state.json")
};
