function command(commandText, permission, mode, scope, activeMatch, description) {
    return {
        command: commandText,
        description: `Permission: ${permission} | Mode: ${mode} | ${scope} | Active match: ${activeMatch}. ${description}`
    };
}

export const CURRENT_SERVER_COMMAND_SECTIONS = [
    {
        title: "Player commands",
        summary:
            "Canonical public commands registered by BRControl. Obsolete /br*, /joindm, /vote, and /hub roots are not used.",
        entries: [
            command(
                "/cob help [br|dm|duel|zombie|vehicle|discord|stats|admin]",
                "0",
                "Any",
                "Runtime",
                "No",
                "Show the root or focused command help."
            ),
            command("/cob menu", "0 / player", "Any", "Runtime", "No", "Open the Call of Block menu."),
            command(
                "/cob hub",
                "0 / player",
                "Any",
                "Runtime",
                "No",
                "Leave spectator flow where needed and return to hub."
            ),
            command(
                "/cob leave [confirm]",
                "0 / player",
                "Any match",
                "Runtime",
                "Yes",
                "Request and confirm a safe voluntary match leave."
            ),
            command(
                "/cob br queue <join|solo|team <id>|newteam|spectate|leave|status>",
                "0 / player",
                "Battle Royale",
                "Runtime",
                "No",
                "Manage the BR player or spectator queue."
            ),
            command(
                "/cob dm queue tdm <join|team <1|2|random>|spectate>",
                "0 / player",
                "Team Deathmatch",
                "Runtime",
                "No",
                "Join TDM, choose a team preference, or spectate."
            ),
            command(
                "/cob dm queue ffa <join|spectate>",
                "0 / player",
                "Free For All",
                "Runtime",
                "No",
                "Join or spectate FFA Deathmatch."
            ),
            command(
                "/cob dm queue <leave|status>",
                "0 / player",
                "Deathmatch",
                "Runtime",
                "No",
                "Leave or inspect the selected Deathmatch queue."
            ),
            command(
                "/cob dm vote <map <id>|random|show>",
                "0 / player",
                "Deathmatch",
                "Runtime",
                "No; queue required",
                "Vote for or inspect the next map."
            ),
            command(
                "/cob duel queue <join|team <1|2|random>|spectate|leave>",
                "0 / player",
                "Duel",
                "Runtime",
                "No",
                "Manage the Duel player or spectator queue."
            ),
            command(
                "/cob zombie queue <join|spectate|leave>",
                "0 / player",
                "Zombie Survival",
                "Runtime",
                "No",
                "Manage the Zombie Survival player or spectator queue."
            ),
            command(
                "/cob kit [list|<id>]",
                "0 / player",
                "DM or Duel",
                "Runtime",
                "Depends",
                "List, open, or select kits when the mode permits selection."
            ),
            command(
                "/cob discord link <code>",
                "0 / player",
                "Account",
                "Persistent link",
                "No",
                "Claim a one-time code created by the Discord bot."
            ),
            command(
                "/cob leaderboard [view|br view|dm view|sort <wins|kills|games>]",
                "0 / player",
                "Statistics",
                "Runtime UI",
                "No",
                "Open and sort the in-game leaderboard."
            ),
            command(
                "/cob vehicle <queue <join|leave|team>|select <template>|ready|unready>",
                "0 / player",
                "Vehicle Arena",
                "Runtime",
                "No",
                "Manage the experimental Vehicle Arena queue and selection."
            )
        ]
    },
    {
        title: "Match operations",
        summary: "Permission-level 2 operations. Debug and Trailer sessions never publish gameplay statistics.",
        entries: [
            command(
                "/cob admin doctor",
                "2",
                "Server",
                "Read-only diagnostic",
                "No",
                "Audit required BR, DM, datapack, TacZ, and integration state."
            ),
            command(
                "/cob admin mode <hub|battle_royale|deathmatch>",
                "2",
                "Server",
                "Runtime",
                "No",
                "Set the current server mode and its destruction default."
            ),
            command(
                "/cob admin br <start|end|cleanupoffline>",
                "2",
                "Battle Royale",
                "Runtime",
                "Depends",
                "Start/end BR or clean stale offline participants."
            ),
            command(
                "/cob admin br debug <start|stop|status>",
                "2",
                "BR Debug",
                "Runtime / untracked",
                "Depends",
                "Run or inspect an untracked Debug session."
            ),
            command(
                "/cob admin br debug destruction <on|off>",
                "2",
                "BR Debug",
                "Runtime / temporary",
                "No",
                "Set queued or active Debug destruction."
            ),
            command(
                "/cob admin br debug respawn <configured|off|limited|infinite>",
                "2",
                "BR Debug",
                "Runtime / temporary",
                "No",
                "Choose the Debug respawn policy."
            ),
            command(
                "/cob admin br debug victory <on|off>",
                "2",
                "BR Debug",
                "Runtime / temporary",
                "No",
                "Enable or disable automatic Debug winner resolution."
            ),
            command(
                "/cob admin br trailer <start|stop|status|destruction <on|off>>",
                "2",
                "BR Trailer",
                "Runtime / untracked",
                "Depends",
                "Run the separate cinematic Trailer session."
            ),
            command(
                "/cob admin dm runtime <status|start [map]|end>",
                "2",
                "Deathmatch",
                "Runtime",
                "Depends",
                "Inspect, start, or stop a Deathmatch round."
            ),
            command(
                "/cob admin dm queue <status|sendmain>",
                "2",
                "Deathmatch",
                "Runtime",
                "No",
                "Inspect queued players or send them to the general lobby."
            ),
            command(
                "/cob admin dm vote <show|clear|status|start|endnow>",
                "2",
                "Deathmatch",
                "Runtime",
                "No",
                "Administer the map-vote session."
            ),
            command(
                "/cob admin duel <status|start <map> [firstTo]|stop>",
                "2",
                "Duel",
                "Runtime",
                "Depends",
                "Inspect, validate/start, or stop Duel."
            ),
            command(
                "/cob admin zombie <start [map]|stop|status>",
                "2",
                "Zombie Survival",
                "Runtime",
                "Depends",
                "Start, stop, or inspect Zombie Survival."
            ),
            command(
                "/cob admin zombie population <get|status|set <amount> [--persist]|reset|clear confirm>",
                "2",
                "Zombie Survival",
                "Runtime; --persist writes config",
                "Yes",
                "Inspect or safely override the authoritative zombie population."
            ),
            command(
                "/cob destruction <status|on|off|toggle|reset>",
                "2",
                "Active mode",
                "Runtime / temporary",
                "Yes except status",
                "Override current-match destruction; the next match restores its mode default."
            ),
            command(
                "/cob reconnect [reload]",
                "2",
                "All matches",
                "Runtime; reload reads config",
                "No",
                "Inspect reconnect sessions or reload reconnect configuration."
            ),
            command(
                "/cob admin vehicle <queue|templates|reload|selection|start|stop>",
                "2",
                "Vehicle Arena",
                "Runtime",
                "Depends",
                "Administer the experimental Vehicle Arena flow."
            )
        ]
    },
    {
        title: "Data safety and access",
        summary:
            "Commands that affect access or authoritative statistics. Match invalidation and rebuild require confirmation tokens.",
        entries: [
            command(
                "/cob whitelist <status|on|off|add <players>|remove <players>|sync>",
                "2",
                "Server access",
                "Persistent Minecraft whitelist",
                "No",
                "Manage the built-in whitelist; sync reloads disk and never reads Supabase."
            ),
            command(
                "/cob match inspect <matchId>",
                "2",
                "Statistics",
                "Read-only",
                "No",
                "Preview one completed match and rebuild provenance."
            ),
            command(
                "/cob match invalidate <matchId> --dry-run <reason>",
                "2",
                "Statistics",
                "Read-only",
                "No",
                "Preview invalidation without changing data."
            ),
            command(
                "/cob match invalidate <matchId> <reason>",
                "2",
                "Statistics",
                "Stages persistent change",
                "No",
                "Stage an invalidation and return a five-minute confirmation token."
            ),
            command(
                "/cob match confirm <token>",
                "2",
                "Statistics",
                "Persistent / backed up",
                "No",
                "Create the backup, invalidate, and rebuild after review."
            ),
            command(
                "/cob match invalidated",
                "2",
                "Statistics",
                "Read-only",
                "No",
                "List the private invalidation audit."
            ),
            command(
                "/cob stats rebuild [--dry-run]",
                "2",
                "Statistics",
                "Read-only or staged",
                "No",
                "Preview or stage a deterministic rebuild from valid matches."
            ),
            command(
                "/cob stats confirm <token>",
                "2",
                "Statistics",
                "Persistent / backed up",
                "No",
                "Confirm a staged statistics rebuild."
            ),
            command(
                "/cob leaderboard <br|dm> <sethere|clear|refresh|resetstats|status>",
                "2",
                "Statistics displays",
                "Mixed runtime/persistent",
                "No",
                "Manage in-world leaderboard displays or reset the selected mode's stats."
            ),
            command(
                "/cob leaderboard <sortsethere|sortreset|resetstats>",
                "2",
                "Statistics displays",
                "Mixed runtime/persistent",
                "No",
                "Manage the shared sort control or reset all tracked stats."
            )
        ]
    },
    {
        title: "Persistent configuration",
        summary:
            "Configuration and map-authoring branches. The manual Shmar reset is intentionally not run after every match.",
        entries: [
            command(
                "/cob admin sethub",
                "2 / player",
                "Hub",
                "Persistent",
                "No",
                "Save the current player position as hub."
            ),
            command(
                "/cob kit <save|overwrite|delete|give> <id> [displayName]",
                "2 / player",
                "Kits",
                "Persistent except give",
                "No",
                "Create, replace, delete, or give kit definitions."
            ),
            command("/cob admin reloadkits", "2", "Kits", "Reload", "No", "Reload kit configuration from disk."),
            command(
                "/cob admin br config <show|reload>",
                "2",
                "Battle Royale",
                "Read/reload",
                "No",
                "Inspect or reload BR setup configuration."
            ),
            command(
                "/cob admin br config <chests min max|vehicles type min max|preset name|pool id>",
                "2",
                "Battle Royale",
                "Persistent",
                "No",
                "Configure loot and vehicle ranges or selected pools."
            ),
            command(
                "/cob admin br config <usezone on|off|respawn on|off|zonewallheight height|prepchunks value|prepticks value>",
                "2",
                "Battle Royale",
                "Persistent",
                "No",
                "Configure zone, respawn, wall, and preparation defaults."
            ),
            command(
                "/cob admin br config bus <dropallowed|centeralign> <get|set value>",
                "2",
                "Battle Royale",
                "Read/persistent",
                "No",
                "Inspect or tune fly-by drop alignment."
            ),
            command(
                "/cob admin br zone <setarena|reload|configstart|begin|stop> ...",
                "2 / player where positioned",
                "Battle Royale zone",
                "Mixed persistent/runtime",
                "Depends",
                "Author arena bounds or operate the zone."
            ),
            command(
                "/cob admin br rules <status|sethere|refresh|clear>",
                "2 / player",
                "Battle Royale",
                "Persistent display",
                "No",
                "Manage the in-world rules display."
            ),
            command(
                "/cob admin br reset <set1|set2|show|save|start|cancel|status> [chunksPerStep] [ticksBetweenSteps]",
                "2 / player where positioned",
                "Shmar maintenance",
                "Persistent snapshot/manual runtime job",
                "No active combat recommended",
                "Author and manually run the full-map maintenance snapshot. It is never automatic per match."
            ),
            command(
                "/cob admin br vehicles <reload|template ...|pad ...|spawnround ...|round ...|clearpads>",
                "2 / player where positioned",
                "Vehicles",
                "Mixed persistent/runtime",
                "No",
                "Manage vehicle templates, spawn pads, and round ranges."
            ),
            command(
                "/cob admin dm config <show|reload|time|kills|ffakills|mode|celebration|vote|blockdamage> ...",
                "2",
                "Deathmatch",
                "Read/persistent",
                "No",
                "Configure TDM/FFA defaults."
            ),
            command(
                "/cob admin dm map <list|show|create|delete|setlobby|clearlobby|addspawn|removenearestspawn|addffaspawn|removenearestffaspawn|tprandom|tprandomffa> ...",
                "2 / player where positioned",
                "Deathmatch maps",
                "Persistent",
                "No",
                "Author map metadata and team/FFA spawns."
            ),
            command(
                "/cob admin dm lobby <list|show|create|delete|setspawn|tp|setgeneral> ...",
                "2 / player where positioned",
                "Deathmatch lobbies",
                "Persistent",
                "No",
                "Author and select DM lobbies."
            ),
            command(
                "/cob admin duel config <show|reload>",
                "2",
                "Duel",
                "Read/reload",
                "No",
                "Inspect or reload Duel configuration."
            ),
            command(
                "/cob admin duel map <list|show|create|delete|addspawn|removespawn|setspectator|setbounds|reload> ...",
                "2 / player where positioned",
                "Duel maps",
                "Persistent",
                "No",
                "Author valid Duel maps, bounds, spawns, and spectator anchor."
            ),
            command(
                "/cob admin zombie config <show|reload>",
                "2",
                "Zombie Survival",
                "Read/reload",
                "No",
                "Inspect or reload Zombie Survival config and variants."
            ),
            command(
                "/cob admin zombie map <list|show|reload> [id]",
                "2",
                "Zombie Survival",
                "Read/reload",
                "No",
                "Inspect or reload Zombie map definitions."
            ),
            command(
                "/cob admin discord <status|enable|disable|refresh|webhook|token|guild|role|source|bind|bindme|binduuid|unbind|unbindme> ...",
                "2",
                "Discord integration",
                "Persistent secrets/links",
                "No",
                "Manage server-side Discord synchronization. Never place token or webhook values in public files."
            ),
            command(
                "/cob admin vehicle <mode|limits|base|spawn|vehicle> ...",
                "2 / player where positioned",
                "Vehicle Arena",
                "Persistent",
                "No",
                "Configure Vehicle Arena mode, limits, bases, spawns, and vehicle pools."
            )
        ]
    }
];
