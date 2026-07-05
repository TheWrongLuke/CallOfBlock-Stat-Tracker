import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Routes } from "discord.js";
import { maybeSingle } from "./supabase.js";

const VALID_SORTS = new Set(["wins", "kills", "games"]);

export async function syncLeaderboardRoles(context) {
  const { client, config, supabase, logger } = context;
  const settings = leaderboardRoleSettings(config, logger);
  if (!settings.enabled) return;

  const exportRow = await maybeSingle(
    supabase
      .from(config.statsExportTable)
      .select("payload")
      .eq("id", config.statsExportRowId),
    "load stats export"
  );
  const payload = exportRow?.payload;
  const leaderboard = payload?.modes?.[settings.mode]?.leaderboards?.[settings.sort] || [];
  if (!Array.isArray(leaderboard) || !leaderboard.length) {
    logger.warn(`Leaderboard role sync skipped: no ${settings.mode}/${settings.sort} leaderboard found.`);
    return;
  }

  const bindings = loadPlayerBindings(settings, logger);
  const boundDiscordIds = [...new Set(Object.values(bindings).filter(Boolean))];
  if (!boundDiscordIds.length) {
    logger.warn("Leaderboard role sync skipped: no player bindings configured.");
    return;
  }

  const targetByPlace = new Map();
  for (const entry of leaderboard) {
    if (targetByPlace.size >= settings.roleIds.length) break;
    const discordId = discordIdForLeaderboardEntry(entry, bindings);
    if (!discordId) continue;
    targetByPlace.set(targetByPlace.size + 1, discordId);
  }

  let changed = 0;
  let checked = 0;
  let missing = 0;

  for (const discordId of boundDiscordIds) {
    const member = await fetchGuildMember(client, settings.guildId, discordId, logger);
    if (!member) {
      missing += 1;
      continue;
    }
    checked += 1;
    const memberRoles = new Set(member.roles || []);

    for (let index = 0; index < settings.roleIds.length; index += 1) {
      const roleId = settings.roleIds[index];
      const shouldHaveRole = targetByPlace.get(index + 1) === discordId;
      const hasRole = memberRoles.has(roleId);
      if (shouldHaveRole === hasRole) continue;

      if (shouldHaveRole) {
        await client.rest.put(Routes.guildMemberRole(settings.guildId, discordId, roleId));
      } else {
        await client.rest.delete(Routes.guildMemberRole(settings.guildId, discordId, roleId));
      }
      changed += 1;
    }
  }

  if (changed || missing) {
    logger.info(`Leaderboard role sync checked ${checked} bound user(s), changed ${changed}, missing ${missing}.`);
  }
}

export function hasLeaderboardRoleSyncConfig(config) {
  const fileSettings = readRoleSyncFile(config.leaderboardRoleSyncConfigPath, null);
  const guildId = config.leaderboardRoleGuildId || fileSettings?.guildId || config.discordGuildId;
  const roleIds = config.leaderboardRoleIds.length ? config.leaderboardRoleIds : cleanList(fileSettings?.roleIds || []);
  return Boolean(guildId && roleIds.length);
}

function leaderboardRoleSettings(config, logger) {
  const fileSettings = readRoleSyncFile(config.leaderboardRoleSyncConfigPath, logger);
  const mode = normalizeMode(config.leaderboardRoleSyncMode || fileSettings?.roleSource);
  const sort = VALID_SORTS.has(config.leaderboardRoleSyncSort) ? config.leaderboardRoleSyncSort : "wins";
  const roleIds = config.leaderboardRoleIds.length ? config.leaderboardRoleIds : cleanList(fileSettings?.roleIds || []);
  const guildId = config.leaderboardRoleGuildId || fileSettings?.guildId || config.discordGuildId;
  return {
    enabled: Boolean(guildId && roleIds.length),
    guildId,
    roleIds,
    mode,
    sort,
    fileBindings: fileSettings?.playerBindings || {},
    envBindings: config.leaderboardPlayerBindings || {},
    usercachePath: config.minecraftUsercachePath
  };
}

function loadPlayerBindings(settings, logger) {
  const bindings = normalizeBindingMap({
    ...settings.fileBindings,
    ...settings.envBindings
  });
  const usercache = loadUsercache(settings.usercachePath, logger);

  for (const [key, discordId] of Object.entries(bindings)) {
    const usercacheEntry = usercache.get(normalizeUuid(key));
    if (!usercacheEntry?.name) continue;
    addNameBinding(bindings, usercacheEntry.name, discordId);
  }

  for (const [key, discordId] of Object.entries({ ...bindings })) {
    if (key.startsWith("name:")) {
      bindings[publicPlayerId(key)] = discordId;
    }
  }

  return bindings;
}

function normalizeBindingMap(value) {
  const bindings = {};
  for (const [key, discordId] of Object.entries(value || {})) {
    const cleanKey = normalizeBindingKey(key);
    const cleanDiscordId = String(discordId || "").trim();
    if (cleanKey && cleanDiscordId) bindings[cleanKey] = cleanDiscordId;
  }
  return bindings;
}

function discordIdForLeaderboardEntry(entry, bindings) {
  for (const key of bindingCandidateKeys(entry)) {
    const discordId = bindings[key];
    if (discordId) return discordId;
  }
  return "";
}

function bindingCandidateKeys(entry) {
  const keys = new Set();
  addBindingKey(keys, entry?.playerId);
  addBindingKey(keys, entry?.name);
  const normalizedName = normalizePlayerName(entry?.name);
  if (normalizedName) {
    addBindingKey(keys, normalizedName);
    addBindingKey(keys, `name:${normalizedName}`);
    addBindingKey(keys, publicPlayerId(`name:${normalizedName}`));
  }
  return [...keys];
}

function addBindingKey(keys, value) {
  const key = normalizeBindingKey(value);
  if (key) keys.add(key);
}

function addNameBinding(bindings, name, discordId) {
  const normalizedName = normalizePlayerName(name);
  if (!normalizedName) return;
  const nameKey = `name:${normalizedName}`;
  bindings[normalizedName] = discordId;
  bindings[nameKey] = discordId;
  bindings[publicPlayerId(nameKey)] = discordId;
}

async function fetchGuildMember(client, guildId, discordId, logger) {
  try {
    return await client.rest.get(Routes.guildMember(guildId, discordId));
  } catch (error) {
    if (error?.code === 10007 || error?.status === 404) return null;
    logger.warn(`Could not fetch leaderboard member ${discordId}: ${error?.message || error}`);
    return null;
  }
}

function readRoleSyncFile(filePath, logger) {
  if (!filePath) return null;
  try {
    return JSON.parse(readFileSync(resolve(filePath), "utf8"));
  } catch (error) {
    logger?.warn(`Could not read leaderboard role sync config: ${error?.message || error}`);
    return null;
  }
}

function loadUsercache(filePath, logger) {
  const byUuid = new Map();
  if (!filePath) return byUuid;
  try {
    const entries = JSON.parse(readFileSync(resolve(filePath), "utf8"));
    for (const entry of Array.isArray(entries) ? entries : []) {
      const uuid = normalizeUuid(entry?.uuid);
      if (uuid) byUuid.set(uuid, entry);
    }
  } catch (error) {
    logger?.warn(`Could not read Minecraft usercache: ${error?.message || error}`);
  }
  return byUuid;
}

function normalizeMode(value) {
  const text = String(value || "").trim().toLowerCase().replace(/[^a-z]/g, "");
  if (text === "deathmatch" || text === "dm") return "deathmatch";
  return "battleRoyale";
}

function normalizeBindingKey(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  if (text.startsWith("name:")) return `name:${normalizePlayerName(text.slice(5))}`;
  if (/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/.test(text)) return normalizeUuid(text);
  if (/^p_[0-9a-f]{12}$/.test(text)) return text;
  return normalizePlayerName(text) || text;
}

function normalizeUuid(value) {
  const clean = String(value || "").trim().toLowerCase().replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/.test(clean)) return "";
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20)}`;
}

function normalizePlayerName(name) {
  return String(name || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
}

function publicPlayerId(playerId) {
  if (!playerId) return "";
  if (/^p_[0-9a-f]{12}$/.test(playerId)) return playerId;
  return `p_${createHash("sha256").update(String(playerId).toLowerCase()).digest("hex").slice(0, 12)}`;
}

function cleanList(value) {
  return (Array.isArray(value) ? value : String(value || "").split(/[,\s]+/))
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
}
