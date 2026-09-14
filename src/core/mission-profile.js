export function findStatsProfile(payload, playerId) {
    if (!payload || !playerId) return null;
    if (payload.playerId === playerId) return payload;
    if (payload.profile?.playerId === playerId) return payload.profile;
    return (
        (Array.isArray(payload.profiles) ? payload.profiles : []).find((profile) => profile.playerId === playerId) ||
        null
    );
}

export function mergeStatsProfile(core, weapons, maps) {
    if (!core) return null;
    const profile = { ...core };
    for (const mode of ["battleRoyale", "deathmatch", "teamDeathmatch", "freeForAll", "duel", "zombieSurvival"]) {
        if (!core[mode]) continue;
        const details = { ...core[mode].details };
        // A slice owns only its collection. Empty placeholder arrays in other slices must not erase it.
        if (Array.isArray(weapons?.[mode]?.details?.weapons)) details.weapons = weapons[mode].details.weapons;
        for (const key of ["maps", "deathmatchMaps", "battleRoyaleMaps"]) {
            if (Array.isArray(maps?.[mode]?.details?.[key])) details[key] = maps[mode].details[key];
        }
        profile[mode] = { ...core[mode], details };
    }
    return profile;
}
