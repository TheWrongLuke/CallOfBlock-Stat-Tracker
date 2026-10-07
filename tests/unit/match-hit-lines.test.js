import { describe, expect, it } from "vitest";
import { combatLineEvents, combatLinePositions } from "../../src/match/match-map-renderer.js";

describe("tactical hit lines", () => {
    it("keeps a selected PvP attack and simultaneous active hits without duplicates", () => {
        const selected = { eventId: "pvp", type: "damage", attackId: "attack-1" };
        const active = { eventId: "other", type: "elimination" };
        expect(combatLineEvents([selected, active], [selected, active], selected)).toEqual([selected, active]);
        expect(combatLineEvents([selected, active], [active], selected)).toEqual([active, selected]);
    });

    it("groups a Zombie attack only with the same shooter and retains other active attacks", () => {
        const hit = (eventId, attackerId = "a") => ({
            eventId,
            type: "zombie_damage",
            attackId: "attack-1",
            attackerId
        });
        const first = hit("z-1");
        const second = hit("z-2");
        const otherShooter = hit("z-3", "b");
        const otherActive = { eventId: "pvp", type: "damage" };
        expect(combatLineEvents([first, second, otherShooter], [first, otherActive], first)).toEqual([
            first,
            otherActive,
            second
        ]);
    });

    it("does not turn non-combat events into hits", () => {
        const active = { eventId: "hit", type: "damage" };
        expect(combatLineEvents([], [active], { type: "respawn" })).toEqual([active]);
        expect(combatLineEvents([], [], null)).toEqual([]);
    });

    it("uses event-time positions for older recordings, not the current replay frame", () => {
        const telemetry = {
            snapshots: [
                {
                    timeMs: 0,
                    vehicles: [],
                    players: [
                        { playerId: "a", x: 0, y: 64, z: 0 },
                        { playerId: "b", x: 10, y: 64, z: 0 }
                    ]
                },
                {
                    timeMs: 1000,
                    vehicles: [],
                    players: [
                        { playerId: "a", x: 100, y: 64, z: 0 },
                        { playerId: "b", x: 110, y: 64, z: 0 }
                    ]
                }
            ]
        };
        const positions = combatLinePositions({ timeMs: 500, attackerId: "a", victimId: "b" }, telemetry);
        expect(positions.start.x).toBe(50);
        expect(positions.end.x).toBe(60);
    });

    it("prefers explicit impact coordinates even when the target disappears", () => {
        const start = { x: 0, y: 0, z: 0 };
        const end = { x: 1, y: 0, z: 1 };
        expect(combatLinePositions({ attackerPosition: start, targetPosition: end }, {})).toEqual({ start, end });
        expect(combatLinePositions({ timeMs: 0, attackerId: "missing", victimId: "missing" }, {})).toEqual({
            start: null,
            end: null
        });
    });

    it("recovers old Zombie target coordinates at hit time when recorded", () => {
        const telemetry = {
            zombieSnapshots: [{ timeMs: 0, zombies: [{ zombieId: "z-1", x: 12, y: 64, z: 8 }] }]
        };
        const start = { x: 0, y: 64, z: 0 };
        const positions = combatLinePositions(
            { type: "zombie_damage", timeMs: 0, attackerPosition: start, targetId: "z-1" },
            telemetry
        );
        expect(positions.start).toBe(start);
        expect(positions.end).toMatchObject({ zombieId: "z-1", x: 12, z: 8 });
    });
});
