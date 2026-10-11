import { describe, it, expect } from "vitest";
import { BADGE_CATALOG } from "../../src/config/badges.js";
import { badgeTierState, badgeMetricValue, badgeRequirementSnapshot } from "../../src/core/badge-progress.js";
const normalize = (stats) => ({
    ...stats,
    games: stats?.games ?? stats?.matches ?? 0
});
const badge = (id) => BADGE_CATALOG.find((item) => item.id === id);

describe("shared badge rule evaluation", () => {
    it("evaluates every shipped tier at and below its own threshold", () => {
        for (const item of BADGE_CATALOG.filter((entry) => entry.tiers?.length)) {
            for (const tier of item.tiers) {
                const requirement = tier.requirement;
                const context = {
                    br: { stats: {}, details: {} },
                    dm: { stats: {}, details: {} },
                    pvpStats: {},
                    stats: {},
                    account: {},
                    profile: {},
                    modes: {}
                };
                const set = (value) => {
                    if (requirement?.type === "dmMaps") {
                        context.dm.details.deathmatchMaps = Array.from({ length: Math.max(0, value) }, (_, id) => ({
                            id: String(id),
                            stats: { [requirement.stat]: requirement.targetPerMap }
                        }));
                    } else if (requirement?.type === "placement") {
                        context.br.details.battleRoyalePlacement = {
                            [requirement.stat]: value
                        };
                    } else {
                        const metric = requirement?.type === "flag" ? requirement : item.metric;
                        const source =
                            metric.scope === "battleRoyale"
                                ? context.br.stats
                                : metric.scope === "deathmatch"
                                  ? context.dm.stats
                                  : metric.scope === "account"
                                    ? context.account
                                    : metric.scope === "profile"
                                      ? context.profile
                                      : ["teamDeathmatch", "freeForAll", "duel", "zombieSurvival"].includes(
                                              metric.scope
                                          )
                                        ? (context.modes[metric.scope] ||= { stats: {} }).stats
                                        : metric.scope === "cooperative"
                                          ? context.br.stats
                                          : context.pvpStats;
                        source[metric.stat] =
                            metric.transform === "hours"
                                ? value * 3600
                                : metric.transform === "seconds"
                                  ? value * 1000
                                  : value;
                    }
                };
                const target =
                    requirement?.type === "dmMaps"
                        ? requirement.mapCount
                        : ["placement", "flag"].includes(requirement?.type)
                          ? requirement.target
                          : tier.target;
                expect(target, `${item.id}/${tier.name} positive finite threshold`).toBeGreaterThan(0);
                set(target);
                expect(
                    badgeRequirementSnapshot(item, tier, context, normalize).actual,
                    `${item.id}/${tier.name} at threshold`
                ).toBe(target);
                set(target - 1);
                expect(
                    badgeRequirementSnapshot(item, tier, context, normalize).actual,
                    `${item.id}/${tier.name} below threshold`
                ).toBeLessThan(target);
            }
        }
    });
    it("excludes Zombie counters from overall PvP badges without hiding raw stats", () => {
        const context = {
            stats: { headshotKills: 60, longestKillDistance: 500 },
            pvpStats: { headshotKills: 0, longestKillDistance: 0 }
        };
        expect(badgeTierState(badge("headshot_kills_counter"), context, normalize).currentIndex).toBe(-1);
        expect(badgeMetricValue({ scope: "overall", stat: "longestKillDistance" }, context)).toBe(0);
        expect(context.stats.headshotKills).toBe(60);
    });
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
        const maps = Array.from({ length: 4 }, (_, i) => ({
            id: `${i}`,
            stats: { matches: 1 }
        }));
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
