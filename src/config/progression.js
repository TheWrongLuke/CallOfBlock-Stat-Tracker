export const COSMETIC_ACQUISITION_TYPES = Object.freeze([
    { value: "default", label: "Given to every account" },
    { value: "progression", label: "Progression reward" },
    { value: "exclusive", label: "Admin grant / exclusive" },
    { value: "owner", label: "Owner only" },
    { value: "store", label: "Future store item" }
]);

export const PROGRESSION_MODES = Object.freeze([
    { value: "overall", label: "All modes" },
    { value: "battle_royale", label: "Battle Royale" },
    { value: "deathmatch", label: "Deathmatch" }
]);

export const PROGRESSION_METRICS = Object.freeze([
    { value: "account_linked", label: "Minecraft account linked" },
    { value: "games", label: "Games played" },
    { value: "wins", label: "Wins" },
    { value: "kills", label: "Kills" },
    { value: "deaths", label: "Deaths" },
    { value: "mvp", label: "MVP awards" },
    { value: "hits", label: "Hits" },
    { value: "headshots", label: "Headshots" },
    { value: "headshot_kills", label: "Headshot kills" },
    { value: "best_kill_streak", label: "Best kill streak" },
    { value: "top_match_kills", label: "Best kills in one match" },
    { value: "utility_kills", label: "Utility kills" },
    { value: "vehicle_kills", label: "Vehicle kills" },
    { value: "playtime_seconds", label: "Playtime seconds" },
    { value: "headshot_rate", label: "Headshot rate" }
]);

export const COSMETIC_GRANT_SOURCES = Object.freeze([
    { value: "friend", label: "Friend exclusive" },
    { value: "admin", label: "Admin grant" },
    { value: "progression", label: "Progression award" },
    { value: "owner", label: "Owner exclusive" }
]);

export const WEEKLY_MISSION_DIFFICULTIES = Object.freeze([
    { value: "easy", label: "Easy" },
    { value: "hard", label: "Hard" }
]);

export const WEEKLY_MISSION_MODES = Object.freeze([
    { value: "overall", label: "All modes" },
    { value: "battleRoyale", label: "Battle Royale" },
    { value: "deathmatch", label: "Deathmatch" },
    { value: "random", label: "Random BR or DM" }
]);

export const WEEKLY_MISSION_METRICS = Object.freeze([
    { value: "games", label: "Games played" },
    { value: "wins", label: "Wins" },
    { value: "kills", label: "Kills" },
    { value: "deaths", label: "Deaths" },
    { value: "mvp", label: "MVP awards" },
    { value: "hits", label: "Hits" },
    { value: "headshots", label: "Headshots" },
    { value: "headshotKills", label: "Headshot kills" },
    { value: "bestKillStreak", label: "Best kill streak" },
    { value: "topMatchKills", label: "Best kills in one match" },
    { value: "utilityKills", label: "Utility kills" },
    { value: "vehicleKills", label: "Vehicle kills" },
    { value: "playtimeSeconds", label: "Playtime seconds" }
]);

export const WEEKLY_MISSION_WEAPON_SCOPES = Object.freeze([
    { value: "none", label: "No weapon filter" },
    { value: "exact_weapon", label: "Specific weapon" },
    { value: "random_weapon", label: "Random tracked weapon" },
    { value: "weapon_category", label: "Weapon category" },
    { value: "random_category", label: "Random tracked category" }
]);

export const WEEKLY_MISSION_WEAPON_CATEGORIES = Object.freeze([
    { value: "rifle", label: "Rifle" },
    { value: "smg", label: "SMG" },
    { value: "pistol", label: "Pistol" },
    { value: "marksman", label: "Marksman" },
    { value: "shotgun", label: "Shotgun" },
    { value: "lmg", label: "LMG" },
    { value: "utility", label: "Utility" }
]);

export function progressionOptionLabel(options, value, fallback = "Unknown") {
    return options.find((option) => option.value === value)?.label || fallback;
}

export function cosmeticCanAppearInShop(item) {
    if (!item || (item.type === "title" && item.id === "owner")) return false;
    return Boolean(item.active && item.acquisitionType === "store" && item.shopEnabled && Number(item.unitAmount) > 0);
}
