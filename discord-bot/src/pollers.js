import { EmbedBuilder, Routes } from "discord.js";
import { sendChannelMessage } from "./discord-client.js";
import { discordTimestamp, formatShortRange, formatTimeRange, mentionUser, statusLabel, trimForDiscord } from "./format.js";
import { hasLeaderboardRoleSyncConfig, syncLeaderboardRoles } from "./leaderboard-roles.js";
import { maybeSingle } from "./supabase.js";
import { rememberId, saveState } from "./state-store.js";

export function startPollers(context) {
  const stopVoteEvents = startLoop("vote events", context.config.pollIntervalMs, () => pollVoteEvents(context), context.logger);
  const stopConfirmations = startLoop("confirmations", context.config.pollIntervalMs, () => pollConfirmations(context), context.logger);
  const stopAdminRoleSync = context.config.discordGuildId && context.config.discordAdminRoleId
    ? startLoop("admin role sync", context.config.adminRoleSyncIntervalMs, () => syncAdminRoles(context), context.logger)
    : null;
  const stopLeaderboardRoleSync = hasLeaderboardRoleSyncConfig(context.config)
    ? startLoop("leaderboard role sync", context.config.leaderboardRoleSyncIntervalMs, () => syncLeaderboardRoles(context), context.logger)
    : null;
  if (!stopAdminRoleSync) {
    context.logger.warn("Discord admin role sync is disabled. Set DISCORD_GUILD_ID and DISCORD_ADMIN_ROLE_ID to enable website admins from a Discord role.");
  }
  if (!stopLeaderboardRoleSync) {
    context.logger.warn("Leaderboard role sync is disabled. Set LEADERBOARD_ROLE_IDS and player bindings, or LEADERBOARD_ROLE_SYNC_CONFIG_PATH.");
  }
  return () => {
    stopVoteEvents();
    stopConfirmations();
    if (stopAdminRoleSync) stopAdminRoleSync();
    if (stopLeaderboardRoleSync) stopLeaderboardRoleSync();
  };
}

function startLoop(name, intervalMs, task, logger) {
  let running = false;
  let stopped = false;

  async function tick() {
    if (stopped || running) return;
    running = true;
    try {
      await task();
    } catch (error) {
      logger.error(`Failed polling ${name}:`, error);
    } finally {
      running = false;
    }
  }

  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

async function pollVoteEvents(context) {
  const { config, supabase, state, logger } = context;
  if (!state.lastVoteEventCreatedAt) {
    state.lastVoteEventCreatedAt = new Date(Date.now() - config.startupBackfillMinutes * 60000).toISOString();
    await saveState(config, state);
  }

  const { data, error } = await supabase
    .from("playtest_vote_events")
    .select("id, playtest_id, slot_id, user_id, status, available_start_datetime, available_end_datetime, available_total, preferred_total, total_votes, created_at")
    .gt("created_at", state.lastVoteEventCreatedAt)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) throw new Error(error.message);
  if (!data?.length) return;

  for (const event of data) {
    if (state.processedVoteEventIds.includes(event.id)) continue;
    const sent = await sendAdminVoteEvent(context, event);
    if (sent) {
      state.processedVoteEventIds = rememberId(state.processedVoteEventIds, event.id);
    }
    if (!state.lastVoteEventCreatedAt || new Date(event.created_at) > new Date(state.lastVoteEventCreatedAt)) {
      state.lastVoteEventCreatedAt = event.created_at;
    }
  }

  await saveState(config, state);
  logger.info(`Processed ${data.length} vote event(s).`);
}

async function sendAdminVoteEvent(context, event) {
  const { client, config, supabase, logger } = context;
  const [playtest, slot, profile] = await Promise.all([
    loadPlaytest(supabase, event.playtest_id),
    loadSlot(supabase, event.slot_id),
    event.user_id ? loadProfile(supabase, event.user_id) : null
  ]);

  const channelId = playtest?.discord_admin_channel_id || config.defaultAdminChannelId;
  const voter = profile?.discord_id ? `${mentionUser(profile.discord_id)} (${profile.username})` : profile?.username || "Unknown voter";
  const embed = new EmbedBuilder()
    .setTitle("Playtest vote")
    .setColor(0x7ec8ff)
    .setDescription(`${voter} voted **${statusLabel(event.status)}**.`)
    .addFields(
      { name: "Playtest", value: trimForDiscord(playtest?.title || event.playtest_id), inline: false },
      { name: "Date", value: formatShortRange(slot?.start_datetime, slot?.end_datetime), inline: false },
      { name: "Player time", value: formatShortRange(event.available_start_datetime, event.available_end_datetime), inline: false },
      { name: "Totals", value: `${event.available_total} available / ${event.preferred_total} preferred / ${event.total_votes} total`, inline: false }
    )
    .setTimestamp(new Date(event.created_at));

  return sendChannelMessage(client, channelId, { embeds: [embed] }, logger);
}

async function pollConfirmations(context) {
  const { config, supabase, state, logger } = context;
  if (!state.lastConfirmationCheckedAt) {
    state.lastConfirmationCheckedAt = new Date(Date.now() - config.startupBackfillMinutes * 60000).toISOString();
    await saveState(config, state);
  }

  const { data, error } = await supabase
    .from("playtest_slots")
    .select("id, playtest_id, start_datetime, end_datetime, label, source, confirmed_at")
    .not("confirmed_at", "is", null)
    .gt("confirmed_at", state.lastConfirmationCheckedAt)
    .order("confirmed_at", { ascending: true })
    .limit(100);

  if (error) throw new Error(error.message);
  const unsent = (data || []).filter((slot) => !state.sentConfirmationSlotIds.includes(slot.id));
  if (!unsent.length) return;

  for (const slot of unsent) {
    const sent = await sendConfirmation(context, slot);
    if (sent) {
      state.sentConfirmationSlotIds = rememberId(state.sentConfirmationSlotIds, slot.id, 1000);
      if (!state.lastConfirmationCheckedAt || new Date(slot.confirmed_at) > new Date(state.lastConfirmationCheckedAt)) {
        state.lastConfirmationCheckedAt = slot.confirmed_at;
      }
    }
  }

  await saveState(config, state);
  logger.info(`Processed ${unsent.length} confirmation(s).`);
}

async function sendConfirmation(context, slot) {
  const { client, config, supabase, logger } = context;
  const playtest = await loadPlaytest(supabase, slot.playtest_id);
  const channelId = playtest?.discord_confirmation_channel_id || config.defaultConfirmationChannelId;
  const subscribers = await loadNotificationSubscribers(supabase, slot.playtest_id, slot.id);
  const mentions = subscribers.map((profile) => mentionUser(profile.discord_id)).filter(Boolean);
  const allowedUsers = subscribers.map((profile) => profile.discord_id).filter(Boolean).slice(0, 100);
  const mentionLine = mentions.length ? mentions.join(" ") : "No notification subscribers yet.";

  const embed = new EmbedBuilder()
    .setTitle("Playtest confirmed")
    .setColor(0x85e89d)
    .setDescription(`**${playtest?.title || "Call of Block Playtest"}** is confirmed.`)
    .addFields(
      { name: "When", value: formatTimeRange(slot.start_datetime, slot.end_datetime), inline: false },
      { name: "Confirmed", value: discordTimestamp(slot.confirmed_at, "R"), inline: true },
      { name: "Scheduler", value: config.publicSiteUrl, inline: false }
    )
    .setTimestamp(new Date(slot.confirmed_at));

  return sendChannelMessage(client, channelId, {
    content: mentionLine,
    embeds: [embed],
    allowedMentions: { users: allowedUsers }
  }, logger);
}

async function syncAdminRoles(context) {
  const { client, config, supabase, logger } = context;
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, username, discord_id, is_admin")
    .limit(1000);

  if (error) throw new Error(`load profiles for admin role sync: ${error.message}`);
  const candidates = (profiles || []).filter((profile) => profile.discord_id);
  if (!candidates.length) return;

  let checked = 0;
  let changed = 0;
  let skipped = 0;

  for (const profile of candidates) {
    const hasRole = await discordUserHasRole(client, config, profile, logger);
    if (hasRole === null) {
      skipped += 1;
      continue;
    }
    checked += 1;
    if (Boolean(profile.is_admin) === hasRole) continue;

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ is_admin: hasRole })
      .eq("id", profile.id);
    if (updateError) throw new Error(`update admin role for ${profile.username || profile.id}: ${updateError.message}`);
    changed += 1;
  }

  if (changed || skipped) {
    logger.info(`Admin role sync checked ${checked} profile(s), updated ${changed}, skipped ${skipped}.`);
  }
}

async function discordUserHasRole(client, config, profile, logger) {
  try {
    const member = await client.rest.get(Routes.guildMember(config.discordGuildId, profile.discord_id));
    return Array.isArray(member?.roles) && member.roles.includes(config.discordAdminRoleId);
  } catch (error) {
    if (error?.code === 10007 || error?.status === 404) return false;
    logger.warn(`Could not check admin role for ${profile.username || profile.discord_id}: ${error?.message || error}`);
    return null;
  }
}

async function loadPlaytest(supabase, playtestId) {
  return maybeSingle(
    supabase
      .from("playtests")
      .select("id, title, discord_admin_channel_id, discord_confirmation_channel_id")
      .eq("id", playtestId),
    "load playtest"
  );
}

async function loadSlot(supabase, slotId) {
  return maybeSingle(
    supabase
      .from("playtest_slots")
      .select("id, start_datetime, end_datetime, label, source")
      .eq("id", slotId),
    "load slot"
  );
}

async function loadProfile(supabase, userId) {
  return maybeSingle(
    supabase
      .from("profiles")
      .select("id, username, discord_id")
      .eq("id", userId),
    "load profile"
  );
}

async function loadNotificationSubscribers(supabase, playtestId, slotId) {
  const { data: subscriptions, error } = await supabase
    .from("playtest_notification_subscriptions")
    .select("user_id")
    .eq("playtest_id", playtestId)
    .eq("slot_id", slotId)
    .eq("notify_on_confirmation", true);

  if (error) throw new Error(`load notification subscriptions: ${error.message}`);
  const userIds = [...new Set((subscriptions || []).map((entry) => entry.user_id).filter(Boolean))];
  if (!userIds.length) return [];

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, username, discord_id")
    .in("id", userIds);

  if (profilesError) throw new Error(`load subscriber profiles: ${profilesError.message}`);
  return (profiles || []).filter((profile) => profile.discord_id);
}
