const BASE_SLIDE_MS = 850;
const EVENT_SLIDE_MS = 1100;
const ISOLATED_EVENT_WINDOW_MS = 2000;

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
        this.skipIdle = options.skipIdle !== false;
        this.speed = [0.5, 1, 2].includes(Number(options.speed)) ? Number(options.speed) : 1;
        this.filters = {
            ...DEFAULT_FILTERS,
            ...Object.fromEntries(Object.keys(DEFAULT_FILTERS).map((key) => [key, options.filters?.[key] !== false]))
        };
        this.playing = false;
        this.timer = 0;
        this.sequence = [];
        this.sequenceIndex = 0;
        this.sequenceSnapshotIndex = 0;
        this.currentSnapshotIndex = 0;
        this.currentEventId = "";
        this.rebuildSequence(0);
    }

    snapshot() {
        return this.telemetry.snapshots[this.currentSnapshotIndex] || null;
    }

    currentEvents() {
        const snapshot = this.snapshot();
        if (!snapshot) return [];
        const tolerance = this.skipIdle ? 1100 : 250;
        const events = this.telemetry.events.filter(
            (event) => eventVisible(event, this.filters) && Math.abs(event.timeMs - snapshot.timeMs) <= tolerance
        );
        const selected = this.telemetry.events.find(
            (event) => event.eventId === this.currentEventId && eventVisible(event, this.filters)
        );
        if (selected && !events.some((event) => event.eventId === selected.eventId)) events.push(selected);
        return events.sort((a, b) => a.timeMs - b.timeMs);
    }

    currentMoment() {
        return this.sequence[this.sequenceIndex] || null;
    }

    state() {
        const snapshot = this.snapshot();
        const moment = this.currentMoment();
        return {
            playing: this.playing,
            skipIdle: this.skipIdle,
            speed: this.speed,
            filters: { ...this.filters },
            snapshot,
            snapshotIndex: this.currentSnapshotIndex,
            snapshotCount: this.telemetry.snapshots.length,
            events: this.currentEvents(),
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
        this.emit();
        this.schedule();
    }

    pause() {
        this.playing = false;
        globalThis.clearTimeout(this.timer);
        this.timer = 0;
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
        }
        this.currentEventId = "";
        this.emit();
    }

    seek(timeMs) {
        this.stopTimer();
        const target = Math.max(0, Math.min(this.telemetry.durationMs, Number(timeMs) || 0));
        this.currentSnapshotIndex = nearestSnapshotIndex(this.telemetry.snapshots, target);
        if (this.skipIdle) {
            const containing = this.sequence.findIndex((moment) => target >= moment.startMs && target <= moment.endMs);
            this.sequenceIndex = containing >= 0 ? containing : nearestMomentIndex(this.sequence, target);
            const indices = this.currentMoment()?.snapshotIndices || [];
            const currentIndex = indices.indexOf(this.currentSnapshotIndex);
            this.sequenceSnapshotIndex =
                currentIndex >= 0 ? currentIndex : nearestIndexWithin(indices, this.currentSnapshotIndex);
            this.syncSnapshotFromSequence();
        } else {
            this.sequenceIndex = this.currentSnapshotIndex;
        }
        this.currentEventId = "";
        this.emit();
    }

    selectEvent(eventId) {
        const event = this.telemetry.events.find((candidate) => candidate.eventId === eventId);
        if (!event) return;
        this.stopTimer();
        const engagement = event.engagementId
            ? this.telemetry.engagements.find((candidate) => candidate.engagementId === event.engagementId)
            : null;
        const target =
            this.skipIdle && this.filters.engagements && engagement?.qualifiesForSkipIdle
                ? engagement.startMs
                : event.timeMs;
        this.seek(target);
        this.currentEventId = event.eventId;
        this.emit();
    }

    setSkipIdle(enabled) {
        const currentTime = this.snapshot()?.timeMs || 0;
        const wasPlaying = this.playing;
        globalThis.clearTimeout(this.timer);
        this.timer = 0;
        this.skipIdle = Boolean(enabled);
        this.rebuildSequence(currentTime);
        this.emit();
        if (wasPlaying) this.schedule();
    }

    setSpeed(speed) {
        const normalized = Number(speed);
        if (![0.5, 1, 2].includes(normalized)) return;
        this.speed = normalized;
        if (this.playing) {
            globalThis.clearTimeout(this.timer);
            this.schedule();
        }
        this.emit();
    }

    setFilter(filter, enabled) {
        if (!(filter in this.filters)) return;
        const currentTime = this.snapshot()?.timeMs || 0;
        const wasPlaying = this.playing;
        globalThis.clearTimeout(this.timer);
        this.timer = 0;
        this.filters[filter] = Boolean(enabled);
        this.rebuildSequence(currentTime);
        this.emit();
        if (wasPlaying) this.schedule();
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
        this.sequenceSnapshotIndex = nearestIndexWithin(
            indices,
            nearestSnapshotIndex(this.telemetry.snapshots, currentTime)
        );
        this.syncSnapshotFromSequence();
    }

    advancePlayback() {
        if (!this.playing) return;
        if (this.skipIdle) {
            const indices = this.currentMoment()?.snapshotIndices || [];
            if (this.sequenceSnapshotIndex < indices.length - 1) {
                this.sequenceSnapshotIndex++;
                this.syncSnapshotFromSequence();
            } else if (this.sequenceIndex < this.sequence.length - 1) {
                this.sequenceIndex++;
                this.sequenceSnapshotIndex = 0;
                this.syncSnapshotFromSequence();
            } else {
                this.playing = false;
            }
        } else if (this.currentSnapshotIndex < this.telemetry.snapshots.length - 1) {
            this.currentSnapshotIndex++;
            this.sequenceIndex = this.currentSnapshotIndex;
        } else {
            this.playing = false;
        }
        this.currentEventId = "";
        this.emit();
        if (this.playing) this.schedule();
    }

    syncSnapshotFromSequence() {
        const indices = this.currentMoment()?.snapshotIndices || [];
        if (!indices.length) return;
        this.sequenceSnapshotIndex = Math.max(0, Math.min(indices.length - 1, this.sequenceSnapshotIndex));
        this.currentSnapshotIndex = indices[this.sequenceSnapshotIndex];
    }

    schedule() {
        globalThis.clearTimeout(this.timer);
        const snapshot = this.snapshot();
        const hold = snapshot?.reason === "periodic" ? BASE_SLIDE_MS : EVENT_SLIDE_MS;
        this.timer = globalThis.setTimeout(() => this.advancePlayback(), hold / this.speed);
    }

    stopTimer() {
        this.playing = false;
        globalThis.clearTimeout(this.timer);
        this.timer = 0;
    }

    emit() {
        this.onChange(this.state());
    }
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
                startMs: engagement.startMs,
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
        const startMs =
            event.type === "elimination" && filters.engagements && event.engagementStartMs !== null
                ? event.engagementStartMs
                : Math.max(0, event.timeMs - ISOLATED_EVENT_WINDOW_MS);
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
