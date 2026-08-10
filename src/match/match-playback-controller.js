const FRAME_INTERVAL_MS = 32;
const MAX_FRAME_DELTA_MS = 250;
const ISOLATED_EVENT_WINDOW_MS = 2000;
const COMBAT_LINE_DURATION_MS = 1000;
export const INTERESTING_EVENT_PRE_ROLL_MS = 20_000;

const DEFAULT_FILTERS = Object.freeze({
    engagements: true,
    eliminations: true,
    vehicles: true,
    zone: true,
    streaks: true,
    respawns: true
});

export class MatchPlaybackController {
    constructor(telemetry, onChange = () => {}, options = {}) {
        this.telemetry = telemetry;
        this.onChange = onChange;
        this.skipIdle = options.skipIdle === true;
        this.speed = [0.5, 1, 2].includes(Number(options.speed)) ? Number(options.speed) : 1;
        this.filters = {
            ...DEFAULT_FILTERS,
            ...Object.fromEntries(Object.keys(DEFAULT_FILTERS).map((key) => [key, options.filters?.[key] !== false]))
        };
        this.playing = false;
        this.timer = 0;
        this.timerType = "";
        this.lastFrameAt = 0;
        this.sequence = [];
        this.sequenceIndex = 0;
        this.sequenceSnapshotIndex = 0;
        this.currentSnapshotIndex = 0;
        this.currentEventId = "";
        this.eventById = new Map(telemetry.events.map((event) => [event.eventId, event]));
        this.playheadMs = telemetry.snapshots[0]?.timeMs || 0;
        this.rebuildSequence(0);
    }

    snapshot() {
        const snapshot = interpolateSnapshotAtTime(this.telemetry.snapshots, this.playheadMs);
        if (!snapshot) return null;
        return {
            ...snapshot,
            zombies: interpolateZombieStatesAtTime(this.telemetry.zombieSnapshots || [], this.playheadMs)
        };
    }

    currentEvents(snapshot = this.snapshot()) {
        if (!snapshot) return [];
        const tolerance = this.skipIdle ? 1100 : 250;
        const events = eventsWithinTime(
            this.telemetry.events,
            snapshot.timeMs - tolerance,
            snapshot.timeMs + tolerance
        ).filter((event) => eventVisible(event, this.filters));
        const selectedCandidate = this.eventById.get(this.currentEventId);
        const selected = selectedCandidate && eventVisible(selectedCandidate, this.filters) ? selectedCandidate : null;
        if (selected && !events.some((event) => event.eventId === selected.eventId)) events.push(selected);
        return events.sort((a, b) => a.timeMs - b.timeMs);
    }

    currentCombatEvents() {
        return eventsWithinTime(
            this.telemetry.events,
            this.playheadMs - COMBAT_LINE_DURATION_MS + 1,
            this.playheadMs
        ).filter(
            (event) =>
                ["damage", "elimination", "zombie_damage"].includes(event.type) && eventVisible(event, this.filters)
        );
    }

    currentMoment() {
        return this.sequence[this.sequenceIndex] || null;
    }

    state() {
        const snapshot = this.snapshot();
        const moment = this.currentMoment();
        const combatEvents = this.currentCombatEvents();
        return {
            playing: this.playing,
            skipIdle: this.skipIdle,
            speed: this.speed,
            filters: { ...this.filters },
            snapshot,
            snapshotIndex: this.currentSnapshotIndex,
            snapshotCount: this.telemetry.snapshots.length,
            events: this.currentEvents(snapshot),
            combatEvents,
            combatEvent: combatEvents.at(-1) || null,
            currentEventId: this.currentEventId,
            moment,
            momentIndex: this.skipIdle ? this.sequenceIndex : null,
            momentCount: this.skipIdle ? this.sequence.length : null,
            statusLabel: this.skipIdle
                ? `Moment ${Math.min(this.sequenceIndex + 1, this.sequence.length)} of ${this.sequence.length}`
                : `Snapshot ${Math.min(this.currentSnapshotIndex + 1, this.telemetry.snapshots.length)} of ${this.telemetry.snapshots.length}`
        };
    }

    togglePlay() {
        if (this.playing) this.pause();
        else this.play();
    }

    play() {
        if (this.playing || !this.snapshot()) return;
        this.playing = true;
        this.lastFrameAt = Date.now();
        this.emit();
        this.schedule();
    }

    pause() {
        this.playing = false;
        this.cancelTimer();
        this.emit();
    }

    previous() {
        this.stopTimer();
        if (this.skipIdle) {
            this.sequenceIndex = Math.max(0, this.sequenceIndex - 1);
            this.sequenceSnapshotIndex = 0;
            this.syncSnapshotFromSequence();
        } else {
            this.currentSnapshotIndex = Math.max(0, this.currentSnapshotIndex - 1);
            this.sequenceIndex = this.currentSnapshotIndex;
            this.playheadMs = this.telemetry.snapshots[this.currentSnapshotIndex]?.timeMs || 0;
        }
        this.currentEventId = "";
        this.emit();
    }

    next() {
        this.stopTimer();
        if (this.skipIdle) {
            this.sequenceIndex = Math.min(this.sequence.length - 1, this.sequenceIndex + 1);
            this.sequenceSnapshotIndex = 0;
            this.syncSnapshotFromSequence();
        } else {
            this.currentSnapshotIndex = Math.min(this.telemetry.snapshots.length - 1, this.currentSnapshotIndex + 1);
            this.sequenceIndex = this.currentSnapshotIndex;
            this.playheadMs = this.telemetry.snapshots[this.currentSnapshotIndex]?.timeMs || 0;
        }
        this.currentEventId = "";
        this.emit();
    }

    seek(timeMs, { preservePlayback = true } = {}) {
        const wasPlaying = this.playing;
        this.cancelTimer();
        if (!preservePlayback) this.playing = false;
        const target = Math.max(0, Math.min(this.telemetry.durationMs, Number(timeMs) || 0));
        this.playheadMs = target;
        this.syncIndicesFromTime(target);
        this.currentEventId = "";
        this.emit();
        if (wasPlaying && preservePlayback && this.playing) {
            this.lastFrameAt = Date.now();
            this.schedule();
        }
    }

    seekBy(deltaMs) {
        this.seek(this.playheadMs + Number(deltaMs || 0));
    }

    selectEvent(eventId) {
        const event = this.telemetry.events.find((candidate) => candidate.eventId === eventId);
        if (!event) return;
        this.cancelTimer();
        this.playing = false;
        const engagement = event.engagementId
            ? this.telemetry.engagements.find((candidate) => candidate.engagementId === event.engagementId)
            : null;
        const isCombatEvent = event.type === "damage" || event.type === "elimination";
        const eventStart =
            !isCombatEvent && this.skipIdle && this.filters.engagements && engagement?.qualifiesForSkipIdle
                ? engagement.startMs
                : event.timeMs;
        const target = Math.max(0, eventStart - INTERESTING_EVENT_PRE_ROLL_MS);
        this.seek(target, { preservePlayback: false });
        this.currentEventId = event.eventId;
        this.emit();
        this.play();
    }

    setSkipIdle(enabled) {
        const currentTime = this.playheadMs;
        const wasPlaying = this.playing;
        this.cancelTimer();
        this.skipIdle = Boolean(enabled);
        this.rebuildSequence(currentTime);
        this.emit();
        if (wasPlaying) {
            this.lastFrameAt = Date.now();
            this.schedule();
        }
    }

    setSpeed(speed) {
        const normalized = Number(speed);
        if (![0.5, 1, 2].includes(normalized)) return;
        this.speed = normalized;
        if (this.playing) this.lastFrameAt = Date.now();
        this.emit();
    }

    setFilter(filter, enabled) {
        if (!(filter in this.filters)) return;
        const currentTime = this.playheadMs;
        const wasPlaying = this.playing;
        this.cancelTimer();
        this.filters[filter] = Boolean(enabled);
        this.rebuildSequence(currentTime);
        this.emit();
        if (wasPlaying) {
            this.lastFrameAt = Date.now();
            this.schedule();
        }
    }

    destroy() {
        this.stopTimer();
        this.onChange = () => {};
    }

    rebuildSequence(currentTime) {
        this.sequence = this.skipIdle
            ? buildMeaningfulMoments(this.telemetry, this.filters)
            : this.telemetry.snapshots.map((snapshot, index) => ({
                  id: snapshot.snapshotId,
                  kind: "snapshot",
                  label: snapshot.reason === "periodic" ? "Snapshot" : eventLabel(snapshot.reason),
                  startMs: snapshot.timeMs,
                  endMs: snapshot.timeMs,
                  snapshotIndices: [index],
                  eventIds: this.telemetry.events
                      .filter((event) => event.snapshotId === snapshot.snapshotId)
                      .map((event) => event.eventId)
              }));
        if (this.sequence.length === 0 && this.telemetry.snapshots.length) {
            const index = nearestSnapshotIndex(this.telemetry.snapshots, currentTime);
            const snapshot = this.telemetry.snapshots[index];
            this.sequence = [
                {
                    id: snapshot.snapshotId,
                    kind: "snapshot",
                    label: "Snapshot",
                    startMs: snapshot.timeMs,
                    endMs: snapshot.timeMs,
                    snapshotIndices: [index],
                    eventIds: []
                }
            ];
        }
        this.sequenceIndex = nearestMomentIndex(this.sequence, currentTime);
        const indices = this.currentMoment()?.snapshotIndices || [];
        const insideMoment =
            this.currentMoment() &&
            currentTime >= this.currentMoment().startMs &&
            currentTime <= this.currentMoment().endMs;
        this.sequenceSnapshotIndex = nearestIndexWithin(
            indices,
            nearestSnapshotIndex(this.telemetry.snapshots, currentTime)
        );
        if (this.skipIdle && !insideMoment && indices.length) {
            this.currentSnapshotIndex = indices[this.sequenceSnapshotIndex];
            this.playheadMs = this.telemetry.snapshots[this.currentSnapshotIndex]?.timeMs || 0;
        } else {
            this.playheadMs = Math.max(0, Math.min(this.telemetry.durationMs, currentTime));
            this.syncIndicesFromTime(this.playheadMs);
        }
    }

    advancePlayback() {
        if (!this.playing) return;
        const now = Date.now();
        const elapsed = Math.max(0, now - this.lastFrameAt);
        if (elapsed < FRAME_INTERVAL_MS) {
            this.schedule();
            return;
        }
        this.lastFrameAt = now;
        this.advancePlayhead(Math.min(elapsed, MAX_FRAME_DELTA_MS) * this.speed);
        this.currentEventId = "";
        this.emit();
        if (this.playing) this.schedule();
    }

    advancePlayhead(elapsedMs) {
        let remaining = Math.max(0, elapsedMs);
        if (!this.skipIdle) {
            this.playheadMs = Math.min(this.telemetry.durationMs, this.playheadMs + remaining);
            if (this.playheadMs >= this.telemetry.durationMs) this.playing = false;
            this.syncIndicesFromTime(this.playheadMs);
            return;
        }

        while (remaining > 0 && this.playing) {
            const moment = this.currentMoment();
            if (!moment) {
                this.playing = false;
                break;
            }
            if (this.playheadMs < moment.startMs) this.playheadMs = moment.startMs;
            if (this.playheadMs > moment.endMs) {
                if (!this.moveToNextMoment()) break;
                continue;
            }
            const available = Math.max(0, moment.endMs - this.playheadMs);
            if (available >= remaining) {
                this.playheadMs += remaining;
                break;
            }
            this.playheadMs = moment.endMs;
            remaining -= available;
            if (!this.moveToNextMoment()) break;
        }
        this.syncIndicesFromTime(this.playheadMs, { preserveMoment: true });
    }

    moveToNextMoment() {
        let nextIndex = this.sequenceIndex + 1;
        while (nextIndex < this.sequence.length && this.sequence[nextIndex].endMs <= this.playheadMs) nextIndex++;
        if (nextIndex >= this.sequence.length) {
            this.playing = false;
            return false;
        }
        this.sequenceIndex = nextIndex;
        this.playheadMs = Math.max(this.playheadMs, this.currentMoment().startMs);
        return true;
    }

    syncSnapshotFromSequence() {
        const indices = this.currentMoment()?.snapshotIndices || [];
        if (!indices.length) return;
        this.sequenceSnapshotIndex = Math.max(0, Math.min(indices.length - 1, this.sequenceSnapshotIndex));
        this.currentSnapshotIndex = indices[this.sequenceSnapshotIndex];
        this.playheadMs = this.telemetry.snapshots[this.currentSnapshotIndex]?.timeMs || 0;
    }

    syncIndicesFromTime(timeMs, { preserveMoment = false } = {}) {
        this.currentSnapshotIndex = snapshotIndexAtOrBefore(this.telemetry.snapshots, timeMs);
        if (!this.skipIdle) {
            this.sequenceIndex = this.currentSnapshotIndex;
            this.sequenceSnapshotIndex = 0;
            return;
        }
        if (!preserveMoment) {
            const containing = this.sequence.findIndex((moment) => timeMs >= moment.startMs && timeMs <= moment.endMs);
            this.sequenceIndex = containing >= 0 ? containing : nearestMomentIndex(this.sequence, timeMs);
        }
        const indices = this.currentMoment()?.snapshotIndices || [];
        this.sequenceSnapshotIndex = nearestIndexWithin(indices, this.currentSnapshotIndex);
    }

    schedule() {
        this.cancelTimer();
        if (typeof globalThis.requestAnimationFrame === "function") {
            this.timerType = "animation";
            this.timer = globalThis.requestAnimationFrame(() => this.advancePlayback());
            return;
        }
        this.timerType = "timeout";
        this.timer = globalThis.setTimeout(() => this.advancePlayback(), FRAME_INTERVAL_MS);
    }

    stopTimer() {
        this.playing = false;
        this.cancelTimer();
    }

    cancelTimer() {
        if (this.timerType === "animation" && typeof globalThis.cancelAnimationFrame === "function") {
            globalThis.cancelAnimationFrame(this.timer);
        } else {
            globalThis.clearTimeout(this.timer);
        }
        this.timer = 0;
        this.timerType = "";
    }

    emit() {
        this.onChange(this.state());
    }
}

export function interpolateSnapshotAtTime(snapshots, timeMs) {
    if (!snapshots.length) return null;
    const target = Math.max(snapshots[0].timeMs, Math.min(snapshots.at(-1).timeMs, Number(timeMs) || 0));
    const lowerIndex = snapshotIndexAtOrBefore(snapshots, target);
    const lower = snapshots[lowerIndex];
    const upper = snapshots[lowerIndex + 1];
    if (!upper || target <= lower.timeMs) return lower;
    if (target >= upper.timeMs) return upper;
    const progress = (target - lower.timeMs) / (upper.timeMs - lower.timeMs);
    const upperPlayers = new Map(upper.players.map((player) => [player.playerId, player]));
    const upperVehicles = new Map(upper.vehicles.map((vehicle) => [vehicle.vehicleId, vehicle]));
    return {
        ...lower,
        timeMs: target,
        reason: "interpolated",
        players: lower.players.map((player) =>
            upperPlayers.has(player.playerId)
                ? interpolatePlayerState(player, upperPlayers.get(player.playerId), progress)
                : player
        ),
        vehicles: lower.vehicles.map((vehicle) =>
            upperVehicles.has(vehicle.vehicleId)
                ? interpolateVehicleState(vehicle, upperVehicles.get(vehicle.vehicleId), progress)
                : vehicle
        ),
        zone: interpolateZone(lower.zone, upper.zone, progress)
    };
}

export function interpolateZombieStatesAtTime(snapshots, timeMs) {
    if (!snapshots.length) return [];
    const target = Math.max(snapshots[0].timeMs, Math.min(snapshots.at(-1).timeMs, Number(timeMs) || 0));
    const lowerIndex = snapshotIndexAtOrBefore(snapshots, target);
    const lower = snapshots[lowerIndex];
    const upper = snapshots[lowerIndex + 1];
    if (!upper || target <= lower.timeMs) return lower.zombies;
    if (target >= upper.timeMs) return upper.zombies;
    const progress = (target - lower.timeMs) / (upper.timeMs - lower.timeMs);
    const upperZombies = new Map(upper.zombies.map((zombie) => [zombie.zombieId, zombie]));
    return lower.zombies.map((zombie) =>
        upperZombies.has(zombie.zombieId)
            ? interpolateZombieState(zombie, upperZombies.get(zombie.zombieId), progress)
            : zombie
    );
}

export function buildMeaningfulMoments(telemetry, filters = DEFAULT_FILTERS) {
    const moments = [];
    const coveredEventIds = new Set();
    if (filters.engagements) {
        for (const engagement of telemetry.engagements.filter((value) => value.qualifiesForSkipIdle)) {
            const engagementEvents = telemetry.events.filter(
                (event) => event.engagementId === engagement.engagementId && eventVisible(event, filters)
            );
            const indices = snapshotIndicesBetween(telemetry.snapshots, engagement.startMs, engagement.endMs);
            moments.push({
                id: engagement.engagementId,
                kind: "engagement",
                label: engagement.eliminationEventId ? "Engagement and elimination" : "Engagement",
                startMs: Math.max(0, engagement.startMs - INTERESTING_EVENT_PRE_ROLL_MS),
                endMs: engagement.endMs,
                snapshotIndices: ensureSnapshotIndices(indices, telemetry.snapshots, engagement.startMs),
                eventIds: engagementEvents.map((event) => event.eventId)
            });
            engagementEvents.forEach((event) => coveredEventIds.add(event.eventId));
        }
    }

    for (const event of telemetry.events) {
        if (!eventVisible(event, filters) || coveredEventIds.has(event.eventId)) continue;
        if (!isMeaningfulEvent(event.type)) continue;
        const eventStart =
            event.type === "elimination" && filters.engagements && event.engagementStartMs !== null
                ? event.engagementStartMs
                : event.timeMs;
        const startMs = Math.max(0, eventStart - INTERESTING_EVENT_PRE_ROLL_MS);
        const endMs = Math.min(telemetry.durationMs, event.timeMs + ISOLATED_EVENT_WINDOW_MS);
        moments.push({
            id: event.eventId,
            kind: event.type,
            label: eventLabel(event.type),
            startMs,
            endMs,
            snapshotIndices: ensureSnapshotIndices(
                snapshotIndicesBetween(telemetry.snapshots, startMs, endMs),
                telemetry.snapshots,
                event.timeMs
            ),
            eventIds: [event.eventId]
        });
    }

    return moments
        .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)
        .filter((moment, index, values) => {
            const previous = values[index - 1];
            return !previous || previous.id !== moment.id;
        });
}

function snapshotIndicesBetween(snapshots, startMs, endMs) {
    const indices = [];
    for (let index = 0; index < snapshots.length; index++) {
        const time = snapshots[index].timeMs;
        if (time >= startMs && time <= endMs) indices.push(index);
    }
    return indices;
}

function ensureSnapshotIndices(indices, snapshots, targetTime) {
    return indices.length ? indices : [nearestSnapshotIndex(snapshots, targetTime)];
}

function nearestSnapshotIndex(snapshots, timeMs) {
    if (!snapshots.length) return 0;
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < snapshots.length; index++) {
        const distance = Math.abs(snapshots[index].timeMs - timeMs);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = index;
        }
    }
    return bestIndex;
}

function snapshotIndexAtOrBefore(snapshots, timeMs) {
    if (!snapshots.length || timeMs <= snapshots[0].timeMs) return 0;
    let low = 0;
    let high = snapshots.length - 1;
    while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        if (snapshots[middle].timeMs <= timeMs) low = middle + 1;
        else high = middle - 1;
    }
    return Math.max(0, Math.min(snapshots.length - 1, high));
}

function interpolatePlayerState(from, to, progress) {
    return {
        ...from,
        x: lerp(from.x, to.x, progress),
        y: lerp(from.y, to.y, progress),
        z: lerp(from.z, to.z, progress),
        health: lerpNullable(from.health, to.health, progress),
        maxHealth: lerpNullable(from.maxHealth, to.maxHealth, progress),
        armor: lerpNullable(from.armor, to.armor, progress)
    };
}

function interpolateVehicleState(from, to, progress) {
    return {
        ...from,
        x: lerp(from.x, to.x, progress),
        y: lerp(from.y, to.y, progress),
        z: lerp(from.z, to.z, progress),
        health: lerpNullable(from.health, to.health, progress),
        maxHealth: lerpNullable(from.maxHealth, to.maxHealth, progress)
    };
}

function interpolateZombieState(from, to, progress) {
    return {
        ...from,
        x: lerp(from.x, to.x, progress),
        y: lerp(from.y, to.y, progress),
        z: lerp(from.z, to.z, progress)
    };
}

function eventsWithinTime(events, minimumTimeMs, maximumTimeMs) {
    let low = 0;
    let high = events.length;
    while (low < high) {
        const middle = (low + high) >>> 1;
        if (events[middle].timeMs < minimumTimeMs) low = middle + 1;
        else high = middle;
    }
    const result = [];
    for (let index = low; index < events.length; index++) {
        const event = events[index];
        if (event.timeMs > maximumTimeMs) break;
        result.push(event);
    }
    return result;
}

function interpolateZone(from, to, progress) {
    if (!from || !to || from.phase !== to.phase) return from;
    return {
        ...from,
        centerX: lerp(from.centerX, to.centerX, progress),
        centerZ: lerp(from.centerZ, to.centerZ, progress),
        radius: lerp(from.radius, to.radius, progress),
        damagePerSecond: lerpNullable(from.damagePerSecond, to.damagePerSecond, progress)
    };
}

function lerp(from, to, progress) {
    return Number(from) + (Number(to) - Number(from)) * progress;
}

function lerpNullable(from, to, progress) {
    return from === null || to === null ? from : lerp(from, to, progress);
}

function nearestMomentIndex(moments, timeMs) {
    if (!moments.length) return 0;
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < moments.length; index++) {
        const moment = moments[index];
        const distance =
            timeMs >= moment.startMs && timeMs <= moment.endMs
                ? 0
                : Math.min(Math.abs(moment.startMs - timeMs), Math.abs(moment.endMs - timeMs));
        if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = index;
        }
    }
    return bestIndex;
}

function nearestIndexWithin(indices, snapshotIndex) {
    if (!indices.length) return 0;
    let best = 0;
    let distance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < indices.length; index++) {
        const current = Math.abs(indices[index] - snapshotIndex);
        if (current < distance) {
            distance = current;
            best = index;
        }
    }
    return best;
}

function eventVisible(event, filters) {
    switch (event.type) {
        case "engagement_start":
        case "damage":
        case "zombie_damage":
            return filters.engagements;
        case "elimination":
        case "team_eliminated":
            return filters.eliminations;
        case "vehicle_destroyed":
            return filters.vehicles;
        case "zone_phase_changed":
            return filters.zone;
        case "rapid_streak":
        case "ace":
            return filters.streaks;
        case "respawn":
            return filters.respawns;
        default:
            return event.type === "match_end";
    }
}

function isMeaningfulEvent(type) {
    return [
        "elimination",
        "vehicle_destroyed",
        "zone_phase_changed",
        "rapid_streak",
        "ace",
        "respawn",
        "team_eliminated",
        "match_end"
    ].includes(type);
}

function eventLabel(type) {
    return String(type || "event")
        .replaceAll("_", " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
