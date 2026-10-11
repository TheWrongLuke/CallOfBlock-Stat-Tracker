// Skull/crosshair geometry: Lucide (ISC/MIT), see assets/icons/replay/LICENSE.txt.
const SKULL =
    '<path d="m12.5 17-.5-1-.5 1h1z"/><path d="M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="12" r="1"/>';
const CROSSHAIR = '<circle cx="12" cy="12" r="10"/><path d="M22 12h-4M6 12H2M12 6V2M12 22v-4"/>';
const FLAG =
    '<path d="M4 22V3h16v12H4"/><path fill="currentColor" stroke="none" d="M4 3h4v4H4zm8 0h4v4h-4zM8 7h4v4H8zm8 0h4v4h-4zM4 11h4v4H4zm8 0h4v4h-4z"/>';
const ZONE =
    '<circle cx="12" cy="12" r="11"/><circle cx="12" cy="12" r="2.5"/><path d="M12 3v4m-2-2 2 2 2-2M12 21v-4m-2 2 2-2 2 2M3 12h4m-2-2 2 2-2 2M21 12h-4m2-2-2 2 2 2"/>';
const END_TYPES = new Set(["round_end", "round_draw", "match_end", "duel_match_end", "zombie_survival_match_end"]);
const KILL_TYPES = new Set(["elimination", "player_eliminated", "player_death"]);

export function buildReplayEventDecorations(telemetry) {
    const decorations = new Map();
    const kills = new Map();
    let latestKill = null;
    let lastRoundKill = null;
    for (const event of telemetry.events || []) {
        const kind = KILL_TYPES.has(event.type)
            ? "kill"
            : END_TYPES.has(event.type)
              ? "finish"
              : event.type === "zone_phase_changed"
                ? "zone"
                : ["damage", "engagement_start", "zombie_damage"].includes(event.type)
                  ? "hit"
                  : "moment";
        decorations.set(event.eventId, {
            kind,
            label:
                event.type === "player_death"
                    ? "Death"
                    : event.headshot && kind === "kill"
                      ? "Headshot kill"
                      : kind === "kill"
                        ? "Kill"
                        : "",
            ends: []
        });
        if (KILL_TYPES.has(event.type) && event.killerId && event.victimId && event.killerId !== event.victimId) {
            latestKill = event;
            kills.set(event.eventId, event);
        } else if (KILL_TYPES.has(event.type)) {
            latestKill = null;
        }
        if (["round_start", "round_preparation"].includes(event.type)) {
            latestKill = null;
            lastRoundKill = null;
        }
        if (!END_TYPES.has(event.type) || event.type === "round_draw") continue;
        // Never turn a timeout, disconnect or environmental death into a credited final kill.
        const explicitKill = kills.get(event.eliminationEventId);
        const adjacentKill =
            /^(team eliminated|final kill|kill target reached)$/i.test(event.reason || "") &&
            latestKill &&
            event.timeMs >= latestKill.timeMs &&
            event.timeMs - latestKill.timeMs <= 250
                ? latestKill
                : null;
        const kill = explicitKill || adjacentKill || (event.type === "duel_match_end" ? lastRoundKill : null);
        if (!kill) {
            if (event.type === "round_end") lastRoundKill = null;
            continue;
        }
        const ending = event.type === "round_end" ? "Round complete" : "Match complete";
        const decoration = decorations.get(kill.eventId);
        decoration.ends.push(ending);
        decoration.label = `${kill.headshot ? "Final headshot kill" : "Final kill"} - ${decoration.ends.includes("Match complete") ? "Match complete" : "Round complete"}`;
        decorations.get(event.eventId).mergedInto = kill.eventId;
        if (event.type === "round_end") lastRoundKill = kill;
    }
    return decorations;
}

export function renderReplayEventIcon(event, decoration = {}) {
    const kind = decoration.kind || "moment";
    const headshot = kind === "kill" && event.headshot === true;
    const contents =
        kind === "kill"
            ? `${SKULL}${headshot ? '<circle class="replay-headshot-dot" cx="12" cy="6" r="2" stroke="none"/>' : ""}`
            : kind === "finish"
              ? FLAG
              : kind === "zone"
                ? ZONE
                : kind === "hit"
                  ? CROSSHAIR
                  : '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/>';
    const endMarker = decoration.ends?.length ? `<span class="replay-final-flag">${svg(FLAG)}</span>` : "";
    return `<span class="replay-event-icon replay-event-icon-${kind}" aria-hidden="true">${svg(contents)}${endMarker}</span>`;
}

export function replayKda(result) {
    const values = [result?.kills, result?.deaths, result?.assists];
    if (!values.every((value) => Number.isFinite(value) && value >= 0)) return null;
    return (result.kills + result.assists) / Math.max(1, result.deaths);
}

export function groupReplayTimelineEvents(events, durationMs, width, decorations) {
    const slots = Math.max(1, Math.floor(Math.max(1, width) / 32));
    const groups = new Map();
    const priorities = { kill: 5, finish: 4, zone: 3, hit: 2, moment: 1 };
    for (const event of events) {
        const decoration = decorations.get(event.eventId);
        if (decoration?.mergedInto) continue;
        const slot = Math.min(slots - 1, Math.max(0, Math.floor((event.timeMs / Math.max(1, durationMs)) * slots)));
        if (!groups.has(slot)) groups.set(slot, { left: ((slot + 0.5) / slots) * 100, events: [] });
        groups.get(slot).events.push(event);
    }
    for (const group of groups.values()) {
        group.events.sort((a, b) => {
            const priority = (event) =>
                decorations.get(event.eventId)?.ends.length ? 6 : priorities[decorations.get(event.eventId)?.kind] || 0;
            return priority(b) - priority(a) || a.timeMs - b.timeMs;
        });
    }
    return [...groups.values()];
}

function svg(contents) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false">${contents}</svg>`;
}
