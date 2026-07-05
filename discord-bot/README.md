# Call of Block Discord Bot

Discord bot for playtest scheduling alerts.

Current features:
- Sends a private admin-channel message when a playtest vote event is recorded in Supabase.
- Sends a public confirmation-channel message when a playtest slot is confirmed.
- Mentions users who opted into confirmation notifications.
- Persists processed event IDs in `.bot-state.json` so restarts do not resend old alerts.

## Setup

1. Run the Supabase playtest schema from `../supabase-playtests-schema.sql`.
2. Create a Discord bot in the Discord Developer Portal.
3. Enable the bot in your server with permission to view and send messages in the admin and confirmation channels.
4. Copy `.env.example` to `.env` and fill the values.
5. Install dependencies:

```powershell
npm.cmd install
```

6. Start the bot:

```powershell
npm.cmd start
```

## Environment

`DISCORD_TOKEN` is the bot token.

`SUPABASE_SERVICE_ROLE_KEY` must be the service-role key, not the public anon key. Keep it only on the machine/server that runs the bot.

`DEFAULT_ADMIN_CHANNEL_ID` is the private channel for vote alerts.

`DEFAULT_CONFIRMATION_CHANNEL_ID` is the public channel for confirmed event notifications. Per-playtest values in Supabase override these defaults when present.

`STARTUP_BACKFILL_MINUTES=0` means the bot starts from "now" on first run. Increase it if you want the first run to catch recent events.

## GitHub Deployment Note

Do not commit `.env` or `.bot-state.json`. They are ignored by git.
