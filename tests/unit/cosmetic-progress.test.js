import { describe, expect, it } from "vitest";
import { headshotRatePercent, meetsSharpshooterRequirement } from "../../src/utils/cosmetic-progress.js";

describe("cosmetic progression", () => {
    it("converts the tracker headshot ratio into a percentage", () => {
        expect(headshotRatePercent(0.3533)).toBeCloseTo(35.33);
    });

    it("unlocks Sharpshooter only when both percentage and hit requirements are met", () => {
        expect(meetsSharpshooterRequirement({ hits: 736 }, { headshotRate: 0.3533 })).toBe(true);
        expect(meetsSharpshooterRequirement({ hits: 19 }, { headshotRate: 1 })).toBe(false);
        expect(meetsSharpshooterRequirement({ hits: 736 }, { headshotRate: 0.34 })).toBe(false);
    });
});
