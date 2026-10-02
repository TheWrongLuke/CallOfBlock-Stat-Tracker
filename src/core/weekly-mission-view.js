import { weeklyMissionProgress } from "./weekly-mission-progress.js";
import { escapeHtml } from "../utils/sanitization.js";

const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const formatNumber = (value) => number(value).toLocaleString();

export function renderWeeklyMissionPanel({
    row,
    statsProfile,
    loading = false,
    loaded = false,
    message = "",
    busyId = "",
    rewardingId = "",
    actionsEnabled = true,
    actionPrefix = "weekly"
} = {}) {
    if (!["weekly", "home-weekly"].includes(actionPrefix)) throw new Error("Unknown mission action binding");
    const missions = Array.isArray(row?.missions) ? row.missions : [];
    if (!missions.length) {
        const heading = loading ? "Preparing weekly rotation..." : "Weekly rotation unavailable";
        const detail =
            message ||
            (loading
                ? ""
                : loaded
                  ? "No missions are available in this rotation."
                  : "Open this panel to load missions.");
        return `<section class="profile-drawer-missions"><div class="mission-head"><div><p class="panel-kicker">Renewable Missions</p><h3>${heading}</h3></div></div>${detail ? `<p class="mode-empty">${escapeHtml(detail)}</p>` : ""}</section>`;
    }
    const claimed = new Set(row.claimed_ids || []);
    const completed = statsProfile
        ? missions.filter((mission) => weeklyMissionProgress(statsProfile, mission).complete).length
        : "-";
    const reset = new Date(row.cycle_ends_at || "");
    const resetLabel = Number.isFinite(reset.getTime())
        ? reset.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })
        : "next Monday";
    return `<section class="profile-drawer-missions weekly-missions-panel">
        <div class="mission-head"><div><p class="panel-kicker">Renewable Missions</p><h3>Weekly rotation</h3><span>Resets ${escapeHtml(resetLabel)}</span></div><strong>${completed} / ${missions.length}</strong></div>
        <div class="weekly-mission-summary"><span><b>${missions.filter((mission) => mission.difficulty === "easy").length}</b> easy</span><span><b>${missions.filter((mission) => mission.difficulty === "hard").length}</b> hard</span><span><b>${formatNumber(missions.reduce((sum, mission) => sum + number(mission.xp), 0))}</b> XP available</span></div>
        <p class="weekly-mission-rule">Untouched missions rotate every week. Started missions carry over and can be swapped once after the rotation.</p>
        <div class="mission-list">${missions.map((mission) => renderMission(mission, { statsProfile, claimed, busyId, rewardingId, actionsEnabled, actionPrefix })).join("")}</div>
        ${message ? `<p class="mode-empty">${escapeHtml(message)}</p>` : ""}
    </section>`;
}

function renderMission(mission, { statsProfile, claimed, busyId, rewardingId, actionsEnabled, actionPrefix }) {
    const progress = statsProfile
        ? weeklyMissionProgress(statsProfile, mission)
        : { complete: false, status: "Progress unavailable" };
    const isClaimed = claimed.has(mission.id),
        busy = busyId === mission.id,
        rewarding = rewardingId === mission.id;
    const canSwap = Boolean(statsProfile && mission.carried && !mission.swapUsed && !isClaimed);
    const disabled = !actionsEnabled || busy ? "disabled" : "";
    const action = isClaimed
        ? '<span class="mission-xp claimed">Claimed</span>'
        : progress.complete
          ? `<button class="mission-claim-button" type="button" data-${actionPrefix}-claim="${escapeHtml(mission.id)}" ${disabled}>${busy ? "Claiming..." : `Claim ${formatNumber(mission.xp)} XP`}</button>`
          : canSwap
            ? `<button class="mission-swap-button" type="button" data-${actionPrefix}-swap="${escapeHtml(mission.id)}" ${disabled}>Swap</button>`
            : `<span class="mission-xp">+${formatNumber(mission.xp)} XP</span>`;
    const width = Math.min(100, Math.max(0, Math.round(number(progress.progress) * 100)));
    return `<article class="mission-row weekly-mission-row ${progress.complete ? "complete" : ""} ${mission.carried ? "carried" : ""} ${rewarding ? "rewarding" : ""}">
        <div><span class="mission-difficulty ${escapeHtml(mission.difficulty)}">${escapeHtml(mission.difficulty)}</span><strong>${escapeHtml(mission.label)}</strong><span>${escapeHtml(mission.description)}</span>${mission.carried ? '<small class="mission-carried-note">Carried over - progress preserved</small>' : ""}</div>
        ${statsProfile ? `<div class="mission-progress"><i style="width: ${width}%"></i></div>` : ""}<small>${escapeHtml(progress.status)}</small>
        <div class="mission-actions">${action}${rewarding ? `<span class="mission-claim-burst">+${formatNumber(mission.xp)} XP</span>` : ""}</div>
    </article>`;
}
