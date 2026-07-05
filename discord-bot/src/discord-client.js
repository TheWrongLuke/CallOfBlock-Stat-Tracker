import { Client, GatewayIntentBits } from "discord.js";

export function createDiscordClient() {
  return new Client({
    intents: [GatewayIntentBits.Guilds]
  });
}

export async function sendChannelMessage(client, channelId, payload, logger) {
  if (!channelId) {
    logger.warn("No Discord channel configured for message", payload?.content || payload?.embeds?.[0]?.data?.title || "");
    return false;
  }

  const channel = await client.channels.fetch(channelId);
  if (!channel || !channel.isTextBased()) {
    logger.warn(`Channel ${channelId} is missing or not text-based`);
    return false;
  }

  await channel.send(payload);
  return true;
}
