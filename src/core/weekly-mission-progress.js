// Shared by every account surface; progress is derived from exported statistics and saved baselines.
const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

export function weeklyMissionProgress(profile, mission) {
    const authoritative = mission?.serverProgress;
    if (authoritative && typeof authoritative.complete === "boolean") {
        const value = Math.max(0, number(authoritative.value));
        const target = Math.max(1, number(authoritative.target));
        return {
            value,
            target,
            complete: authoritative.complete,
            progress: Math.max(0, Math.min(1, number(authoritative.progress))),
            status: Array.isArray(authoritative.parts)
                ? authoritative.parts
                      .map(
                          (part) =>
                              `${modeShort(part.mode)} ${formatMetric(part.value, part.metric)} / ${formatMetric(part.target, part.metric)}`
                      )
                      .join(" | ")
                : authoritative.complete
                  ? "Complete"
                  : `${formatMetric(value, mission.metric)} / ${formatMetric(target, mission.metric)}`
        };
    }
    const requirement = normalizeRequirements(mission?.requirements);
    if (requirement.type === "all") {
        const baselines = Array.isArray(mission?.baseline?.values) ? mission.baseline.values : [];
        const parts = requirement.components.map((component, index) => {
            const value = Math.max(0, missionMetric(profile, { ...mission, ...component }) - number(baselines[index]));
            return { ...component, value };
        });
        return {
            value: parts.reduce((sum, part) => sum + part.value, 0),
            target: parts.reduce((sum, part) => sum + part.target, 0),
            complete: parts.length > 0 && parts.every((part) => part.value >= part.target),
            progress: parts.length
                ? parts.reduce((sum, part) => sum + Math.min(1, part.value / part.target), 0) / parts.length
                : 0,
            status: parts
                .map(
                    (part) =>
                        `${modeShort(part.mode)} ${formatMetric(part.value, part.metric)} / ${formatMetric(part.target, part.metric)}`
                )
                .join(" | ")
        };
    }
    if (requirement.type === "distinct") {
        const baselines =
            mission?.baseline?.values && typeof mission.baseline.values === "object" ? mission.baseline.values : {};
        const current = distinctValues(profile, mission, requirement);
        const value = Object.entries(current).filter(
            ([id, count]) => number(count) - number(baselines[id]) >= requirement.perItemTarget
        ).length;
        const target = Math.max(1, number(mission.target));
        return {
            value,
            target,
            complete: value >= target,
            progress: value / target,
            status: `${formatNumber(value)} / ${formatNumber(target)}`
        };
    }
    const current = requirementValue(profile, mission, requirement);
    const value = Math.max(0, current - number(mission.baseline));
    const target = Math.max(1, number(mission.target));
    return {
        value,
        target,
        complete: value >= target,
        progress: value / target,
        status:
            value >= target
                ? "Complete"
                : `${formatMetric(value, mission.metric)} / ${formatMetric(target, mission.metric)}`
    };
}

function normalizeRequirements(value) {
    let source = value;
    if (typeof source === "string") {
        try {
            source = JSON.parse(source);
        } catch (_error) {
            source = null;
        }
    }
    if (!source || typeof source !== "object") return { type: "stat" };
    if (source.type === "all")
        return {
            type: "all",
            components: (Array.isArray(source.components) ? source.components : [])
                .filter((component) => component && typeof component === "object")
                .map((component) => ({ ...component, target: Math.max(1, number(component.target)) }))
        };
    if (source.type === "distinct")
        return {
            type: "distinct",
            collection: source.collection || "weapons",
            metric: source.metric || "kills",
            perItemTarget: Math.max(1, number(source.perItemTarget) || 1)
        };
    if (source.type === "counter")
        return { type: "counter", key: String(source.key || ""), scope: source.scope || "mode" };
    if (source.type === "map_stat") return { type: "map_stat", metric: source.metric || "games" };
    return { type: "stat" };
}

function requirementValue(profile, mission, requirement) {
    if (requirement.type === "map_stat") {
        const map = mapEntries(profile).find((entry) => entry.id === mission.mapId);
        return number(normalizeStats(map?.stats)[requirement.metric]);
    }
    if (requirement.type === "counter") {
        const key = counterKey(requirement.key, mission);
        if (requirement.scope === "weapon") {
            const weapon = weaponEntries(profile, mission.mode).find((entry) => entry.id === mission.weaponId);
            return number(normalizeStats(weapon?.stats).weeklyCounters[key]);
        }
        return number(normalizeStats(modePlayer(profile, mission.mode)?.stats).weeklyCounters[key]);
    }
    return missionMetric(profile, mission);
}

function distinctValues(profile, mission, requirement) {
    if (requirement.collection === "vehicle_types") {
        return Object.fromEntries(
            Object.entries(normalizeStats(modePlayer(profile, mission.mode)?.stats).weeklyCounters)
                .filter(([key]) => key.startsWith("vehicle_damage_type:"))
                .map(([key, value]) => [key.slice(20), value])
        );
    }
    if (requirement.collection === "dm_maps")
        return Object.fromEntries(
            mapEntries(profile).map((entry) => [entry.id, number(normalizeStats(entry.stats)[requirement.metric])])
        );
    const weapons = weaponEntries(profile, mission.mode).filter(
        (entry) => entry.id && entry.id !== "unknown" && weaponCategory(entry) !== "utility"
    );
    if (requirement.collection === "categories") {
        const values = {};
        for (const weapon of weapons)
            values[weaponCategory(weapon)] =
                number(values[weaponCategory(weapon)]) + number(normalizeStats(weapon.stats)[requirement.metric]);
        return values;
    }
    return Object.fromEntries(
        weapons.map((weapon) => [weapon.id, number(normalizeStats(weapon.stats)[requirement.metric])])
    );
}

function missionMetric(profile, mission) {
    if (!profile || !mission) return 0;
    if (mission.weaponId || mission.category)
        return weaponEntries(profile, mission.mode).reduce((sum, weapon) => {
            if (mission.weaponId && weapon.id !== mission.weaponId) return sum;
            if (mission.category && weaponCategory(weapon) !== mission.category) return sum;
            return sum + number(normalizeStats(weapon.stats)[mission.metric]);
        }, 0);
    return number(normalizeStats(modePlayer(profile, mission.mode)?.stats)[mission.metric]);
}

function modePlayer(profile, mode) {
    return { stats: combineStats(...missionModes(profile, mode).map((key) => profile?.[key]?.stats)) };
}

function missionModes(profile, mode) {
    // Older mission baselines still use DM. Never count a compatibility aggregate and its split modes twice.
    const dm = profile?.teamDeathmatch || profile?.freeForAll ? ["teamDeathmatch", "freeForAll"] : ["deathmatch"];
    if (mode === "deathmatch") return dm;
    if (mode && mode !== "overall") return [mode];
    return ["battleRoyale", ...dm];
}

function weaponEntries(profile, mode) {
    if (!profile) return [];
    const merged = new Map();
    for (const weapon of missionModes(profile, mode).flatMap((key) => profile[key]?.details?.weapons || [])) {
        const id = String(weapon?.id || weapon?.label || "");
        if (!id) continue;
        const current = merged.get(id) || { ...weapon, id, stats: normalizeStats(null) };
        current.stats = combineStats(current.stats, weapon.stats);
        merged.set(id, current);
    }
    return [...merged.values()];
}

function mapEntries(profile) {
    const merged = new Map();
    for (const key of missionModes(profile, "deathmatch")) {
        const details = profile?.[key]?.details;
        const entries =
            [details?.maps, details?.deathmatchMaps].find((rows) => Array.isArray(rows) && rows.length) || [];
        for (const entry of entries) {
            if (!entry?.id) continue;
            const previous = merged.get(entry.id);
            merged.set(entry.id, { ...entry, stats: combineStats(previous?.stats, entry.stats) });
        }
    }
    return [...merged.values()];
}

function normalizeStats(stats) {
    const keys = [
        "wins",
        "kills",
        "deaths",
        "games",
        "playtimeSeconds",
        "hits",
        "headshots",
        "headshotKills",
        "mvp",
        "bestKillStreak",
        "topMatchKills",
        "utilityKills",
        "vehicleKills",
        "collateralHits",
        "collateralKills",
        "collateralHeadshotKills",
        "aces",
        "damageDealt",
        "longestKillDistance",
        "longestSurvivalSeconds"
    ];
    return {
        ...Object.fromEntries(
            keys.map((key) => {
                const fallback =
                    key === "games"
                        ? stats?.matches
                        : key === "mvp"
                          ? (stats?.mvps ?? stats?.mvpCount ?? stats?.mvpAwards)
                          : 0;
                return [key, number(stats?.[key] ?? fallback)];
            })
        ),
        weeklyCounters: stats?.weeklyCounters && typeof stats.weeklyCounters === "object" ? stats.weeklyCounters : {}
    };
}

function combineStats(...sources) {
    const total = normalizeStats(null);
    for (const source of sources) {
        const stats = normalizeStats(source);
        for (const key of Object.keys(total)) {
            if (key === "weeklyCounters") continue;
            if (["bestKillStreak", "topMatchKills", "longestKillDistance", "longestSurvivalSeconds"].includes(key)) {
                total[key] = Math.max(total[key], number(stats[key]));
            } else total[key] += number(stats[key]);
        }
        for (const [key, value] of Object.entries(stats.weeklyCounters)) {
            total.weeklyCounters[key] = number(total.weeklyCounters[key]) + number(value);
        }
    }
    return total;
}

function weaponCategory(entry) {
    const value = `${entry?.id || ""} ${entry?.label || ""}`.toLowerCase();
    if (/grenade|smoke|knife|m320|launcher|mine|c4|rocket/.test(value)) return "utility";
    if (/m1014|shotgun/.test(value)) return "shotgun";
    if (/minigun|rpk|machine.?gun|lmg/.test(value)) return "lmg";
    if (/uzi|p90|smg|mp5|vector/.test(value)) return "smg";
    if (/deagle|b93|glock|m1911|pistol|revolver/.test(value)) return "pistol";
    if (/awp|mk14|bocek|sniper|marksman|crossbow/.test(value)) return "marksman";
    return "rifle";
}

function counterKey(key, mission) {
    return String(key || "")
        .replaceAll("{category}", mission?.category || "")
        .replaceAll("{weapon}", mission?.weaponId || "")
        .replaceAll("{map}", mission?.mapId || "");
}

function modeShort(mode) {
    return mode === "battleRoyale" ? "BR" : mode === "deathmatch" ? "DM" : "All";
}

function formatMetric(value, metric) {
    return metric === "playtimeSeconds" ? formatDuration(value) : formatNumber(value);
}

function formatNumber(value) {
    return Number(value || 0)
        .toFixed(2)
        .replace(/\.00$/, "");
}

function formatDuration(value) {
    const seconds = Math.max(0, Math.round(number(value)));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours ? `${hours}h ${minutes}m` : minutes ? `${minutes}m` : `${seconds}s`;
}
