export const GAME_MODE_LABELS = Object.freeze({
    battleRoyale: "Battle Royale",
    zombieSurvival: "Zombie Survival",
    teamDeathmatch: "Team Deathmatch",
    freeForAll: "Free For All",
    duel: "Duels"
});

const aliases = Object.freeze({
    battleroyale: "battleRoyale",
    br: "battleRoyale",
    zombiesurvival: "zombieSurvival",
    zombie: "zombieSurvival",
    zombies: "zombieSurvival",
    teamdeathmatch: "teamDeathmatch",
    tdm: "teamDeathmatch",
    teams: "teamDeathmatch",
    freeforall: "freeForAll",
    ffa: "freeForAll",
    solo: "freeForAll",
    duel: "duel",
    duels: "duel"
});
const key = (value) =>
    String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

export function matchGameMode(match) {
    const mode = key(match?.mode);
    if (aliases[mode]) return aliases[mode];
    if (mode !== "deathmatch") return "unknown";
    const variant = aliases[key(match.modeVariant || match.variant || match.format)];
    if (["teamDeathmatch", "freeForAll"].includes(variant)) return variant;
    // Older telemetry records the format in its side IDs, not in its mode field.
    const sides = (Array.isArray(match.participants) ? match.participants : []).map((player) =>
        String(player.teamId || "")
    );
    if (sides.length && sides.every((side) => /^solo(?:[-_: ].*|$)/i.test(side))) return "freeForAll";
    if (sides.length && sides.every((side) => /^(?:red|blue|team[-_: ]?\d+)$/i.test(side))) {
        return "teamDeathmatch";
    }
    return "deathmatch";
}

export function gameModeLabel(mode) {
    return GAME_MODE_LABELS[mode] || (mode === "deathmatch" ? "TDM / FFA (legacy)" : "Match");
}

export function modernizeModeText(value) {
    return String(value || "").replace(/\b(team\s+deathmatch|free\s+for\s+all\s+deathmatch|deathmatch)\b/gi, (label) =>
        /^team\s/i.test(label) ? "Team Deathmatch" : /^free\s/i.test(label) ? "Free For All" : "TDM / FFA"
    );
}
