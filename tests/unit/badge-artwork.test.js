import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BADGE_CATALOG, badgeArtworkUrl, isBundledBadgeArtwork } from "../../src/config/badges.js";

describe("approved combat badge artwork", () => {
    it("ships a valid transparent 512px PNG for all 129 stable award identities", () => {
        const images = BADGE_CATALOG.flatMap((badge) => (badge.tiers?.length ? badge.tiers : [badge]));
        expect(images).toHaveLength(129);
        expect(new Set(images.map((entry) => entry.icon)).size).toBe(129);
        for (const entry of images) {
            expect(isBundledBadgeArtwork(entry.icon)).toBe(true);
            const png = readFileSync(new URL(`../../${entry.icon.slice(2)}`, import.meta.url));
            expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
            expect(png.readUInt32BE(16)).toBe(512);
            expect(png.readUInt32BE(20)).toBe(512);
            expect(png[25]).toBe(6);
        }
    });

    it("rejects unsafe IDs and does not treat remote custom art as bundled", () => {
        expect(badgeArtworkUrl("../owner")).toBe("./assets/badges/default.png");
        expect(badgeArtworkUrl("")).toBe("./assets/badges/default.png");
        expect(isBundledBadgeArtwork("https://cdn.example.com/badge.gif")).toBe(false);
    });
});
