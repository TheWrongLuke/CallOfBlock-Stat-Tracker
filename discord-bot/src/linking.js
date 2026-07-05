import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Events } from "discord.js";
import { saveState } from "./state-store.js";

const LINK_COMMAND = {
  name: "linkminecraft",
  description: "Link your Discord account to your Minecraft player."
};

const UNKNOWN_CLAIM_RETENTION_MS = 30 * 60 * 1000;

export async function registerLinkCommands(client, config, logger) {
  if (!hasMinecraftLinkingConfig(config)) {
    logger.warn("Minecraft link command is disabled. Set MINECRAFT_LINK_CLAIMS_PATH or LEADERBOARD_ROLE_SYNC_CONFIG_PATH.");
    return;
  }
  await client.application.commands.set([LINK_COMMAND]);
  logger.info("Registered Discord slash command: /linkminecraft");
}

export function bindLinkInteractions(context) {
  const { client, logger } = context;
  client.on(Events.InteractionCreate, (interaction) => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== "linkminecraft") return;
    void startMinecraftLink(interaction, context).catch((error) => {
      logger.error("Failed to start Minecraft link:", error);
    });
  });
}

export function hasMinecraftLinkingConfig(config) {
  return Boolean(resolveMinecraftLinkClaimsPath(config));
}

export async function pollMinecraftLinkClaims(context) {
  const { config, state, logger } = context;
  const claimsPath = resolveMinecraftLinkClaimsPath(config);
  if (!claimsPath) return;

  pruneExpiredLinkCodes(config, state);
  const claimRoot = await readJsonFile(claimsPath, { claims: [] }, logger, false);
  const claims = Array.isArray(claimRoot) ? claimRoot : Array.isArray(claimRoot.claims) ? claimRoot.claims : [];
  if (!claims.length) return;

  const remaining = [];
  let completed = 0;
  let stateChanged = false;

  for (const claim of claims) {
    const normalized = normalizeClaim(claim);
    if (!normalized) continue;
    const pending = state.minecraftLinkCodes?.[normalized.code];
    if (!pending) {
      if (!isOldClaim(normalized.claimedAt, UNKNOWN_CLAIM_RETENTION_MS)) remaining.push(claim);
      continue;
    }

    await saveMinecraftBinding(config, state, normalized, pending.discordId, logger);
    delete state.minecraftLinkCodes[normalized.code];
    completed += 1;
    stateChanged = true;
    logger.info(`Linked Minecraft player ${normalized.playerName} to Discord user ${pending.discordUsername || pending.discordId}.`);
  }

  if (completed || remaining.length !== claims.length) {
    await writeJsonFile(claimsPath, { claims: remaining });
  }
  if (stateChanged) await saveState(config, state);
}

async function startMinecraftLink(interaction, context) {
  const { config, state } = context;
  if (!hasMinecraftLinkingConfig(config)) {
    await interaction.reply({
      content: "Minecraft linking is not configured on this bot yet.",
      ephemeral: true
    });
    return;
  }

  state.minecraftLinkCodes = state.minecraftLinkCodes || {};
  pruneExpiredLinkCodes(config, state);
  const code = uniqueCode(state.minecraftLinkCodes);
  const now = Date.now();
  const ttlMs = config.minecraftLinkCodeTtlMs;
  state.minecraftLinkCodes[code] = {
    discordId: interaction.user.id,
    discordUsername: interaction.user.username,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString()
  };
  await saveState(config, state);

  await interaction.reply({
    content: `Run this in Minecraft within ${Math.round(ttlMs / 60000)} minutes:\n\`/discordlink ${code}\``,
    ephemeral: true
  });
}

async function saveMinecraftBinding(config, state, claim, discordId, logger) {
  state.minecraftPlayerBindings = state.minecraftPlayerBindings || {};
  state.minecraftPlayerBindings[claim.playerUuid] = discordId;
  state.minecraftPlayerBindings[`name:${normalizePlayerName(claim.playerName)}`] = discordId;

  const bindingPath = resolveLeaderboardBindingPath(config);
  if (!bindingPath) return;

  const root = await readJsonFile(bindingPath, {}, logger, true);
  root.playerBindings = root.playerBindings && typeof root.playerBindings === "object" ? root.playerBindings : {};
  root.playerBindings[claim.playerUuid] = discordId;
  root.playerBindings[`name:${normalizePlayerName(claim.playerName)}`] = discordId;
  await writeJsonFile(bindingPath, root);
}

function pruneExpiredLinkCodes(config, state) {
  state.minecraftLinkCodes = state.minecraftLinkCodes || {};
  const now = Date.now();
  for (const [code, entry] of Object.entries(state.minecraftLinkCodes)) {
    const expiresAt = Date.parse(entry?.expiresAt || "");
    if (!Number.isFinite(expiresAt) || expiresAt <= now) delete state.minecraftLinkCodes[code];
  }
}

function uniqueCode(existing) {
  let code = "";
  do {
    code = randomBytes(4).toString("hex").slice(0, 6).toUpperCase();
  } while (existing[code]);
  return code;
}

function normalizeClaim(claim) {
  const code = String(claim?.code || "").trim().toUpperCase();
  const playerUuid = normalizeUuid(claim?.playerUuid || claim?.uuid);
  const playerName = String(claim?.playerName || claim?.name || "").trim();
  const claimedAt = String(claim?.claimedAt || claim?.createdAt || new Date().toISOString());
  if (!/^[A-Z0-9]{6}$/.test(code) || !playerUuid || !playerName) return null;
  return { code, playerUuid, playerName, claimedAt };
}

function isOldClaim(value, maxAgeMs) {
  const time = Date.parse(value);
  return Number.isFinite(time) && Date.now() - time > maxAgeMs;
}

function resolveMinecraftLinkClaimsPath(config) {
  if (config.minecraftLinkClaimsPath) return path.resolve(config.minecraftLinkClaimsPath);
  if (!config.leaderboardRoleSyncConfigPath) return "";
  return path.join(path.dirname(path.resolve(config.leaderboardRoleSyncConfigPath)), "discord_link_claims.json");
}

function resolveLeaderboardBindingPath(config) {
  if (config.leaderboardBindingsFile) return path.resolve(config.leaderboardBindingsFile);
  if (config.leaderboardRoleSyncConfigPath) return path.resolve(config.leaderboardRoleSyncConfigPath);
  return "";
}

async function readJsonFile(filePath, fallback, logger, warnOnMissing) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT" || warnOnMissing) {
      logger?.warn(`Could not read JSON file ${filePath}: ${error.message}`);
    }
    return fallback;
  }
}

async function writeJsonFile(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeUuid(value) {
  const clean = String(value || "").trim().toLowerCase().replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/.test(clean)) return "";
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20)}`;
}

function normalizePlayerName(name) {
  return String(name || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
}
