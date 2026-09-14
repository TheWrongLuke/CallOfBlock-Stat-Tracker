import { describe, expect, it } from "vitest";
import { weeklyMissionProgress } from "../../src/features/home-weekly-missions.js";
import { mergeStatsProfile, findStatsProfile } from "../../src/core/mission-profile.js";
import { weeklyMissionProgress as sharedProgress } from "../../src/core/weekly-mission-progress.js";

const profile = {
    battleRoyale: {
        stats: { games: 4, kills: 12, playtimeSeconds: 900 },
        details: { weapons: [{ id: "scar_l", label: "SCAR-L", stats: { kills: 7, hits: 40 } }] }
    },
    deathmatch: {
        stats: { games: 6, kills: 20, playtimeSeconds: 1200 },
        details: {
            weapons: [{ id: "scar_l", label: "SCAR-L", stats: { kills: 8, hits: 55 } }],
            deathmatchMaps: [{ id: "raid", stats: { wins: 2, games: 3 } }]
        }
    }
};

describe("homepage weekly mission progress", () => {
    it("uses exactly the same calculator as the Stats account page", () => {
        expect(weeklyMissionProgress).toBe(sharedProgress);
    });

    it("keeps weapon progress when the map slice contains empty placeholders", () => {
        const core = structuredClone(profile);
        core.deathmatch.details = { weapons: [], deathmatchMaps: [] };
        const weapons = { deathmatch: { stats: { kills: 0 }, details: profile.deathmatch.details } };
        const maps = {
            deathmatch: {
                stats: { kills: 0 },
                details: { weapons: [], deathmatchMaps: [{ id: "raid", stats: { wins: 2 } }] }
            }
        };
        const merged = mergeStatsProfile(core, weapons, maps);
        expect(merged.deathmatch.stats.kills).toBe(20);
        expect(merged.deathmatch.details.weapons).toEqual(profile.deathmatch.details.weapons);
        expect(merged.deathmatch.details.deathmatchMaps[0].stats.wins).toBe(2);
        expect(mergeStatsProfile(null, weapons, maps)).toBeNull();
        expect(findStatsProfile({ profiles: [{ playerId: "other" }] }, "me")).toBeNull();
    });

    it("aggregates split TDM and FFA without adding the compatibility DM aggregate twice", () => {
        const split = {
            deathmatch: { stats: { kills: 999 } },
            teamDeathmatch: profile.deathmatch,
            freeForAll: profile.battleRoyale
        };
        expect(
            weeklyMissionProgress(split, { mode: "deathmatch", metric: "kills", baseline: 24, target: 10 })
        ).toMatchObject({ value: 8, target: 10, progress: 0.8 });
        expect(
            weeklyMissionProgress(split, {
                mode: "deathmatch",
                metric: "kills",
                weaponId: "scar_l",
                baseline: 5,
                target: 20
            })
        ).toMatchObject({ value: 10, progress: 0.5 });
    });

    it("combines shared maps and counters but takes maxima for streaks", () => {
        const split = {
            teamDeathmatch: {
                stats: { bestKillStreak: 4, weeklyCounters: { revenge_kill: 3 } },
                details: { maps: [{ id: "raid", stats: { wins: 2 } }] }
            },
            freeForAll: {
                stats: { bestKillStreak: 7, weeklyCounters: { revenge_kill: 4 } },
                details: { maps: [{ id: "raid", stats: { wins: 3 } }] }
            }
        };
        expect(
            weeklyMissionProgress(split, {
                mode: "deathmatch",
                target: 10,
                baseline: 0,
                requirements: { type: "map_stat", metric: "wins" },
                mapId: "raid"
            }).value
        ).toBe(5);
        expect(
            weeklyMissionProgress(split, {
                mode: "deathmatch",
                target: 10,
                baseline: 2,
                requirements: { type: "counter", key: "revenge_kill" }
            }).value
        ).toBe(5);
        expect(
            weeklyMissionProgress(split, { mode: "deathmatch", target: 10, baseline: 0, metric: "bestKillStreak" })
                .value
        ).toBe(7);
    });

    it("does not produce NaN for invalid multipart targets", () => {
        expect(
            Number.isFinite(
                weeklyMissionProgress(profile, {
                    requirements: {
                        type: "all",
                        components: [null, { target: 0, mode: "battleRoyale", metric: "kills" }]
                    }
                }).progress
            )
        ).toBe(true);
    });
    it("combines Battle Royale and Deathmatch progress after the stored baseline", () => {
        const progress = weeklyMissionProgress(profile, {
            metric: "kills",
            mode: "overall",
            target: 10,
            baseline: 24,
            requirements: { type: "stat" }
        });

        expect(progress).toMatchObject({ complete: false, status: "8 / 10" });
        expect(progress.progress).toBe(0.8);
    });

    it("supports multi-part mode requirements", () => {
        const progress = weeklyMissionProgress(profile, {
            target: 2,
            baseline: { values: [3, 5] },
            requirements: {
                type: "all",
                components: [
                    { mode: "battleRoyale", metric: "games", target: 1 },
                    { mode: "deathmatch", metric: "games", target: 1 }
                ]
            }
        });

        expect(progress.complete).toBe(true);
        expect(progress.status).toBe("BR 1 / 1 | DM 1 / 1");
    });

    it("uses weapon-specific totals", () => {
        const progress = weeklyMissionProgress(profile, {
            metric: "kills",
            mode: "overall",
            weaponId: "scar_l",
            target: 10,
            baseline: 5,
            requirements: { type: "stat" }
        });

        expect(progress).toMatchObject({ complete: true, status: "Complete" });
    });
});
