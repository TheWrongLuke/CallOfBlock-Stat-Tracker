# Call of Block Discord Bot

Discord bot for playtest scheduling alerts.

Current features:
- Sends a private admin-channel message when a playtest vote event is recorded in Supabase.
- Sends a public confirmation-channel message when a playtest slot is confirmed.
- Mentions users who opted into confirmation notifications.
- Syncs a configured Discord role into website admin access.
- Persists processed event IDs in `.bot-state.json` so restarts do not resend old alerts.

## Setup

1. Run the Supabase playtest schema from `../supabase-playtests-schema.sql`.
2. Create a Discord application in the Discord Developer Portal.
3. In that app, open **Bot**, create/reset the token, and copy it into `DISCORD_TOKEN`.
4. Open **OAuth2** and copy the application/client ID into `DISCORD_CLIENT_ID`.
5. Copy `.env.example` to `.env` and fill the values.
6. Install dependencies:

```powershell
npm.cmd install
```

7. Print the server invite URL:

```powershell
npm.cmd run invite
```

Open that URL, choose your Discord server, and authorize the bot. The bot needs access to the private admin-alert channel and the public confirmation channel.

8. Start the bot:

```powershell
npm.cmd start
```

## Environment

`DISCORD_TOKEN` is the bot token.

`DISCORD_CLIENT_ID` is the application ID from the Discord Developer Portal. It is used only to generate the invite URL.

`SUPABASE_SERVICE_ROLE_KEY` must be the service-role key, not the public anon key. Keep it only on the machine/server that runs the bot.

`DEFAULT_ADMIN_CHANNEL_ID` is the private channel for vote alerts.

`DEFAULT_CONFIRMATION_CHANNEL_ID` is the public channel for confirmed event notifications. Per-playtest values in Supabase override these defaults when present.

`DISCORD_GUILD_ID` is your Discord server ID. Enable Developer Mode in Discord, right-click the server, then copy the server ID.

`DISCORD_ADMIN_ROLE_ID` is the Discord role that should become website admin. Right-click the role in Server Settings, then copy the role ID. Users must log into the website once before the bot can sync their profile.

`ADMIN_ROLE_SYNC_INTERVAL_MS` controls how often the bot checks Discord roles and updates `profiles.is_admin`.

`STARTUP_BACKFILL_MINUTES=0` means the bot starts from "now" on first run. Increase it if you want the first run to catch recent events.

## GitHub Deployment Note

Do not commit `.env` or `.bot-state.json`. They are ignored by git.
