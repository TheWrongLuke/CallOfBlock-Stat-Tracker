import { describe, expect, it } from "vitest";
import { weeklyMissionBaseline, weeklyMissionProgress } from "../../src/core/weekly-mission-progress.js";

const profile = {
    battleRoyale: { stats: { kills: 6, weeklyCounters: { special: 2 } } },
    teamDeathmatch: {
        stats: { kills: 4, wins: 1 },
        details: {
            weapons: [{ id: "ak47", stats: { kills: 4, weeklyCounters: { special: 3 } } }],
            maps: [{ id: "raid", stats: { games: 2 } }]
        }
    },
    freeForAll: { stats: { kills: 5 } },
    deathmatch: { stats: { kills: 999 } }
};

describe("shared assignment baseline", () => {
    it("captures all existing requirement forms without compatibility double-counting", () => {
        const missions = [
            [{ mode: "overall", metric: "kills" }, 15],
            [{ mode: "battleRoyale", requirements: { type: "counter", key: "special" } }, 2],
            [
                {
                    mode: "deathmatch",
                    weaponId: "ak47",
                    requirements: { type: "counter", key: "special", scope: "weapon" }
                },
                3
            ],
            [{ mapId: "raid", requirements: { type: "map_stat", metric: "games" } }, 2],
            [
                {
                    requirements: {
                        type: "all",
                        components: [
                            { mode: "battleRoyale", metric: "kills", target: 10 },
                            { mode: "deathmatch", metric: "kills", target: 10 }
                        ]
                    }
                },
                { type: "all", values: [6, 9] }
            ],
            [
                { mode: "deathmatch", requirements: { type: "distinct", collection: "weapons", metric: "kills" } },
                { type: "distinct", values: { ak47: 4 } }
            ]
        ];
        for (const [definition, expected] of missions) {
            const mission = { ...definition, target: 10 };
            const baseline = weeklyMissionBaseline(profile, mission);
            expect(baseline).toEqual(expected);
            expect(weeklyMissionProgress(profile, { ...mission, baseline }).value).toBe(0);
        }
    });

    it("ignores stale saved baseline and progress while capturing assignment metrics", () => {
        const mission = {
            mode: "overall",
            metric: "kills",
            baseline: 100,
            serverProgress: { complete: true, value: 100, target: 1 }
        };
        expect(weeklyMissionBaseline(profile, mission)).toBe(15);
        expect(mission.baseline).toBe(100);
    });
});
