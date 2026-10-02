const modes = [
    ["Battle Royale", "battle_royale"],
    ["Zombie Survival", "zombie_survival"],
    ["Team Deathmatch", "team_deathmatch"],
    ["Free For All", "free_for_all"],
    ["Duels", "duels"],
    ["Either", "either"]
];

export const PLAYTEST_MODE_OPTIONS = modes.map(([label]) => label);
export function labelToDbModePreference(label) {
    return modes.find(([name]) => name === label)?.[1] || (label === "Deathmatch" ? "deathmatch" : "either");
}
export function dbModePreferenceToLabel(value) {
    return modes.find(([, id]) => id === value)?.[0] || (value === "deathmatch" ? "Deathmatch (Legacy)" : "Either");
}
