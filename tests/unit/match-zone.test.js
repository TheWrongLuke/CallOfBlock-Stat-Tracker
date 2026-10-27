import { describe, expect, it } from "vitest";
import { mapCoordinateToPercent, mapZoneToPercent } from "../../src/match/match-telemetry-normalizer.js";
import { interpolateSnapshotAtTime } from "../../src/match/match-playback-controller.js";

const map = { worldMinX: 0, worldMaxX: 200, worldMinZ: 0, worldMaxZ: 100 };

describe("replay zone geometry", () => {
    it("projects a world circle correctly on a non-square map", () => {
        expect(mapZoneToPercent(map, { centerX: 100, centerZ: 50, radius: 20 })).toEqual({
            x: 50,
            y: 50,
            radiusX: 10,
            radiusY: 20,
            rotation: 0
        });
    });
    it("preserves off-map zone centres without changing clamped player markers", () => {
        expect(mapZoneToPercent(map, { centerX: 250, centerZ: -50, radius: 100 })).toMatchObject({ x: 125, y: -50 });
        expect(mapCoordinateToPercent(map, 250, -50)).toEqual({ x: 100, y: 0, outsideBounds: true });
    });
    it("preserves calibration flips and ellipse rotation", () => {
        expect(
            mapZoneToPercent({ ...map, flipY: true, rotationDegrees: 90 }, { centerX: 50, centerZ: 25, radius: 20 })
        ).toMatchObject({ x: 25, y: 25, radiusX: 10, radiusY: 20, rotation: 90 });
    });
    it("supports a zone larger than the map and a collapsed final zone", () => {
        expect(mapZoneToPercent(map, { centerX: 100, centerZ: 50, radius: 1000 }).radiusX).toBe(500);
        expect(mapZoneToPercent(map, { centerX: 100, centerZ: 50, radius: 0 }).radiusX).toBe(0);
    });
    it("hides missing or invalid zone data", () => {
        expect(mapZoneToPercent(map, null)).toBeNull();
        expect(mapZoneToPercent(map, { centerX: 0, centerZ: 0, radius: -1 })).toBeNull();
        expect(mapZoneToPercent({ ...map, worldMaxX: 0 }, { centerX: 0, centerZ: 0, radius: 1 })).toBeNull();
    });
});

describe("moving replay zone", () => {
    const snapshots = [
        {
            timeMs: 0,
            players: [],
            vehicles: [],
            zone: { phase: 1, centerX: 40, centerZ: 20, radius: 50, damagePerSecond: 1 }
        },
        {
            timeMs: 1000,
            players: [],
            vehicles: [],
            zone: { phase: 1, centerX: 60, centerZ: 60, radius: 20, damagePerSecond: 1 }
        }
    ];
    it("moves the centre and radius with the playhead", () => {
        expect(interpolateSnapshotAtTime(snapshots, 500).zone).toMatchObject({ centerX: 50, centerZ: 40, radius: 35 });
    });
    it("seeks backward deterministically without changing the recording", () => {
        const original = JSON.stringify(snapshots);
        interpolateSnapshotAtTime(snapshots, 950);
        expect(interpolateSnapshotAtTime(snapshots, 100).zone).toMatchObject({ centerX: 42, centerZ: 24, radius: 47 });
        expect(JSON.stringify(snapshots)).toBe(original);
    });
    it("does not invent an active zone before its first recorded activation", () => {
        const delayed = [{ ...snapshots[0], zone: null }, snapshots[1]];
        expect(interpolateSnapshotAtTime(delayed, 500).zone).toBeNull();
        expect(interpolateSnapshotAtTime(delayed, 1000).zone).toEqual(snapshots[1].zone);
    });
});
