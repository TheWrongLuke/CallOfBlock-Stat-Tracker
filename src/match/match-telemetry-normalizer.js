import { applyKnownTacticalMap } from "../config/tactical-maps.js";

export const MATCH_TELEMETRY_VERSION = 1;

const EVENT_TYPES = new Set([
    "match_start",
    "damage",
    "engagement_start",
    "elimination",
    "vehicle_destroyed",
    "zone_phase_changed",
    "rapid_streak",
    "ace",
    "respawn",
    "team_eliminated",
    "match_end"
]);

export function normalizeMatchTelemetry(raw, expectedMatchId = "") {
    if (!raw || typeof raw !== "object") throw new Error("Match telemetry is empty or invalid.");
    if (Number(raw.telemetryVersion) !== MATCH_TELEMETRY_VERSION) {
        throw new Error(`Unsupported telemetry version: ${String(raw.telemetryVersion ?? "missing")}.`);
    }
    if (String(raw.status || "") !== "completed") {
        throw new Error("This match has not published completed telemetry.");
    }

    const matchId = text(raw.matchId);
    if (!matchId || (expectedMatchId && matchId !== expectedMatchId)) {
        throw new Error("The telemetry match ID does not match this route.");
    }
    const participants = array(raw.participants).map(normalizeParticipant).filter(Boolean);
    const participantIds = new Set(participants.map((participant) => participant.playerId));
    const warnings = [];

    const snapshots = array(raw.snapshots)
        .map((snapshot, index) => normalizeSnapshot(snapshot, index, participantIds, warnings))
        .filter(Boolean)
        .sort((a, b) => a.timeMs - b.timeMs || a.sourceIndex - b.sourceIndex)
        .map(({ sourceIndex: _sourceIndex, ...snapshot }) => snapshot);

    const snapshotIds = new Set(snapshots.map((snapshot) => snapshot.snapshotId));
    const events = array(raw.events)
        .map((event, index) => normalizeEvent(event, index, participantIds, snapshotIds, warnings))
        .filter(Boolean)
        .sort((a, b) => a.timeMs - b.timeMs || a.sourceIndex - b.sourceIndex)
        .map(({ sourceIndex: _sourceIndex, ...event }) => event);
    const eventIds = new Set(events.map((event) => event.eventId));
    const engagements = array(raw.engagements)
        .map((engagement, index) => normalizeEngagement(engagement, index, participantIds, eventIds, warnings))
        .filter(Boolean)
        .sort((a, b) => a.startMs - b.startMs);

    const highestTime = Math.max(
        0,
        ...snapshots.map((snapshot) => snapshot.timeMs),
        ...events.map((event) => event.timeMs)
    );
    const durationMs = finiteNonNegative(raw.durationMs) ?? highestTime;
    const map = normalizeMap(raw.map, raw.mode);
    if (!map.calibrated || !map.imageUrl) {
        warnings.push("Map calibration is unavailable; marker positions use the approximate coordinate grid.");
    }

    return {
        telemetryVersion: MATCH_TELEMETRY_VERSION,
        matchId,
        mode: enumText(raw.mode, ["battleRoyale", "deathmatch"], "unknown"),
        startedAt: validDateText(raw.startedAt),
        endedAt: validDateText(raw.endedAt),
        durationMs: Math.max(durationMs, highestTime),
        status: "completed",
        map,
        capture: {
            snapshotIntervalMs: finitePositive(raw.capture?.snapshotIntervalMs),
            engagementInactivityMs: finitePositive(raw.capture?.engagementInactivityMs)
        },
        participants,
        snapshots,
        events,
        engagements,
        result: normalizeResult(raw.result, participantIds, warnings),
        replays: array(raw.replays).map(normalizeReplayMetadata).filter(Boolean),
        warnings: unique(warnings)
    };
}

export function mapCoordinateToPercent(map, x, z) {
    const minX = finite(map?.worldMinX);
    const maxX = finite(map?.worldMaxX);
    const minZ = finite(map?.worldMinZ);
    const maxZ = finite(map?.worldMaxZ);
    const worldX = finite(x);
    const worldZ = finite(z);
    if ([minX, maxX, minZ, maxZ, worldX, worldZ].some((value) => value === null)) return null;
    if (maxX <= minX || maxZ <= minZ) return null;

    let normalizedX = (worldX - minX) / (maxX - minX);
    let normalizedY = (worldZ - minZ) / (maxZ - minZ);
    if (map.flipX) normalizedX = 1 - normalizedX;
    if (map.flipY) normalizedY = 1 - normalizedY;

    const rotation = (((finite(map.rotationDegrees) ?? 0) % 360) + 360) % 360;
    if (rotation) {
        const radians = (rotation * Math.PI) / 180;
        const centeredX = normalizedX - 0.5;
        const centeredY = normalizedY - 0.5;
        normalizedX = centeredX * Math.cos(radians) - centeredY * Math.sin(radians) + 0.5;
        normalizedY = centeredX * Math.sin(radians) + centeredY * Math.cos(radians) + 0.5;
    }
    return {
        x: clamp(normalizedX * 100, 0, 100),
        y: clamp(normalizedY * 100, 0, 100),
        outsideBounds: normalizedX < 0 || normalizedX > 1 || normalizedY < 0 || normalizedY > 1
    };
}

export function validateMatchTelemetry(telemetry) {
    const errors = [];
    const warnings = [...array(telemetry?.warnings)];
    if (!telemetry || telemetry.telemetryVersion !== MATCH_TELEMETRY_VERSION) {
        errors.push("Unsupported or missing telemetry version.");
        return { valid: false, errors, warnings, eventCounts: {}, payloadBytes: 0 };
    }

    const participantIds = new Set(telemetry.participants.map((participant) => participant.playerId));
    const snapshotIds = new Set(telemetry.snapshots.map((snapshot) => snapshot.snapshotId));
    const eventIds = new Set(telemetry.events.map((event) => event.eventId));
    let previousSnapshot = -1;
    for (const snapshot of telemetry.snapshots) {
        if (snapshot.timeMs < previousSnapshot) errors.push(`Snapshot ${snapshot.snapshotId} is out of order.`);
        previousSnapshot = snapshot.timeMs;
        for (const player of snapshot.players) {
            if (!participantIds.has(player.playerId)) {
                errors.push(`Snapshot ${snapshot.snapshotId} references unknown player ${player.playerId}.`);
            }
            validateHealth(player, snapshot.snapshotId, errors);
            const point = mapCoordinateToPercent(telemetry.map, player.x, player.z);
            if (point?.outsideBounds)
                warnings.push(`${player.playerId} is outside calibrated bounds at ${snapshot.timeMs}ms.`);
        }
    }

    let previousEvent = -1;
    const eventCounts = {};
    for (const event of telemetry.events) {
        eventCounts[event.type] = (eventCounts[event.type] || 0) + 1;
        if (event.timeMs < previousEvent) errors.push(`Event ${event.eventId} is out of order.`);
        previousEvent = event.timeMs;
        if (event.snapshotId && !snapshotIds.has(event.snapshotId)) {
            errors.push(`Event ${event.eventId} references missing snapshot ${event.snapshotId}.`);
        }
        for (const playerId of eventPlayerIds(event)) {
            if (playerId && !participantIds.has(playerId)) {
                errors.push(`Event ${event.eventId} references unknown player ${playerId}.`);
            }
        }
    }

    for (const engagement of telemetry.engagements) {
        for (const eventId of engagement.damageEventIds) {
            if (!eventIds.has(eventId))
                errors.push(`Engagement ${engagement.engagementId} references missing event ${eventId}.`);
        }
    }
    const winner = telemetry.result?.winner;
    if (winner?.playerId && !participantIds.has(winner.playerId)) errors.push("Winner is not a match participant.");
    const mvp = telemetry.result?.mvp;
    if (mvp?.playerId && !participantIds.has(mvp.playerId)) errors.push("MVP is not a match participant.");
    if (!winner) warnings.push("Authoritative winner is unavailable.");
    if (!mvp) warnings.push("Authoritative MVP is unavailable.");

    return {
        valid: errors.length === 0,
        errors: unique(errors),
        warnings: unique(warnings),
        eventCounts,
        payloadBytes: new TextEncoder().encode(JSON.stringify(telemetry)).byteLength
    };
}

function normalizeParticipant(value) {
    const playerId = text(value?.playerId);
    if (!playerId) return null;
    return {
        playerId,
        name: text(value.name) || "Unknown player",
        teamId: text(value.teamId)
    };
}

function normalizeSnapshot(value, index, participantIds, warnings) {
    const timeMs = finiteNonNegative(value?.timeMs);
    if (timeMs === null) {
        warnings.push(`Skipped snapshot ${index + 1} because its time is invalid.`);
        return null;
    }
    const snapshotId = text(value.snapshotId) || `snapshot-${index + 1}`;
    return {
        snapshotId,
        timeMs,
        reason: text(value.reason) || "periodic",
        players: array(value.players)
            .map((player) => normalizePlayerState(player, participantIds))
            .filter(Boolean),
        vehicles: array(value.vehicles).map(normalizeVehicleState).filter(Boolean),
        zone: normalizeZone(value.zone),
        scores: normalizeScores(value.scores),
        sourceIndex: index
    };
}

function normalizePlayerState(value, participantIds) {
    const playerId = text(value?.playerId);
    const x = finite(value?.x);
    const y = finite(value?.y);
    const z = finite(value?.z);
    if (!playerId || !participantIds.has(playerId) || x === null || y === null || z === null) return null;
    return {
        playerId,
        teamId: text(value.teamId),
        x,
        y,
        z,
        health: finiteNonNegative(value.health),
        maxHealth: finitePositive(value.maxHealth),
        armor: finiteNonNegative(value.armor),
        alive: value.alive !== false,
        connected: value.connected !== false,
        vehicleId: text(value.vehicleId)
    };
}

function normalizeVehicleState(value) {
    const vehicleId = text(value?.vehicleId);
    const vehicleType = text(value?.vehicleType) || "Vehicle";
    const x = finite(value?.x);
    const y = finite(value?.y);
    const z = finite(value?.z);
    if (
        !vehicleId ||
        x === null ||
        y === null ||
        z === null ||
        value?.spawnedByMatch === false ||
        isTransientVehicleType(vehicleType)
    ) {
        return null;
    }
    return {
        vehicleId,
        vehicleType,
        x,
        y,
        z,
        health: finiteNonNegative(value.health),
        maxHealth: finitePositive(value.maxHealth),
        destroyed: value.destroyed === true,
        spawnedByMatch: value.spawnedByMatch === true,
        occupantPlayerIds: stringArray(value.occupantPlayerIds)
    };
}

function isTransientVehicleType(value) {
    const type = String(value || "").toLowerCase();
    return (
        type === "minecraft:pig" ||
        type.includes("fly_by_carrier") ||
        /(?:^|:)(?:tow|smoke_decoy)$/.test(type) ||
        /(missile|projectile|rocket|shell|bullet|grenade|torpedo|bomb|ptkm)/.test(type)
    );
}

function normalizeEvent(value, index, participantIds, snapshotIds, warnings) {
    const type = text(value?.type);
    const timeMs = finiteNonNegative(value?.timeMs);
    if (!EVENT_TYPES.has(type) || timeMs === null) {
        warnings.push(`Skipped invalid event ${index + 1}.`);
        return null;
    }
    const event = {
        ...value,
        eventId: text(value.eventId) || `${type}-${index + 1}`,
        type,
        timeMs,
        phase: text(value.phase),
        remainingRespawns: finiteNonNegative(value.remainingRespawns),
        snapshotId: snapshotIds.has(text(value.snapshotId)) ? text(value.snapshotId) : "",
        engagementId: text(value.engagementId),
        engagementStartMs: finiteNonNegative(value.engagementStartMs),
        engagementEndMs: finiteNonNegative(value.engagementEndMs),
        qualifiesForSkipIdle: value.qualifiesForSkipIdle === true,
        participantIds: stringArray(value.participantIds).filter((id) => participantIds.has(id)),
        assistPlayerIds: stringArray(value.assistPlayerIds).filter((id) => participantIds.has(id)),
        occupantPlayerIds: stringArray(value.occupantPlayerIds).filter((id) => participantIds.has(id)),
        attackerPosition: normalizePosition(value.attackerPosition),
        killerPosition: normalizePosition(value.killerPosition),
        victimPosition: normalizePosition(value.victimPosition),
        position: normalizePosition(value.position),
        zone: normalizeZone(value.zone),
        sourceIndex: index
    };
    for (const key of [
        "damage",
        "victimHealthBefore",
        "victimHealthAfter",
        "victimArmorBefore",
        "victimArmorAfter",
        "killerHealthAfter",
        "killerArmorAfter",
        "victimHealthBeforeFinalDamage",
        "victimArmorBeforeFinalDamage",
        "finalDamage",
        "horizontalDistance",
        "distance3d",
        "verticalDifference"
    ]) {
        event[key] = finite(value[key]);
    }
    return event;
}

function normalizeEngagement(value, index, participantIds, eventIds, warnings) {
    const startMs = finiteNonNegative(value?.startMs);
    const endMs = finiteNonNegative(value?.endMs);
    if (startMs === null || endMs === null || endMs < startMs) {
        warnings.push(`Skipped invalid engagement ${index + 1}.`);
        return null;
    }
    return {
        engagementId: text(value.engagementId) || `engagement-${index + 1}`,
        startMs,
        endMs,
        participantIds: stringArray(value.participantIds).filter((id) => participantIds.has(id)),
        damageEventIds: stringArray(value.damageEventIds).filter((id) => eventIds.has(id)),
        damageEventCount: finiteNonNegative(value.damageEventCount) ?? 0,
        reciprocalDamage: value.reciprocalDamage === true,
        qualifiesForSkipIdle: value.qualifiesForSkipIdle === true,
        eliminationEventId: eventIds.has(text(value.eliminationEventId)) ? text(value.eliminationEventId) : ""
    };
}

function normalizeMap(value, mode) {
    return applyKnownTacticalMap(
        {
            mapId: text(value?.mapId) || "unknown",
            mapVersion: text(value?.mapVersion) || "unknown",
            label: text(value?.label) || text(value?.mapId) || "Unknown map",
            imageUrl: safeAssetUrl(value?.imageUrl),
            imageWidth: finitePositive(value?.imageWidth),
            imageHeight: finitePositive(value?.imageHeight),
            worldMinX: finite(value?.worldMinX),
            worldMaxX: finite(value?.worldMaxX),
            worldMinZ: finite(value?.worldMinZ),
            worldMaxZ: finite(value?.worldMaxZ),
            rotationDegrees: finite(value?.rotationDegrees) ?? 0,
            flipX: value?.flipX === true,
            flipY: value?.flipY === true,
            calibrated: value?.calibrated === true,
            calibrationSource: text(value?.calibrationSource)
        },
        mode
    );
}

function normalizeZone(value) {
    if (!value) return null;
    const centerX = finite(value.centerX);
    const centerZ = finite(value.centerZ);
    const radius = finiteNonNegative(value.radius);
    if (centerX === null || centerZ === null || radius === null) return null;
    return {
        phase: finiteNonNegative(value.phase),
        phaseCount: finiteNonNegative(value.phaseCount),
        centerX,
        centerZ,
        radius,
        damagePerSecond: finiteNonNegative(value.damagePerSecond),
        stage: text(value.stage)
    };
}

function normalizeScores(value) {
    if (!value) return null;
    const players = {};
    for (const [playerId, score] of Object.entries(value.players || {})) {
        const normalized = finiteNonNegative(score);
        if (normalized !== null) players[playerId] = normalized;
    }
    return {
        red: finiteNonNegative(value.red),
        blue: finiteNonNegative(value.blue),
        target: finiteNonNegative(value.target),
        players
    };
}

function normalizeResult(value, participantIds, warnings) {
    if (!value || typeof value !== "object") return null;
    const winner = value.winner
        ? {
              type: enumText(value.winner.type, ["player", "team"], ""),
              playerId: participantIds.has(text(value.winner.playerId)) ? text(value.winner.playerId) : "",
              teamId: text(value.winner.teamId),
              finalScore: finiteNonNegative(value.winner.finalScore),
              opponentScore: finiteNonNegative(value.winner.opponentScore),
              survivingPlayerIds: stringArray(value.winner.survivingPlayerIds).filter((id) => participantIds.has(id))
          }
        : null;
    const mvp = value.mvp
        ? {
              playerId: participantIds.has(text(value.mvp.playerId)) ? text(value.mvp.playerId) : "",
              reason: text(value.mvp.reason),
              score: finite(value.mvp.score)
          }
        : null;
    if (value.winner && !winner?.playerId && !winner?.teamId) warnings.push("Winner reference is invalid.");
    if (value.mvp && !mvp?.playerId) warnings.push("MVP reference is invalid.");
    return {
        winner,
        mvp,
        finalScores: normalizeScores(value.finalScores),
        participants: array(value.participants)
            .map((participant) => normalizeParticipantResult(participant, participantIds))
            .filter(Boolean),
        endReason: text(value.endReason)
    };
}

function normalizeParticipantResult(value, participantIds) {
    const playerId = text(value?.playerId);
    if (!participantIds.has(playerId)) return null;
    const output = {
        ...value,
        playerId,
        teamId: text(value.teamId),
        won: value.won === true,
        alive: value.alive === true,
        eliminated: value.eliminated === true,
        eliminatedAtMs: finiteNonNegative(value.eliminatedAtMs),
        finalPlacement: finiteNonNegative(value.finalPlacement)
    };
    for (const key of [
        "placement",
        "kills",
        "deaths",
        "assists",
        "damage",
        "headshotKills",
        "bestKillStreak",
        "longestKillDistance",
        "utilityKills",
        "vehicleKills"
    ]) {
        output[key] = finiteNonNegative(value[key]);
    }
    return output;
}

function normalizeReplayMetadata(value) {
    const replayId = text(value?.replayId);
    if (!replayId) return null;
    return {
        replayId,
        label: text(value.label) || "Replay",
        recorderPlayerId: text(value.recorderPlayerId),
        recorderName: text(value.recorderName),
        minecraftVersion: text(value.minecraftVersion),
        modpackVersion: text(value.modpackVersion),
        replayModVersion: text(value.replayModVersion),
        fileSize: finiteNonNegative(value.fileSize),
        sha256: text(value.sha256),
        uploadedAt: validDateText(value.uploadedAt),
        visibility: enumText(value.visibility, ["participants", "community", "public"], "participants"),
        notes: text(value.notes),
        mayContainChat: value.mayContainChat !== false
    };
}

function normalizePosition(value) {
    if (!value) return null;
    const x = finite(value.x);
    const y = finite(value.y);
    const z = finite(value.z);
    return x === null || y === null || z === null ? null : { x, y, z };
}

function eventPlayerIds(event) {
    return unique([
        event.playerId,
        event.attackerId,
        event.victimId,
        event.killerId,
        ...array(event.participantIds),
        ...array(event.assistPlayerIds),
        ...array(event.occupantPlayerIds)
    ]).filter(Boolean);
}

function validateHealth(player, snapshotId, errors) {
    if (player.health !== null && player.maxHealth !== null && player.health > player.maxHealth + 0.01) {
        errors.push(`Player ${player.playerId} has health above maximum in ${snapshotId}.`);
    }
    if (player.armor !== null && player.armor > 1000) {
        errors.push(`Player ${player.playerId} has an implausible armor value in ${snapshotId}.`);
    }
}

function safeAssetUrl(value) {
    const url = text(value);
    if (!url) return "";
    if (/^(?:\.{0,2}\/)?(?:assets|data)\//i.test(url)) return url;
    return "";
}

function validDateText(value) {
    const string = text(value);
    return string && Number.isFinite(Date.parse(string)) ? string : "";
}

function enumText(value, choices, fallback) {
    const normalized = text(value);
    return choices.includes(normalized) ? normalized : fallback;
}

function finite(value) {
    if (value === null || value === undefined || value === "") return null;
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : null;
}

function finiteNonNegative(value) {
    const normalized = finite(value);
    return normalized !== null && normalized >= 0 ? normalized : null;
}

function finitePositive(value) {
    const normalized = finite(value);
    return normalized !== null && normalized > 0 ? normalized : null;
}

function text(value) {
    return typeof value === "string" ? value.trim() : "";
}

function stringArray(value) {
    return array(value).map(text).filter(Boolean);
}

function array(value) {
    return Array.isArray(value) ? value : [];
}

function unique(values) {
    return [...new Set(values)];
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
