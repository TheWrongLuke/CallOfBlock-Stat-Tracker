export const GAMEPLAY_MODES = Object.freeze([
    { id: "battleRoyale", rule: "battle_royale", label: "Battle Royale", short: "BR" },
    { id: "zombieSurvival", rule: "zombie_survival", label: "Zombie Survival", short: "Zombie" },
    { id: "teamDeathmatch", rule: "team_deathmatch", label: "Team Deathmatch", short: "TDM" },
    { id: "freeForAll", rule: "free_for_all", label: "Free For All", short: "FFA" },
    { id: "duel", rule: "duels", label: "Duels", short: "Duels" }
]);

export function progressionMode(mode) {
    return GAMEPLAY_MODES.find((entry) => entry.id === mode || entry.rule === mode);
}

// Compatibility aggregates must never be counted alongside their split sources.
export function progressionModeKeys(profile, mode, version = 4) {
    const arenas = profile?.teamDeathmatch || profile?.freeForAll ? ["teamDeathmatch", "freeForAll"] : ["deathmatch"];
    if (mode === "deathmatch") return arenas;
    if (mode === "overall" || !mode) {
        return version < 4 ? ["battleRoyale", ...arenas] : ["battleRoyale", ...arenas, "duel", "zombieSurvival"];
    }
    const explicit = progressionMode(mode);
    return explicit ? [explicit.id] : [];
}

export function progressionModeLabel(mode, short = false) {
    if (mode === "deathmatch") return "TDM / FFA";
    const entry = progressionMode(mode);
    return entry
        ? entry[short ? "short" : "label"]
        : mode === "overall"
          ? short
              ? "All"
              : "any mode"
          : "Unknown mode";
}
