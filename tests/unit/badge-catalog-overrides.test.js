import { describe, expect, it } from "vitest";
import {
    badgeTierEditableTarget,
    badgeTierPerMapTarget,
    mergeBadgeCatalog,
    normalizeBadgeCatalogOverride
} from "../../src/config/badge-catalog.js";
import { BADGE_CATALOG } from "../../src/config/badges.js";

describe("badge catalogue overrides", () => {
    it("normalizes safe animated assets and editable levels", () => {
        const override = normalizeBadgeCatalogOverride({
            badge_id: "br_wins_counter",
            label: "Battle Winner",
            description: "Edited badge copy.",
            icon_url: "https://cdn.example.com/badge.gif",
            tiers: [
                {
                    index: 0,
                    name: "First Crown",
                    description: "Win twice.",
                    target: 2,
                    target_per_map: null,
                    icon_url: "https://cdn.example.com/first-crown.gif"
                }
            ]
        });

        expect(override).toMatchObject({
            badgeId: "br_wins_counter",
            label: "Battle Winner",
            iconUrl: "https://cdn.example.com/badge.gif"
        });
        expect(override.tiers[0]).toMatchObject({
            index: 0,
            name: "First Crown",
            target: 2,
            iconUrl: "https://cdn.example.com/first-crown.gif"
        });
    });

    it("merges names, thresholds, and level-specific icons without changing stable IDs", () => {
        const merged = mergeBadgeCatalog(BADGE_CATALOG, [
            {
                badge_id: "br_wins_counter",
                label: "Battle Winner",
                description: "Edited badge copy.",
                icon_url: "https://cdn.example.com/badge.gif",
                tiers: [
                    {
                        index: 0,
                        name: "First Crown",
                        description: "Win twice.",
                        target: 2,
                        target_per_map: null,
                        icon_url: "https://cdn.example.com/first-crown.gif"
                    }
                ]
            }
        ]);
        const badge = merged.find((entry) => entry.id === "br_wins_counter");

        expect(merged).toHaveLength(BADGE_CATALOG.length);
        expect(badge.label).toBe("Battle Winner");
        expect(badge.icon).toBe("https://cdn.example.com/badge.gif");
        expect(badge.tiers[0]).toMatchObject({
            name: "First Crown",
            target: 2,
            icon: "https://cdn.example.com/first-crown.gif"
        });
        expect(badge.tiers[1].name).toBe("Final Contender");
    });

    it("updates both map-count and per-map requirements", () => {
        const merged = mergeBadgeCatalog(BADGE_CATALOG, [
            {
                badge_id: "dm_map_mastery",
                label: "Map Mastery",
                description: "Edited map badge.",
                tiers: [
                    {
                        index: 0,
                        name: "Explorer",
                        description: "",
                        target: 3,
                        target_per_map: 2,
                        icon_url: null
                    }
                ]
            }
        ]);
        const tier = merged.find((entry) => entry.id === "dm_map_mastery").tiers[0];

        expect(badgeTierEditableTarget(tier)).toBe(3);
        expect(badgeTierPerMapTarget(tier)).toBe(2);
        expect(tier.requirement).toMatchObject({ mapCount: 3, targetPerMap: 2 });
    });

    it("rejects unsafe asset schemes while keeping the badge data usable", () => {
        const override = normalizeBadgeCatalogOverride({
            badge_id: "owner",
            label: "Owner",
            description: "",
            icon_url: "javascript:alert(1)",
            tiers: []
        });

        expect(override.iconUrl).toBe("");
        expect(mergeBadgeCatalog(BADGE_CATALOG, [override]).find((badge) => badge.id === "owner").icon).toBe(
            "./assets/badges/default.png"
        );
    });
});
