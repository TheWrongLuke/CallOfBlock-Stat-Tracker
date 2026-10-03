import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { applyKnownTacticalMap, findTacticalMap } from "../../src/config/tactical-maps.js";
import { mapCoordinateToPercent } from "../../src/match/match-telemetry-normalizer.js";

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

    it.each([
        ["1", "Raid", 915, 1116, -232, 13],
        ["shoothouse", "Shoot House", 951, 1049, 903, 1064],
        ["hijacked", "Hijacked", -16, 159, 960, 1039],
        ["A", "Map A", -1018, -988, 968, 1003],
        ["B", "Map B", 988, 1013, -1002, -957]
    ])("calibrates %s image corners and center in TDM, FFA and Duels", (mapId, label, minX, maxX, minZ, maxZ) => {
        for (const mode of ["teamDeathmatch", "freeForAll", "duel"]) {
            const map = applyKnownTacticalMap({ mapId, label, mapVersion: "arena-2026-10" }, mode);
            expect(mapCoordinateToPercent(map, minX, minZ)).toEqual({ x: 0, y: 0, outsideBounds: false });
            expect(mapCoordinateToPercent(map, maxX, maxZ)).toEqual({ x: 100, y: 100, outsideBounds: false });
            expect(mapCoordinateToPercent(map, (minX + maxX) / 2, (minZ + maxZ) / 2)).toEqual({
                x: 50,
                y: 50,
                outsideBounds: false
            });
            const image = readFileSync(new URL(`../../${map.imageUrl}`, import.meta.url));
            expect([image.readUInt32BE(16), image.readUInt32BE(20)]).toEqual([map.imageWidth, map.imageHeight]);
        }
    });

    it("keeps small maps crisp and prefers configured names over recycled IDs", () => {
        expect(applyKnownTacticalMap({ mapId: "A" }).pixelArt).toBe(true);
        expect(applyKnownTacticalMap({ label: "Map B" }).pixelArt).toBe(true);
        expect(findTacticalMap({ mapId: "2", label: "Raid" }).id).toBe("raid");
    });

    it.each([
        ["raid", -368, -177, -1232, -993],
        ["hijacked", -576, -417, -864, -785],
        ["shooting-house", -48, 79, -992, -818]
    ])("preserves historical %s playback images and coordinate calibration", (mapId, minX, maxX, minZ, maxZ) => {
        const source = { mapId, worldMinX: minX, worldMaxX: maxX, worldMinZ: minZ, worldMaxZ: maxZ };
        const map = applyKnownTacticalMap(source);
        expect(map.imageUrl).toBe(`./assets/maps/legacy/${mapId}.png`);
        expect(mapCoordinateToPercent(map, minX, minZ)).toEqual({ x: 0, y: 0, outsideBounds: false });
        expect(mapCoordinateToPercent(map, maxX, maxZ)).toEqual({ x: 100, y: 100, outsideBounds: false });
        const image = readFileSync(new URL(`../../${map.imageUrl}`, import.meta.url));
        expect([image.readUInt32BE(16), image.readUInt32BE(20)]).toEqual([map.imageWidth, map.imageHeight]);
        expect(source.imageUrl).toBeUndefined();
    });

    it("uses actual recorded positions instead of stale hard-coded metadata, with explicit versions taking priority", () => {
        const stale = { mapId: "raid", worldMinX: -368, worldMaxX: -177, worldMinZ: -1232, worldMaxZ: -993 };
        expect(applyKnownTacticalMap(stale, "duel", [{ x: 1000, z: -100 }]).worldMinX).toBe(915);
        expect(applyKnownTacticalMap({ mapId: "raid" }, "duel", [{ x: -300, z: -1100 }]).imageUrl).toContain(
            "/legacy/"
        );
        expect(applyKnownTacticalMap({ ...stale, mapVersion: "arena-2026-10" }).worldMinX).toBe(915);
        expect(applyKnownTacticalMap({ mapId: "unknown", worldMinX: null })).toEqual({
            mapId: "unknown",
            worldMinX: null
        });
    });
});
