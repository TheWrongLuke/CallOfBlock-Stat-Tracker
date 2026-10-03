import { describe, expect, it } from "vitest";
import { weeklyMissionBaseline, weeklyMissionProgress } from "../../src/core/weekly-mission-progress.js";
import { GAMEPLAY_MODES } from "../../src/core/progression-modes.js";
import { PROGRESSION_MODES, WEEKLY_MISSION_MODES } from "../../src/config/progression.js";

const row = (kills) => ({
    stats: { kills, matches: 1 },
    details: {
        weapons: [{ id: "tacz:ak47", stats: { kills } }],
        maps: [{ id: "raid", stats: { kills } }]
    }
});
const profile = {
    battleRoyale: row(1),
    teamDeathmatch: row(2),
    freeForAll: row(3),
    duel: row(4),
    zombieSurvival: {
        stats: { zombieKills: 5, games: 1, totalSurvivalMs: 65000, highestMatchKills: 5 },
        details: {
            weapons: [{ id: "tacz:ak47", stats: { kills: 5, hits: 7 } }],
            maps: [{ id: "raid", stats: { zombieKills: 5 } }]
        }
    },
    deathmatch: row(999)
};

describe("five-mode progression", () => {
    it("provides all explicit editor scopes without removing compatibility definitions", () => {
        for (const mode of GAMEPLAY_MODES) {
            expect(PROGRESSION_MODES.some((m) => m.value === mode.rule)).toBe(true);
            expect(WEEKLY_MISSION_MODES.some((m) => m.value === mode.id)).toBe(true);
        }
    });
    it("isolates player, weapon and map objectives by mode", () => {
        for (const mode of GAMEPLAY_MODES.filter((m) => m.id !== "zombieSurvival")) {
            const kills = { battleRoyale: 1, teamDeathmatch: 2, freeForAll: 3, duel: 4 }[mode.id];
            const mission = { mode: mode.id, metric: "kills", securityVersion: 4, target: 10 };
            expect(weeklyMissionBaseline(profile, mission)).toBe(kills);
            expect(weeklyMissionBaseline(profile, { ...mission, weaponId: "tacz:ak47" })).toBe(kills);
            expect(
                weeklyMissionBaseline(profile, {
                    ...mission,
                    mapId: "raid",
                    requirements: { type: "map_stat", metric: "kills" }
                })
            ).toBe(kills);
        }
    });
    it("maps Zombie counters without inventing wins or deaths and supports flat special exports", () => {
        const mission = { mode: "zombieSurvival", metric: "kills", securityVersion: 4, target: 5 };
        expect(weeklyMissionProgress(profile, mission).complete).toBe(true);
        expect(weeklyMissionBaseline(profile, { ...mission, metric: "playtimeSeconds" })).toBe(65);
        expect(weeklyMissionBaseline(profile, { ...mission, metric: "hits" })).toBe(7);
        expect(weeklyMissionBaseline(profile, { ...mission, metric: "wins" })).toBe(0);
        const flat = {
            zombieSurvival: { ...profile.zombieSurvival.stats, weapons: profile.zombieSurvival.details.weapons }
        };
        expect(weeklyMissionBaseline(flat, mission)).toBe(5);
    });
    it("preserves frozen legacy overall and map semantics, while new definitions include all modes once", () => {
        const mission = { mode: "overall", metric: "kills", target: 20 };
        expect(weeklyMissionBaseline(profile, mission)).toBe(6);
        expect(weeklyMissionBaseline(profile, { ...mission, securityVersion: 4 })).toBe(15);
        const map = { ...mission, mode: "duel", mapId: "raid", requirements: { type: "map_stat", metric: "kills" } };
        expect(weeklyMissionBaseline(profile, map)).toBe(5);
        expect(weeklyMissionBaseline(profile, { ...map, securityVersion: 4 })).toBe(4);
        expect(weeklyMissionBaseline(profile, { ...mission, mode: "unknown", securityVersion: 4 })).toBe(0);
    });
});
