import { describe, expect, it } from "vitest";
import {
    ACE_STREAK_TIMING_SECONDS,
    BADGE_CATALOG,
    BADGE_TYPE_COUNTS,
    badgeTierLevel
} from "../../src/config/badges.js";

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

    it("derives levels from each badge's actual upgrade path", () => {
        const wins = BADGE_CATALOG.find((badge) => badge.id === "br_wins_counter");
        const ace = BADGE_CATALOG.find((badge) => badge.id === "ace_counter");

        expect(badgeTierLevel(wins.tiers, 0)).toEqual({ level: 1, total: 5 });
        expect(badgeTierLevel(wins.tiers, 3)).toEqual({ level: 4, total: 5 });
        expect(badgeTierLevel(ace.tiers, 0)).toEqual({ level: 1, total: 3 });
        expect(badgeTierLevel(ace.tiers, 2)).toEqual({ level: 3, total: 3 });
        expect(badgeTierLevel([{ rarity: "mythic" }], 0)).toBeNull();
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

    it("uses stable advancement IDs and keeps account or special badges website-only", () => {
        const visible = BADGE_CATALOG.filter((badge) => badge.showInGame);
        const visibleAwards = visible.flatMap((badge) =>
            badge.tiers?.length ? badge.tiers.map((tier) => tier.advancementId) : [badge.advancementId]
        );

        expect(visible).toHaveLength(57);
        expect(visibleAwards).toHaveLength(117);
        expect(new Set(visibleAwards).size).toBe(117);
        expect(BADGE_CATALOG.find((badge) => badge.id === "first_blood")).toMatchObject({
            advancementId: "first_blood",
            showInGame: true,
            announceInChat: true
        });
        expect(BADGE_CATALOG.find((badge) => badge.id === "br_wins_counter").tiers[0].advancementId).toBe(
            "br_wins_counter_common"
        );
        for (const id of [
            "weekly_missions_progress",
            "hard_missions_progress",
            "perfect_week",
            "admin",
            "owner",
            "playtester",
            "supporter"
        ]) {
            expect(BADGE_CATALOG.find((badge) => badge.id === id)).toMatchObject({
                showInGame: false,
                announceInChat: false
            });
        }
    });
});
