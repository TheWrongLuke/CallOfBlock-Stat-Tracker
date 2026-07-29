import { describe, expect, it } from "vitest";
import { applyKnownTacticalMap, findTacticalMap } from "../../src/config/tactical-maps.js";

describe("known tactical maps", () => {
    it("applies the supplied Shmar corner bounds without flipping either axis", () => {
        expect(applyKnownTacticalMap({ mapId: "shmar", label: "Shmar" }, "battleRoyale")).toMatchObject({
            imageUrl: "./assets/maps/shmar.png",
            imageWidth: 832,
            imageHeight: 816,
            worldMinX: -464,
            worldMaxX: 367,
            worldMinZ: -448,
            worldMaxZ: 367,
            flipX: false,
            flipY: false,
            calibrated: true
        });
    });

    it("recognizes current numeric Deathmatch map IDs", () => {
        expect(findTacticalMap({ mapId: "2", label: "Shooting House" }, "deathmatch")?.id).toBe("shooting-house");
        expect(findTacticalMap({ mapId: "3", label: "Hijacked" }, "deathmatch")?.id).toBe("hijacked");
        expect(findTacticalMap({ mapId: "4", label: "Raid" }, "deathmatch")?.id).toBe("raid");
        expect(findTacticalMap({ mapId: "1", label: "Box" }, "deathmatch")).toBeNull();
    });
});
