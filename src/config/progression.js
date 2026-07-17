export const COSMETIC_ACQUISITION_TYPES = Object.freeze([
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
    { value: "games", label: "Games played" },
    { value: "wins", label: "Wins" },
    { value: "kills", label: "Kills" },
    { value: "mvp", label: "MVP awards" },
    { value: "hits", label: "Hits" },
    { value: "headshot_kills", label: "Headshot kills" },
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

export function progressionOptionLabel(options, value, fallback = "Unknown") {
    return options.find((option) => option.value === value)?.label || fallback;
}

export function cosmeticCanAppearInShop(item) {
    if (!item || (item.type === "title" && item.id === "owner")) return false;
    return Boolean(
        item.active
        && item.acquisitionType === "store"
        && item.shopEnabled
        && Number(item.unitAmount) > 0
    );
}
