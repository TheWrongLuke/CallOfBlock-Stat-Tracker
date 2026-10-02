import { claimWeeklyMissionReward, ensureWeeklyMissions, swapWeeklyMission } from "../api/weekly-missions.js";
import { weeklyMissionProgress } from "../core/weekly-mission-progress.js";
import { renderWeeklyMissionPanel } from "../core/weekly-mission-view.js";
export { weeklyMissionProgress } from "../core/weekly-mission-progress.js";
import { escapeHtml, number } from "../core/site-shell.js";
import { applyNetworkAccountProjection } from "../core/network-profile.js";

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

    shell.setAccountPanelAddon(() =>
        renderWeeklyMissionPanel({
            ...state,
            actionsEnabled: !shell.profile?.banned_from_voting,
            actionPrefix: "home-weekly"
        })
    );
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

async function loadWeeklyMissions(shell, state, force = false) {
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
    state.message = "";
    shell.refreshAccountPanel();
    try {
        const playerId = String(shell.profile.minecraft_player_id || "").trim();
        const missionsResult = await ensureWeeklyMissions(shell.client);
        if (generation !== state.generation || state.identity !== accountIdentity(shell)) return;
        if (missionsResult.error) throw missionsResult.error;
        applyMissionAccountProfile(shell, state, missionsResult.data);
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

export function applyMissionAccountProfile(shell, state, row) {
    if (row?.environment !== "TEST" || row.user_id !== shell.profile?.id) return;
    const profile = { ...applyNetworkAccountProjection(shell.profile, row), network_stats_unavailable: false };
    // UUID adoption on the first successful read must not invalidate this same account's
    // in-flight mission request. A different authenticated account is never accepted here.
    state.identity = accountIdentity({ ...shell, profile });
    shell.setProfile(profile);
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
        if (result.data?.environment === "TEST") applyMissionAccountProfile(shell, state, result.data);
        else if (Number.isFinite(Number(result.data?.xp)))
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

function stringArray(value) {
    return Array.isArray(value) ? value.map((entry) => String(entry || "").trim()).filter(Boolean) : [];
}
