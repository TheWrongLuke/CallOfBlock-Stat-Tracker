import { describe, expect, it } from "vitest";
import { weeklyMissionProgress } from "../../src/features/home-weekly-missions.js";

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
