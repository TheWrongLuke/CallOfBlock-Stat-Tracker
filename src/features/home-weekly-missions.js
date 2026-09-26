import { claimWeeklyMissionReward, ensureWeeklyMissions, swapWeeklyMission } from "../api/weekly-missions.js";
import { weeklyMissionProgress } from "../core/weekly-mission-progress.js";
export { weeklyMissionProgress } from "../core/weekly-mission-progress.js";
import { escapeHtml, formatDate, number } from "../core/site-shell.js";

const MISSION_LIMIT = 7;
const initializedShells = new WeakSet();

export function initializeHomeWeeklyMissions(shell) {
    if (!shell || initializedShells.has(shell)) return;
    initializedShells.add(shell);
    const state = {
        row: null,
        statsProfile: null,
        loading: false,
        loaded: false,
        busyId: "",
        rewardingId: "",
        swapId: "",
        message: "",
        identity: "",
        generation: 0,
        loadedAt: 0
    };

    shell.setAccountPanelAddon(() => renderWeeklyMissions(state));
    document.addEventListener("cob:account-panel-open", () => void loadWeeklyMissions(shell, state));
    document.addEventListener("click", (event) => void handleMissionClick(event, shell, state));
    document.addEventListener("submit", (event) => void handleMissionSubmit(event, shell, state));
    window.addEventListener("cob:account-profile-updated", () => {
        resetIdentity(shell, state);
        shell.refreshAccountPanel();
        if (shell.accountPanelOpen) void loadWeeklyMissions(shell, state);
    });
    window.addEventListener("focus", () => {
        if (shell.accountPanelOpen) void loadWeeklyMissions(shell, state, true);
    });
    window.setInterval(() => {
        if (!document.hidden && shell.accountPanelOpen) void loadWeeklyMissions(shell, state, true);
    }, 30_000);
    if (shell.accountPanelOpen) void loadWeeklyMissions(shell, state);
}

async function loadWeeklyMissions(shell, state, force = true) {
    resetIdentity(shell, state);
    if (
        state.loading ||
        (state.loaded && Date.now() - state.loadedAt < 30_000 && !force) ||
        !shell.client ||
        !shell.profile?.id
    )
        return;
    const generation = state.generation;
    state.loading = true;
    state.statsProfile = null;
    state.message = "";
    shell.refreshAccountPanel();
    try {
        const playerId = String(shell.profile.minecraft_player_id || "").trim();
        const missionsResult = await ensureWeeklyMissions(shell.client);
        if (generation !== state.generation || state.identity !== accountIdentity(shell)) return;
        if (missionsResult.error) throw missionsResult.error;
        state.row = normalizeMissionRow(missionsResult.data);
        state.statsProfile = missionsResult.data?.stats_profile || null;
        state.loaded = Boolean(state.statsProfile) || !playerId;
        state.loadedAt = Date.now();
        if (!state.statsProfile)
            state.message = playerId
                ? "Mission statistics are unavailable. Reopen the panel to retry."
                : "Link Minecraft to begin tracking mission progress.";
    } catch (error) {
        if (generation !== state.generation) return;
        console.warn("Could not load weekly missions", error);
        state.message = "Weekly missions could not be loaded right now.";
    } finally {
        if (generation === state.generation) {
            state.loading = false;
            shell.refreshAccountPanel();
        }
    }
}

function accountIdentity(shell) {
    return [shell.profile?.id, shell.profile?.minecraft_player_id, shell.profile?.minecraft_player_name].join(":");
}

function resetIdentity(shell, state) {
    const identity = accountIdentity(shell);
    if (state.identity === identity) return;
    Object.assign(state, {
        identity,
        generation: state.generation + 1,
        row: null,
        statsProfile: null,
        loaded: false,
        loading: false,
        loadedAt: 0,
        busyId: "",
        swapId: "",
        rewardingId: "",
        message: ""
    });
    document.getElementById("home-weekly-mission-dialog-host")?.replaceChildren();
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
    const generation = state.generation;
    state.busyId = missionId;
    renderSwapDialog(state);
    try {
        const result = await swapWeeklyMission(shell.client, missionId);
        if (generation !== state.generation) return;
        if (result.error) throw result.error;
        state.row = normalizeMissionRow(result.data);
        state.swapId = "";
        state.message = "Mission swapped. The replacement starts from your current statistics.";
    } catch (error) {
        if (generation !== state.generation) return;
        console.warn("Could not swap the weekly mission", error);
        state.message = "That mission could not be swapped.";
    } finally {
        if (generation === state.generation) {
            state.busyId = "";
            renderSwapDialog(state);
            await loadWeeklyMissions(shell, state, true);
        }
    }
}

async function claimMission(shell, state, missionId) {
    if (!missionId || state.busyId || !state.statsProfile) return;
    const generation = state.generation;
    const mission = state.row?.missions.find((entry) => entry.id === missionId);
    const claimed = new Set(state.row?.claimed_ids || []);
    if (!mission || claimed.has(missionId) || !weeklyMissionProgress(state.statsProfile, mission).complete) return;
    state.busyId = missionId;
    shell.refreshAccountPanel();
    try {
        const result = await claimWeeklyMissionReward(shell.client, missionId);
        if (generation !== state.generation) return;
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
        if (generation !== state.generation) return;
        console.warn("Could not claim the weekly mission", error);
        state.message = "That mission could not be claimed.";
    } finally {
        if (generation === state.generation) {
            state.busyId = "";
            await loadWeeklyMissions(shell, state, true);
        }
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
    const completed = state.statsProfile
        ? missions.filter((mission) => weeklyMissionProgress(state.statsProfile, mission).complete).length
        : "-";
    const resetDate = state.row.cycle_ends_at ? formatDate(state.row.cycle_ends_at, { month: "long" }) : "next Monday";
    return `<section class="profile-drawer-missions weekly-missions-panel">
        <div class="mission-head"><div><p class="panel-kicker">Renewable Missions</p><h3>Weekly rotation</h3><span>Resets ${escapeHtml(resetDate)}</span></div><strong>${completed} / ${missions.length}</strong></div>
        <div class="weekly-mission-summary"><span><b>${missions.filter((mission) => mission.difficulty === "easy").length}</b> easy</span><span><b>${missions.filter((mission) => mission.difficulty === "hard").length}</b> hard</span><span><b>${formatNumber(missions.reduce((total, mission) => total + number(mission.xp), 0))}</b> XP available</span></div>
        <p class="weekly-mission-rule">Untouched missions rotate every week. Started missions carry over and can be swapped once after the rotation.</p>
        <div class="mission-list">${missions.map((mission) => renderMission(mission, state, claimed)).join("")}</div>
        ${state.message ? `<p class="mode-empty">${escapeHtml(state.message)}</p>` : ""}
    </section>`;
}

function missionState(message) {
    return `<section class="profile-drawer-missions"><div class="mission-head"><div><p class="panel-kicker">Renewable Missions</p><h3>${escapeHtml(message)}</h3></div></div></section>`;
}

function renderMission(mission, state, claimedIds) {
    const progress = state.statsProfile
        ? weeklyMissionProgress(state.statsProfile, mission)
        : { complete: false, status: "Progress unavailable" };
    const claimed = claimedIds.has(mission.id);
    const busy = state.busyId === mission.id;
    const rewarding = state.rewardingId === mission.id;
    const canSwap = Boolean(state.statsProfile && mission.carried) && !mission.swapUsed && !claimed;
    const action = claimed
        ? '<span class="mission-xp claimed">Claimed</span>'
        : progress.complete
          ? `<button class="mission-claim-button" type="button" data-home-weekly-claim="${escapeHtml(mission.id)}" ${busy ? "disabled" : ""}>${busy ? "Claiming..." : `Claim ${formatNumber(mission.xp)} XP`}</button>`
          : canSwap
            ? `<button class="mission-swap-button" type="button" data-home-weekly-swap="${escapeHtml(mission.id)}">Swap</button>`
            : `<span class="mission-xp">+${formatNumber(mission.xp)} XP</span>`;
    return `<article class="mission-row weekly-mission-row ${progress.complete ? "complete" : ""} ${mission.carried ? "carried" : ""} ${rewarding ? "rewarding" : ""}">
        <div><span class="mission-difficulty ${escapeHtml(mission.difficulty)}">${escapeHtml(mission.difficulty)}</span><strong>${escapeHtml(mission.label)}</strong><span>${escapeHtml(mission.description)}</span>${mission.carried ? '<small class="mission-carried-note">Carried over - progress preserved</small>' : ""}</div>
        ${state.statsProfile ? `<div class="mission-progress"><i style="width: ${Math.min(100, Math.round(progress.progress * 100))}%"></i></div>` : ""}<small>${escapeHtml(progress.status)}</small>
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

function formatNumber(value) {
    return Number(value || 0)
        .toFixed(2)
        .replace(/\.00$/, "");
}

function stringArray(value) {
    return Array.isArray(value) ? value.map((entry) => String(entry || "").trim()).filter(Boolean) : [];
}
