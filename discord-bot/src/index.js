import { Events } from "discord.js";
import { config } from "./config.js";
import { createDiscordClient } from "./discord-client.js";
import { bindLinkInteractions, registerLinkCommands } from "./linking.js";
import { createLogger } from "./logger.js";
import { startPollers } from "./pollers.js";
import { loadState, saveState } from "./state-store.js";
import { createSupabase } from "./supabase.js";

const logger = createLogger("call-of-block-bot");
const client = createDiscordClient();
const supabase = createSupabase(config);
const state = await loadState(config, logger);

let stopPollers = null;

bindLinkInteractions({ client, config, state, logger });

client.once(Events.ClientReady, async (readyClient) => {
  logger.info(`Logged in as ${readyClient.user.tag}`);
  try {
    await registerLinkCommands(client, config, logger);
  } catch (error) {
    logger.warn("Could not register Discord slash commands:", error.message);
  }
  stopPollers = startPollers({ client, config, supabase, state, logger });
});

client.on(Events.Error, (error) => {
  logger.error("Discord client error:", error);
});

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("unhandledRejection", (error) => {
  logger.error("Unhandled rejection:", error);
});
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception:", error);
  void shutdown("uncaughtException", 1);
});

await client.login(config.discordToken);

async function shutdown(reason, exitCode = 0) {
  logger.info(`Shutting down: ${reason}`);
  if (stopPollers) stopPollers();
  await saveState(config, state);
  client.destroy();
  process.exit(exitCode);
}
