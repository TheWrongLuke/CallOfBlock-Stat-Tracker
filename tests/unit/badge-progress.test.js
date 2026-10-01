import { describe, it, expect } from "vitest";
import { BADGE_CATALOG } from "../../src/config/badges.js";
import { badgeTierState, badgeMetricValue } from "../../src/core/badge-progress.js";
const normalize = (stats) => ({ ...stats, games: stats?.games ?? stats?.matches ?? 0 });
const badge = (id) => BADGE_CATALOG.find((item) => item.id === id);

describe("shared badge rule evaluation", () => {
    it("uses existing counter thresholds and reevaluates tiers after a void", () => {
        const item = badge("br_wins_counter");
        expect(badgeTierState(item, { br: { stats: { wins: 10 } } }, normalize).currentIndex).toBe(1);
        expect(badgeTierState(item, { br: { stats: { wins: 9 } } }, normalize).currentIndex).toBe(0);
        expect(badgeTierState(item, { br: { stats: { wins: 0 } } }, normalize).currentIndex).toBe(-1);
    });
    it("preserves flag, map and placement rules", () => {
        expect(badgeTierState(badge("flawless_deathmatch"), { dm: { stats: {} } }, normalize).currentIndex).toBe(-1);
        expect(
            badgeTierState(badge("flawless_deathmatch"), { dm: { stats: { flawlessWins: 1 } } }, normalize).currentIndex
        ).toBe(0);
        const maps = Array.from({ length: 4 }, (_, i) => ({ id: `${i}`, stats: { matches: 1 } }));
        expect(
            badgeTierState(badge("dm_map_mastery"), { dm: { details: { deathmatchMaps: maps } } }, normalize)
                .currentIndex
        ).toBe(0);
        expect(
            badgeTierState(
                badge("br_placement_progress"),
                { br: { details: { battleRoyalePlacement: { top10: 5 } } } },
                normalize
            ).currentIndex
        ).toBe(0);
    });
    it("supports frozen account counters and existing time transformations", () => {
        expect(
            badgeTierState(badge("weekly_missions_progress"), { account: { weeklyMissionsCompleted: 25 } }, normalize)
                .currentIndex
        ).toBe(1);
        expect(
            badgeMetricValue(
                { scope: "battleRoyale", stat: "playtimeSeconds", transform: "hours" },
                { br: { stats: { playtimeSeconds: 7200 } } }
            )
        ).toBe(2);
    });
});
