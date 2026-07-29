import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "data", "match-telemetry");

const alpha = "p_alpha";
const bravo = "p_bravo";
const charlie = "p_charlie";
const delta = "p_delta";

function player(playerId, teamId, x, y, z, health = 20, armor = 0, alive = true, vehicleId = null) {
    return {
        playerId,
        teamId,
        x,
        y,
        z,
        health,
        maxHealth: health === null ? null : 20,
        armor,
        alive,
        connected: true,
        vehicleId
    };
}

function brPlayers(timeMs) {
    const progress = Math.min(timeMs / 50_000, 1);
    const bravoAlive = timeMs < 28_000;
    const deltaAlive = timeMs < 43_000;
    const bravoHealth = timeMs < 5_000 ? 20 : timeMs < 22_000 ? 19 : timeMs < 24_000 ? 14 : timeMs < 26_000 ? 9 : 0;
    const alphaHealth = timeMs < 24_000 ? 20 : 16;
    return [
        player(alpha, "red", 12 + progress * 42, 78, 14 + progress * 31, alphaHealth, 12, true),
        player(bravo, "blue", 86 - progress * 31, 66, 83 - progress * 25, bravoHealth, bravoAlive ? 6 : 0, bravoAlive),
        player(charlie, "red", 18 + progress * 33, 71, 20 + progress * 24, 20, 8, true),
        player(delta, "blue", 80 - progress * 24, 64, 76 - progress * 18, deltaAlive ? 20 : 0, 4, deltaAlive)
    ];
}

function brVehicle(timeMs) {
    if (timeMs < 34_000) {
        return [
            {
                vehicleId: "vehicle-tank-1",
                vehicleType: "ashvehicle:m1a1abrams",
                x: 58,
                y: 65,
                z: 55,
                health: 180,
                maxHealth: 300,
                destroyed: false,
                occupantPlayerIds: [delta]
            }
        ];
    }
    return [
        {
            vehicleId: "vehicle-tank-1",
            vehicleType: "ashvehicle:m1a1abrams",
            x: 58,
            y: 65,
            z: 55,
            health: 0,
            maxHealth: 300,
            destroyed: true,
            occupantPlayerIds: []
        }
    ];
}

function brZone(timeMs) {
    return timeMs < 40_000
        ? { phase: 1, phaseCount: 5, centerX: 50, centerZ: 50, radius: 46, damagePerSecond: 1, stage: "Hold" }
        : { phase: 2, phaseCount: 5, centerX: 52, centerZ: 48, radius: 31, damagePerSecond: 2, stage: "Shrink" };
}

function brSnapshot(snapshotId, timeMs, reason = "periodic") {
    return {
        snapshotId,
        timeMs,
        reason,
        players: brPlayers(timeMs),
        vehicles: brVehicle(timeMs),
        zone: brZone(timeMs),
        scores: null
    };
}

const brSnapshots = [
    brSnapshot("snapshot-1", 0, "match_start"),
    brSnapshot("snapshot-2", 2_000),
    brSnapshot("snapshot-3", 4_000),
    brSnapshot("snapshot-4", 5_000, "damage"),
    brSnapshot("snapshot-5", 6_000),
    brSnapshot("snapshot-6", 22_000, "damage"),
    brSnapshot("snapshot-7", 24_000, "damage"),
    brSnapshot("snapshot-8", 26_000, "damage"),
    brSnapshot("snapshot-9", 28_000, "elimination"),
    brSnapshot("snapshot-10", 34_000, "vehicle_destroyed"),
    brSnapshot("snapshot-11", 40_000, "zone_phase_changed"),
    brSnapshot("snapshot-12", 42_000, "rapid_streak"),
    brSnapshot("snapshot-13", 43_000, "elimination"),
    brSnapshot("snapshot-14", 44_000, "ace"),
    brSnapshot("snapshot-15", 46_000, "team_eliminated"),
    brSnapshot("snapshot-16", 50_000, "match_end")
];

const brEvents = [
    { eventId: "match-start-1", type: "match_start", timeMs: 0, snapshotId: "snapshot-1" },
    {
        eventId: "engagement-start-1",
        type: "engagement_start",
        timeMs: 5_000,
        snapshotId: "snapshot-4",
        engagementId: "engagement-1",
        engagementStartMs: 5_000,
        participantIds: [alpha, bravo],
        qualifiesForSkipIdle: false
    },
    {
        eventId: "damage-1",
        type: "damage",
        timeMs: 5_000,
        snapshotId: "snapshot-4",
        engagementId: "engagement-1",
        engagementStartMs: 5_000,
        engagementEndMs: 5_000,
        attackerId: alpha,
        victimId: bravo,
        weaponId: "tacz:mk14",
        weaponLabel: "MK14",
        damageType: "firearm",
        damage: 1,
        headshot: false,
        attackerPosition: { x: 16.2, y: 78, z: 17.1 },
        victimPosition: { x: 82.9, y: 66, z: 80.5 },
        victimHealthBefore: 20,
        victimHealthAfter: 19,
        victimArmorBefore: 6,
        victimArmorAfter: 6,
        qualifiesForSkipIdle: false
    },
    {
        eventId: "engagement-start-2",
        type: "engagement_start",
        timeMs: 22_000,
        snapshotId: "snapshot-6",
        engagementId: "engagement-2",
        engagementStartMs: 22_000,
        engagementEndMs: 28_000,
        participantIds: [alpha, bravo, charlie],
        qualifiesForSkipIdle: true
    },
    {
        eventId: "damage-2",
        type: "damage",
        timeMs: 22_000,
        snapshotId: "snapshot-6",
        engagementId: "engagement-2",
        engagementStartMs: 22_000,
        engagementEndMs: 28_000,
        attackerId: alpha,
        victimId: bravo,
        weaponId: "tacz:mk14",
        weaponLabel: "MK14",
        damageType: "firearm",
        damage: 5,
        headshot: false,
        attackerPosition: { x: 30.5, y: 78, z: 27.6 },
        victimPosition: { x: 72.4, y: 66, z: 70.2 },
        victimHealthBefore: 19,
        victimHealthAfter: 14,
        victimArmorBefore: 6,
        victimArmorAfter: 5,
        qualifiesForSkipIdle: true
    },
    {
        eventId: "damage-3",
        type: "damage",
        timeMs: 24_000,
        snapshotId: "snapshot-7",
        engagementId: "engagement-2",
        engagementStartMs: 22_000,
        engagementEndMs: 28_000,
        attackerId: bravo,
        victimId: alpha,
        weaponId: "tacz:ak47",
        weaponLabel: "AK-47",
        damageType: "firearm",
        damage: 4,
        headshot: false,
        attackerPosition: { x: 71.1, y: 66, z: 69.1 },
        victimPosition: { x: 32.2, y: 78, z: 28.9 },
        victimHealthBefore: 20,
        victimHealthAfter: 16,
        victimArmorBefore: 12,
        victimArmorAfter: 10,
        qualifiesForSkipIdle: true
    },
    {
        eventId: "damage-4",
        type: "damage",
        timeMs: 26_000,
        snapshotId: "snapshot-8",
        engagementId: "engagement-2",
        engagementStartMs: 22_000,
        engagementEndMs: 28_000,
        attackerId: charlie,
        victimId: bravo,
        weaponId: "tacz:m4a1",
        weaponLabel: "M4A1",
        damageType: "firearm",
        damage: 5,
        headshot: false,
        attackerPosition: { x: 35.2, y: 71, z: 32.5 },
        victimPosition: { x: 69.9, y: 66, z: 67.9 },
        victimHealthBefore: 14,
        victimHealthAfter: 9,
        victimArmorBefore: 5,
        victimArmorAfter: 3,
        qualifiesForSkipIdle: true
    },
    {
        eventId: "elimination-1",
        type: "elimination",
        timeMs: 28_000,
        snapshotId: "snapshot-9",
        engagementId: "engagement-2",
        engagementStartMs: 22_000,
        engagementEndMs: 28_000,
        killerId: alpha,
        victimId: bravo,
        assistPlayerIds: [charlie],
        weaponId: "tacz:mk14",
        weaponLabel: "MK14",
        damageType: "firearm",
        headshot: true,
        killerPosition: { x: 35.5, y: 78, z: 31.4 },
        victimPosition: { x: 68.6, y: 66, z: 66.8 },
        horizontalDistance: 48.46,
        distance3d: 49.93,
        verticalDifference: 12,
        killerHealthAfter: 16,
        killerArmorAfter: 10,
        victimHealthBeforeFinalDamage: 9,
        victimArmorBeforeFinalDamage: 3,
        finalDamage: 11.5,
        qualifiesForSkipIdle: true
    },
    {
        eventId: "vehicle-destroyed-1",
        type: "vehicle_destroyed",
        timeMs: 34_000,
        snapshotId: "snapshot-10",
        attackerId: alpha,
        playerId: alpha,
        vehicleId: "vehicle-tank-1",
        vehicleType: "ashvehicle:m1a1abrams",
        weaponId: "superbwarfare:javelin",
        weaponLabel: "FGM-148 Javelin",
        occupantPlayerIds: [delta],
        position: { x: 58, y: 65, z: 55 }
    },
    {
        eventId: "zone-phase-1",
        type: "zone_phase_changed",
        timeMs: 40_000,
        snapshotId: "snapshot-11",
        zone: brZone(40_000)
    },
    {
        eventId: "rapid-streak-1",
        type: "rapid_streak",
        timeMs: 42_000,
        snapshotId: "snapshot-12",
        playerId: alpha,
        streakLength: 4
    },
    {
        eventId: "elimination-2",
        type: "elimination",
        timeMs: 43_000,
        snapshotId: "snapshot-13",
        engagementId: "engagement-3",
        engagementStartMs: 43_000,
        engagementEndMs: 43_000,
        killerId: alpha,
        victimId: delta,
        assistPlayerIds: [],
        weaponId: "tacz:awm",
        weaponLabel: "AWM",
        damageType: "firearm",
        headshot: true,
        killerPosition: { x: 48.1, y: 78, z: 40.7 },
        victimPosition: { x: 56.8, y: 64, z: 60.5 },
        horizontalDistance: 21.63,
        distance3d: 25.76,
        verticalDifference: 14,
        killerHealthAfter: 16,
        killerArmorAfter: 10,
        victimHealthBeforeFinalDamage: 20,
        victimArmorBeforeFinalDamage: 4,
        finalDamage: 24,
        qualifiesForSkipIdle: true
    },
    {
        eventId: "ace-1",
        type: "ace",
        timeMs: 44_000,
        snapshotId: "snapshot-14",
        playerId: alpha,
        streakLength: 5,
        aceCount: 1
    },
    {
        eventId: "team-eliminated-1",
        type: "team_eliminated",
        timeMs: 46_000,
        snapshotId: "snapshot-15",
        teamId: "blue",
        participantIds: [bravo, delta],
        reason: "No surviving team members"
    },
    {
        eventId: "match-end-1",
        type: "match_end",
        timeMs: 50_000,
        snapshotId: "snapshot-16",
        reason: "Last team standing"
    }
];

const fixtureBr = {
    telemetryVersion: 1,
    matchId: "fixture-br",
    mode: "battleRoyale",
    startedAt: "2026-07-28T10:00:00.000Z",
    endedAt: "2026-07-28T10:00:50.000Z",
    durationMs: 50_000,
    status: "completed",
    map: {
        mapId: "shmar",
        mapVersion: "1",
        label: "Shmar",
        imageUrl: "./assets/shmar-vehicle-spawn-map.webp",
        worldMinX: 0,
        worldMaxX: 100,
        worldMinZ: 0,
        worldMaxZ: 100,
        rotationDegrees: 0,
        flipX: false,
        flipY: true,
        calibrated: true,
        calibrationSource: "deterministic_fixture"
    },
    capture: { snapshotIntervalMs: 2_000, engagementInactivityMs: 15_000 },
    participants: [
        { playerId: alpha, name: "Alpha", teamId: "red" },
        { playerId: bravo, name: "Bravo", teamId: "blue" },
        { playerId: charlie, name: "Charlie", teamId: "red" },
        { playerId: delta, name: "Delta", teamId: "blue" }
    ],
    snapshots: brSnapshots,
    events: brEvents,
    engagements: [
        {
            engagementId: "engagement-1",
            startMs: 5_000,
            endMs: 5_000,
            participantIds: [alpha, bravo],
            damageEventIds: ["damage-1"],
            damageEventCount: 1,
            reciprocalDamage: false,
            qualifiesForSkipIdle: false,
            eliminationEventId: null
        },
        {
            engagementId: "engagement-2",
            startMs: 22_000,
            endMs: 28_000,
            participantIds: [alpha, bravo, charlie],
            damageEventIds: ["damage-2", "damage-3", "damage-4"],
            damageEventCount: 3,
            reciprocalDamage: true,
            qualifiesForSkipIdle: true,
            eliminationEventId: "elimination-1"
        },
        {
            engagementId: "engagement-3",
            startMs: 43_000,
            endMs: 43_000,
            participantIds: [alpha, delta],
            damageEventIds: [],
            damageEventCount: 0,
            reciprocalDamage: false,
            qualifiesForSkipIdle: true,
            eliminationEventId: "elimination-2"
        }
    ],
    result: {
        winner: {
            type: "player",
            playerId: alpha,
            teamId: "red",
            survivingPlayerIds: [alpha, charlie]
        },
        mvp: {
            playerId: alpha,
            reason: "most_kills_then_fewest_deaths_then_name",
            score: 5
        },
        finalScores: null,
        participants: [
            {
                playerId: alpha,
                teamId: "red",
                won: true,
                placement: 1,
                kills: 5,
                deaths: 0,
                assists: 0,
                damage: 173.5,
                headshotKills: 2,
                bestKillStreak: 5,
                longestKillDistance: 48.46,
                utilityKills: 0,
                vehicleKills: 1
            },
            {
                playerId: charlie,
                teamId: "red",
                won: true,
                placement: 1,
                kills: 1,
                deaths: 0,
                assists: 1,
                damage: 43,
                headshotKills: 0,
                bestKillStreak: 1,
                longestKillDistance: 18,
                utilityKills: 0,
                vehicleKills: 0
            },
            {
                playerId: bravo,
                teamId: "blue",
                won: false,
                placement: 2,
                kills: 0,
                deaths: 1,
                assists: 0,
                damage: 4,
                headshotKills: 0,
                bestKillStreak: 0,
                longestKillDistance: null,
                utilityKills: 0,
                vehicleKills: 0
            },
            {
                playerId: delta,
                teamId: "blue",
                won: false,
                placement: 2,
                kills: 0,
                deaths: 1,
                assists: 0,
                damage: 0,
                headshotKills: 0,
                bestKillStreak: 0,
                longestKillDistance: null,
                utilityKills: 0,
                vehicleKills: 0
            }
        ],
        endReason: "Last team standing"
    },
    replays: [
        {
            replayId: "fixture-replay-alpha",
            matchId: "fixture-br",
            recorderPlayerId: alpha,
            recorderName: "Alpha",
            label: "Alpha perspective",
            minecraftVersion: "1.20.1",
            modpackVersion: "0.3.1",
            replayModVersion: "2.6.20",
            fileSize: 18_874_368,
            sha256: "49f39d42faba537679c3af53db4ef5582226701942df691ec9f46b5d2d04e135",
            uploadedAt: "2026-07-28T10:15:00.000Z",
            visibility: "participants",
            notes: "Deterministic fixture metadata; no replay object is included.",
            mayContainChat: true
        }
    ]
};

function dmSnapshot(snapshotId, timeMs, reason, alphaHealth = 20, bravoAlive = true, scores = null) {
    return {
        snapshotId,
        timeMs,
        reason,
        players: [
            player(alpha, "red", 12 + timeMs / 2_000, 70, 18 + timeMs / 4_000, alphaHealth, 4, true),
            player(bravo, "blue", 45 - timeMs / 4_000, 70, 42 - timeMs / 5_000, bravoAlive ? 20 : 0, 2, bravoAlive),
            player(charlie, "blue", 38, 70, 14 + timeMs / 3_000, 20, 3, true)
        ],
        vehicles: [],
        zone: null,
        scores
    };
}

const dmScores = (red, blue) => ({ red, blue, target: 40, players: { [alpha]: red, [bravo]: 4, [charlie]: blue - 4 } });
const fixtureDm = {
    telemetryVersion: 1,
    matchId: "fixture-dm",
    mode: "deathmatch",
    startedAt: "2026-07-28T11:00:00.000Z",
    endedAt: "2026-07-28T11:00:20.000Z",
    durationMs: 20_000,
    status: "completed",
    map: {
        mapId: "raid",
        mapVersion: "1",
        label: "Raid",
        imageUrl: "",
        worldMinX: 0,
        worldMaxX: 50,
        worldMinZ: 0,
        worldMaxZ: 50,
        rotationDegrees: 0,
        flipX: false,
        flipY: false,
        calibrated: false,
        calibrationSource: "spawn_bounds_fallback"
    },
    capture: { snapshotIntervalMs: 2_000, engagementInactivityMs: 15_000 },
    participants: [
        { playerId: alpha, name: "Alpha", teamId: "red" },
        { playerId: bravo, name: "Bravo", teamId: "blue" },
        { playerId: charlie, name: "Charlie", teamId: "blue" }
    ],
    snapshots: [
        dmSnapshot("snapshot-1", 0, "match_start", 20, true, dmScores(0, 0)),
        dmSnapshot("snapshot-2", 2_000, "periodic", 20, true, dmScores(1, 2)),
        dmSnapshot("snapshot-3", 4_000, "damage", 12, true, dmScores(2, 4)),
        dmSnapshot("snapshot-4", 5_000, "elimination", 0, true, dmScores(2, 5)),
        dmSnapshot("snapshot-5", 10_000, "respawn", 20, true, dmScores(9, 17)),
        dmSnapshot("snapshot-6", 18_000, "periodic", 16, true, dmScores(31, 38)),
        dmSnapshot("snapshot-7", 20_000, "match_end", 16, true, dmScores(33, 40))
    ],
    events: [
        { eventId: "match-start-1", type: "match_start", timeMs: 0, snapshotId: "snapshot-1" },
        {
            eventId: "engagement-start-1",
            type: "engagement_start",
            timeMs: 4_000,
            snapshotId: "snapshot-3",
            engagementId: "engagement-1",
            engagementStartMs: 4_000,
            engagementEndMs: 5_000,
            participantIds: [bravo, alpha],
            qualifiesForSkipIdle: true
        },
        {
            eventId: "damage-1",
            type: "damage",
            timeMs: 4_000,
            snapshotId: "snapshot-3",
            engagementId: "engagement-1",
            engagementStartMs: 4_000,
            engagementEndMs: 5_000,
            attackerId: bravo,
            victimId: alpha,
            weaponId: "tacz:ak47",
            weaponLabel: "AK-47",
            damageType: "firearm",
            damage: 8,
            headshot: false,
            attackerPosition: { x: 44, y: 70, z: 41.2 },
            victimPosition: { x: 14, y: 70, z: 19 },
            victimHealthBefore: 20,
            victimHealthAfter: 12,
            victimArmorBefore: 4,
            victimArmorAfter: 2,
            qualifiesForSkipIdle: true
        },
        {
            eventId: "elimination-1",
            type: "elimination",
            timeMs: 5_000,
            snapshotId: "snapshot-4",
            engagementId: "engagement-1",
            engagementStartMs: 4_000,
            engagementEndMs: 5_000,
            killerId: bravo,
            victimId: alpha,
            weaponId: "tacz:ak47",
            weaponLabel: "AK-47",
            damageType: "firearm",
            headshot: false,
            horizontalDistance: 36.9,
            distance3d: 36.9,
            verticalDifference: 0,
            killerHealthAfter: 20,
            killerArmorAfter: 2,
            victimHealthBeforeFinalDamage: 12,
            victimArmorBeforeFinalDamage: 2,
            finalDamage: 12,
            qualifiesForSkipIdle: true
        },
        {
            eventId: "respawn-1",
            type: "respawn",
            timeMs: 10_000,
            snapshotId: "snapshot-5",
            playerId: alpha,
            position: { x: 17, y: 70, z: 20.5 },
            reason: "Deathmatch respawn"
        },
        {
            eventId: "match-end-1",
            type: "match_end",
            timeMs: 20_000,
            snapshotId: "snapshot-7",
            reason: "Target reached"
        }
    ],
    engagements: [
        {
            engagementId: "engagement-1",
            startMs: 4_000,
            endMs: 5_000,
            participantIds: [bravo, alpha],
            damageEventIds: ["damage-1"],
            damageEventCount: 1,
            reciprocalDamage: false,
            qualifiesForSkipIdle: true,
            eliminationEventId: "elimination-1"
        }
    ],
    result: {
        winner: {
            type: "team",
            playerId: null,
            teamId: "blue",
            finalScore: 40,
            opponentScore: 33,
            survivingPlayerIds: []
        },
        mvp: {
            playerId: alpha,
            reason: "most_kills_then_fewest_deaths_then_name",
            score: 33
        },
        finalScores: dmScores(33, 40),
        participants: [
            {
                playerId: alpha,
                teamId: "red",
                won: false,
                placement: null,
                kills: 33,
                deaths: 4,
                assists: 2,
                damage: 710,
                headshotKills: 9,
                bestKillStreak: 12,
                longestKillDistance: 45,
                utilityKills: 1,
                vehicleKills: 0
            },
            {
                playerId: bravo,
                teamId: "blue",
                won: true,
                placement: null,
                kills: 20,
                deaths: 10,
                assists: 7,
                damage: 430,
                headshotKills: 4,
                bestKillStreak: 5,
                longestKillDistance: 36.9,
                utilityKills: 0,
                vehicleKills: 0
            },
            {
                playerId: charlie,
                teamId: "blue",
                won: true,
                placement: null,
                kills: 20,
                deaths: 12,
                assists: 4,
                damage: 390,
                headshotKills: 2,
                bestKillStreak: 4,
                longestKillDistance: 28,
                utilityKills: 0,
                vehicleKills: 0
            }
        ],
        endReason: "Target reached"
    },
    replays: []
};

const fixturePartial = {
    telemetryVersion: 1,
    matchId: "fixture-partial",
    mode: "battleRoyale",
    startedAt: "2026-07-28T12:00:00.000Z",
    endedAt: "2026-07-28T12:00:08.000Z",
    durationMs: 8_000,
    status: "completed",
    map: {
        mapId: "legacy-shmar",
        mapVersion: "unknown",
        label: "Legacy Shmar",
        imageUrl: "",
        worldMinX: -100,
        worldMaxX: 100,
        worldMinZ: -100,
        worldMaxZ: 100,
        rotationDegrees: 0,
        flipX: false,
        flipY: true,
        calibrated: false,
        calibrationSource: "unknown"
    },
    capture: { snapshotIntervalMs: null, engagementInactivityMs: 15_000 },
    participants: [
        { playerId: alpha, name: "Alpha", teamId: "solo-alpha" },
        { playerId: bravo, name: "Bravo", teamId: "solo-bravo" }
    ],
    snapshots: [
        {
            snapshotId: "snapshot-1",
            timeMs: 0,
            reason: "match_start",
            players: [
                player(alpha, "solo-alpha", -20, 72, -10, null, null, true),
                player(bravo, "solo-bravo", 30, 68, 40, null, null, true)
            ]
        },
        {
            snapshotId: "snapshot-2",
            timeMs: 8_000,
            reason: "match_end",
            players: [
                player(alpha, "solo-alpha", 0, 72, 5, null, null, true),
                player(bravo, "solo-bravo", 20, 68, 25, null, null, false)
            ]
        }
    ],
    events: [
        { eventId: "match-start-1", type: "match_start", timeMs: 0, snapshotId: "snapshot-1" },
        { eventId: "malformed-event", type: "not_a_real_event", timeMs: "invalid" },
        { eventId: "match-end-1", type: "match_end", timeMs: 8_000, snapshotId: "snapshot-2" }
    ],
    engagements: [],
    result: {
        winner: { type: "player", playerId: alpha, teamId: "solo-alpha", survivingPlayerIds: [alpha] },
        mvp: null,
        finalScores: null,
        participants: [
            { playerId: alpha, teamId: "solo-alpha", won: true, placement: 1, kills: 1, deaths: 0 },
            { playerId: bravo, teamId: "solo-bravo", won: false, placement: 2, kills: 0, deaths: 1 }
        ],
        endReason: "Legacy capture completed"
    },
    replays: []
};

await mkdir(output, { recursive: true });
for (const fixture of [fixtureBr, fixtureDm, fixturePartial]) {
    await writeFile(path.join(output, `${fixture.matchId}.json`), `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
}

console.log(`Generated ${3} match telemetry fixtures in ${output}`);
