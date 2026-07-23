import { describe, expect, it } from "vitest";
import { ACE_STREAK_TIMING_SECONDS, BADGE_CATALOG, BADGE_TYPE_COUNTS } from "../../src/config/badges.js";

describe("badge catalog", () => {
    it("contains the complete 64-badge structure with stable IDs", () => {
        expect(BADGE_CATALOG).toHaveLength(64);
        expect(new Set(BADGE_CATALOG.map((badge) => badge.id)).size).toBe(64);
        expect(BADGE_TYPE_COUNTS).toEqual({
            "live-counter": 10,
            limited: 10,
            permanent: 40,
            special: 4
        });
    });

    it("uses the corrected Ace timing and non-overlapping counter tiers", () => {
        expect(ACE_STREAK_TIMING_SECONDS).toEqual([4, 4, 4, 3, 2.5, 2.5]);

        const ace = BADGE_CATALOG.find((badge) => badge.id === "ace_counter");
        expect(ace.tiers.map(({ rarity, name, target }) => ({ rarity, name, target }))).toEqual([
            { rarity: "epic", name: "Ace", target: 1 },
            { rarity: "legendary", name: "Ace Specialist", target: 5 },
            { rarity: "mythic", name: "Ace of Aces", target: 10 }
        ]);
        expect(ace.personalBest.metric.stat).toBe("bestAceStreak");
    });

    it("keeps all four Deathmatch map-mastery tiers based on four qualifying maps", () => {
        const mastery = BADGE_CATALOG.find((badge) => badge.id === "dm_map_mastery");
        expect(mastery.tiers).toHaveLength(4);
        expect(mastery.tiers.every((entry) => entry.requirement.mapCount === 4)).toBe(true);
        expect(mastery.tiers.map((entry) => entry.requirement.targetPerMap)).toEqual([1, 1, 10, 25]);
    });

    it("defines only the four intended special badges", () => {
        expect(BADGE_CATALOG.filter((badge) => badge.badgeType === "special").map((badge) => badge.id)).toEqual([
            "admin",
            "owner",
            "playtester",
            "supporter"
        ]);
    });
});
