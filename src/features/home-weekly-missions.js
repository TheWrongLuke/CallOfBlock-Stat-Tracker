import { claimWeeklyMissionReward, ensureWeeklyMissions, swapWeeklyMission } from "../api/weekly-missions.js";
import { escapeHtml, formatDate, number } from "../core/site-shell.js";

const MISSION_LIMIT = 7;

export function initializeHomeWeeklyMissions(shell) {
    const state = {
        row: null,
        statsProfile: null,
        loading: false,
        loaded: false,
        busyId: "",
        rewardingId: "",
        swapId: "",
        message: ""
    };

    shell.setAccountPanelAddon(() => renderWeeklyMissions(state));
    document.addEventListener("cob:account-panel-open", () => void loadWeeklyMissions(shell, state));
    document.addEventListener("click", (event) => void handleMissionClick(event, shell, state));
    document.addEventListener("submit", (event) => void handleMissionSubmit(event, shell, state));
    if (shell.accountPanelOpen) void loadWeeklyMissions(shell, state);
}

async function loadWeeklyMissions(shell, state, force = false) {
    if (state.loading || (state.loaded && !force) || !shell.client || !shell.profile?.id) return;
    state.loading = true;
    state.message = "";
    shell.refreshAccountPanel();
    try {
        const playerId = String(shell.profile.minecraft_player_id || "").trim();
        const [missionsResult, corePayload, weaponsPayload, mapsPayload] = await Promise.all([
            ensureWeeklyMissions(shell.client),
            playerId ? shell.loadStatsSlice(`profile:${playerId}`) : Promise.resolve(null),
            playerId ? shell.loadStatsSlice(`profile:${playerId}:weapons`) : Promise.resolve(null),
            playerId ? shell.loadStatsSlice(`profile:${playerId}:maps`) : Promise.resolve(null)
        ]);
        if (missionsResult.error) throw missionsResult.error;
        state.row = normalizeMissionRow(missionsResult.data);
        state.statsProfile = mergeStatsProfile(
            findStatsProfile(corePayload, playerId),
            findStatsProfile(weaponsPayload, playerId),
            findStatsProfile(mapsPayload, playerId)
        );
        state.loaded = true;
    } catch (error) {
        console.warn("Could not load weekly missions on the homepage", error);
        state.message = "Weekly missions could not be loaded right now.";
    } finally {
        state.loading = false;
        shell.refreshAccountPanel();
    }
}

async function handleMissionClick(event, shell, state) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const claim = target.closest("[data-home-weekly-claim]");
    if (claim) {
        event.preventDefault();
        await claimMission(shell, state, claim.dataset.homeWeeklyClaim || "");
        return;
    }
    const swap = target.closest("[data-home-weekly-swap]");
    if (swap) {
        event.preventDefault();
        state.swapId = swap.dataset.homeWeeklySwap || "";
        renderSwapDialog(state);
        return;
    }
    if (target.closest("[data-home-weekly-swap-close]") || target.matches("[data-home-weekly-swap-backdrop]")) {
        event.preventDefault();
        if (!state.busyId) {
            state.swapId = "";
            renderSwapDialog(state);
        }
    }
}

async function handleMissionSubmit(event, shell, state) {
    if (!event.target.matches("[data-home-weekly-swap-form]")) return;
    event.preventDefault();
    const missionId = state.swapId;
    if (!missionId || state.busyId) return;
    state.busyId = missionId;
    renderSwapDialog(state);
    try {
        const result = await swapWeeklyMission(shell.client, missionId);
        if (result.error) throw result.error;
        state.row = normalizeMissionRow(result.data);
        state.swapId = "";
        state.message = "Mission swapped. The replacement starts from your current statistics.";
    } catch (error) {
        console.warn("Could not swap the weekly mission", error);
        state.message = "That mission could not be swapped.";
    } finally {
        state.busyId = "";
        renderSwapDialog(state);
        shell.refreshAccountPanel();
    }
}

async function claimMission(shell, state, missionId) {
    if (!missionId || state.busyId) return;
    const mission = state.row?.missions.find((entry) => entry.id === missionId);
    const claimed = new Set(state.row?.claimed_ids || []);
    if (!mission || claimed.has(missionId) || !weeklyMissionProgress(state.statsProfile, mission).complete) return;
    state.busyId = missionId;
    shell.refreshAccountPanel();
    try {
        const result = await claimWeeklyMissionReward(shell.client, missionId);
        if (result.error) throw result.error;
        state.row.claimed_ids = stringArray(result.data?.claimed_ids || [...claimed, missionId]);
        if (Number.isFinite(Number(result.data?.xp)))
            shell.setProfile({ ...shell.profile, xp: number(result.data.xp) });
        state.rewardingId = missionId;
        state.message = "";
        window.setTimeout(() => {
            if (state.rewardingId !== missionId) return;
            state.rewardingId = "";
            shell.refreshAccountPanel();
        }, 1400);
    } catch (error) {
        console.warn("Could not claim the weekly mission", error);
        state.message = "That mission could not be claimed.";
    } finally {
        state.busyId = "";
        shell.refreshAccountPanel();
    }
}

function renderWeeklyMissions(state) {
    if (state.loading && !state.row) return missionState("Preparing weekly rotation...");
    const missions = state.row?.missions || [];
    if (!missions.length) {
        return missionState(
            state.message || (state.loaded ? "Weekly rotation unavailable" : "Open this panel to load missions.")
        );
    }
    const claimed = new Set(state.row.claimed_ids);
    const completed = missions.filter((mission) => weeklyMissionProgress(state.statsProfile, mission).complete).length;
    const resetDate = state.row.cycle_ends_at ? formatDate(state.row.cycle_ends_at, { month: "long" }) : "next Monday";
    return `<section class="profile-drawer-missions weekly-missions-panel">
        <div class="mission-head"><div><p class="panel-kicker">Renewable Missions</p><h3>Weekly rotation</h3><span>Resets ${escapeHtml(resetDate)}</span></div><strong>${completed} / ${missions.length}</strong></div>
        <div class="weekly-mission-summary"><span><b>${missions.filter((mission) => mission.difficulty === "easy").length}</b> easy</span><span><b>${missions.filter((mission) => mission.difficulty === "hard").length}</b> hard</span><span><b>${formatNumber(missions.reduce((total, mission) => total + number(mission.xp), 0))}</b> XP available</span></div>
        ${state.statsProfile ? "" : '<p class="weekly-mission-link-note">Link Minecraft to begin tracking mission progress.</p>'}
        <p class="weekly-mission-rule">Untouched missions rotate every week. Started missions carry over and can be swapped once after the rotation.</p>
        <div class="mission-list">${missions.map((mission) => renderMission(mission, state, claimed)).join("")}</div>
        ${state.message ? `<p class="mode-empty">${escapeHtml(state.message)}</p>` : ""}
    </section>`;
}

function missionState(message) {
    return `<section class="profile-drawer-missions"><div class="mission-head"><div><p class="panel-kicker">Renewable Missions</p><h3>${escapeHtml(message)}</h3></div></div></section>`;
}

function renderMission(mission, state, claimedIds) {
    const progress = weeklyMissionProgress(state.statsProfile, mission);
    const claimed = claimedIds.has(mission.id);
    const busy = state.busyId === mission.id;
    const rewarding = state.rewardingId === mission.id;
    const canSwap = Boolean(mission.carried) && !mission.swapUsed && !claimed;
    const action = claimed
        ? '<span class="mission-xp claimed">Claimed</span>'
        : progress.complete
          ? `<button class="mission-claim-button" type="button" data-home-weekly-claim="${escapeHtml(mission.id)}" ${busy ? "disabled" : ""}>${busy ? "Claiming..." : `Claim ${formatNumber(mission.xp)} XP`}</button>`
          : canSwap
            ? `<button class="mission-swap-button" type="button" data-home-weekly-swap="${escapeHtml(mission.id)}">Swap</button>`
            : `<span class="mission-xp">+${formatNumber(mission.xp)} XP</span>`;
    return `<article class="mission-row weekly-mission-row ${progress.complete ? "complete" : ""} ${mission.carried ? "carried" : ""} ${rewarding ? "rewarding" : ""}">
        <div><span class="mission-difficulty ${escapeHtml(mission.difficulty)}">${escapeHtml(mission.difficulty)}</span><strong>${escapeHtml(mission.label)}</strong><span>${escapeHtml(mission.description)}</span>${mission.carried ? '<small class="mission-carried-note">Carried over - progress preserved</small>' : ""}</div>
        <div class="mission-progress"><i style="width: ${Math.min(100, Math.round(progress.progress * 100))}%"></i></div><small>${escapeHtml(progress.status)}</small>
        <div class="mission-actions">${action}${rewarding ? `<span class="mission-claim-burst">+${formatNumber(mission.xp)} XP</span>` : ""}</div>
    </article>`;
}

function renderSwapDialog(state) {
    let host = document.getElementById("home-weekly-mission-dialog-host");
    if (!host) {
        host = document.createElement("div");
        host.id = "home-weekly-mission-dialog-host";
        document.body.appendChild(host);
    }
    const mission = state.row?.missions.find((entry) => entry.id === state.swapId);
    if (!mission) {
        host.innerHTML = "";
        return;
    }
    host.innerHTML = `<div class="account-upload-backdrop" data-home-weekly-swap-backdrop><form class="account-upload-dialog weekly-swap-dialog" data-home-weekly-swap-form><div class="date-card-topline"><p class="panel-kicker">Swap Mission</p><button type="button" class="modal-icon-button" data-home-weekly-swap-close aria-label="Close swap confirmation">x</button></div><h3>Replace ${escapeHtml(mission.label)}?</h3><p>Your current progress will be discarded. The replacement has the same difficulty and starts from your current statistics. This slot can only be swapped once.</p><div class="date-admin-actions modal-actions"><button type="button" data-home-weekly-swap-close ${state.busyId ? "disabled" : ""}>Cancel</button><button type="submit" ${state.busyId ? "disabled" : ""}>${state.busyId ? "Swapping..." : "Swap mission"}</button></div></form></div>`;
}

function normalizeMissionRow(row) {
    return {
        ...row,
        missions: (Array.isArray(row?.missions) ? row.missions : []).slice(0, MISSION_LIMIT),
        claimed_ids: stringArray(row?.claimed_ids)
    };
}

function findStatsProfile(payload, playerId) {
    if (!payload || !playerId) return null;
    if (payload.playerId === playerId) return payload;
    if (payload.profile?.playerId === playerId) return payload.profile;
    return (
        (Array.isArray(payload.profiles) ? payload.profiles : []).find((profile) => profile.playerId === playerId) ||
        null
    );
}

function mergeStatsProfile(core, weapons, maps) {
    if (!core) return weapons || maps || null;
    return {
        ...core,
        battleRoyale: mergeModeDetails(core.battleRoyale, weapons?.battleRoyale),
        deathmatch: mergeModeDetails(mergeModeDetails(core.deathmatch, weapons?.deathmatch), maps?.deathmatch)
    };
}

function mergeModeDetails(base, addition) {
    if (!base) return addition || null;
    if (!addition) return base;
    return {
        ...base,
        ...addition,
        stats: { ...(base.stats || {}), ...(addition.stats || {}) },
        details: { ...(base.details || {}), ...(addition.details || {}) }
    };
}

export function weeklyMissionProgress(profile, mission) {
    const requirement = normalizeRequirements(mission?.requirements);
    if (requirement.type === "all") {
        const baselines = Array.isArray(mission?.baseline?.values) ? mission.baseline.values : [];
        const parts = requirement.components.map((component, index) => {
            const value = Math.max(0, missionMetric(profile, { ...mission, ...component }) - number(baselines[index]));
            return { ...component, value };
        });
        return {
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
            complete: value >= target,
            progress: value / target,
            status: `${formatNumber(value)} / ${formatNumber(target)}`
        };
    }
    const current = requirementValue(profile, mission, requirement);
    const value = Math.max(0, current - number(mission.baseline));
    const target = Math.max(1, number(mission.target));
    return {
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
        return { type: "all", components: Array.isArray(source.components) ? source.components : [] };
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
        (entry) => entry.id && weaponCategory(entry) !== "utility"
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
    if (mode === "battleRoyale") return profile?.battleRoyale || null;
    if (mode === "deathmatch") return profile?.deathmatch || null;
    return { stats: combineStats(profile?.battleRoyale?.stats, profile?.deathmatch?.stats) };
}

function weaponEntries(profile, mode) {
    if (!profile) return [];
    if (mode === "battleRoyale") return profile.battleRoyale?.details?.weapons || [];
    if (mode === "deathmatch") return profile.deathmatch?.details?.weapons || [];
    const merged = new Map();
    for (const weapon of [
        ...(profile.battleRoyale?.details?.weapons || []),
        ...(profile.deathmatch?.details?.weapons || [])
    ]) {
        const id = String(weapon?.id || weapon?.label || "");
        if (!id) continue;
        const current = merged.get(id) || { ...weapon, id, stats: normalizeStats(null) };
        current.stats = combineStats(current.stats, weapon.stats);
        merged.set(id, current);
    }
    return [...merged.values()];
}

function mapEntries(profile) {
    return Array.isArray(profile?.deathmatch?.details?.deathmatchMaps) ? profile.deathmatch.details.deathmatchMaps : [];
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
        "vehicleKills"
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
            if (key !== "weeklyCounters") total[key] += number(stats[key]);
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

function stringArray(value) {
    return Array.isArray(value) ? value.map((entry) => String(entry || "").trim()).filter(Boolean) : [];
}
