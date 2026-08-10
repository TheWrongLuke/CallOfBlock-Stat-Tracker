import { describe, expect, it, vi } from "vitest";
import {
    loadMatchPlaybackPreferences,
    normalizeMatchPlaybackPreferences,
    saveMatchPlaybackPreferences
} from "../../src/match/match-playback-preferences.js";

describe("match playback preferences", () => {
    it("normalizes stored values and defaults missing filters to enabled", () => {
        expect(
            normalizeMatchPlaybackPreferences({
                speed: 2,
                skipIdle: false,
                filters: { vehicles: false },
                markers: { size: 4, showIcons: true, showNames: true }
            })
        ).toMatchObject({
            speed: 2,
            skipIdle: false,
            filters: {
                engagements: true,
                vehicles: false,
                eliminations: true
            },
            markers: {
                size: 4,
                showIcons: true,
                showNames: true,
                zombieRadiusBlocks: 2.5
            }
        });
    });

    it("round-trips preferences through browser storage", () => {
        const values = new Map();
        const storage = {
            getItem: vi.fn((key) => values.get(key) || null),
            setItem: vi.fn((key, value) => values.set(key, value))
        };
        saveMatchPlaybackPreferences({ speed: 0.5, filters: { zone: false } }, storage);

        expect(loadMatchPlaybackPreferences(storage)).toMatchObject({
            speed: 0.5,
            skipIdle: false,
            filters: { zone: false, vehicles: true },
            markers: { size: 2, showIcons: true, showNames: true, zombieRadiusBlocks: 2.5 }
        });
    });

    it("preserves an explicit choice to auto-skip interesting events", () => {
        expect(normalizeMatchPlaybackPreferences({ skipIdle: true }).skipIdle).toBe(true);
    });

    it("preserves an explicit choice to hide icons and names", () => {
        expect(
            normalizeMatchPlaybackPreferences({
                markers: { showIcons: false, showNames: false }
            }).markers
        ).toEqual({
            size: 2,
            showIcons: false,
            showNames: false,
            zombieRadiusBlocks: 2.5
        });
    });

    it("persists an independent half-block zombie radius", () => {
        expect(
            normalizeMatchPlaybackPreferences({
                markers: { size: 4, zombieRadiusBlocks: 3.5 }
            }).markers
        ).toMatchObject({ size: 4, zombieRadiusBlocks: 3.5 });
        expect(
            normalizeMatchPlaybackPreferences({ markers: { zombieRadiusBlocks: 99 } }).markers.zombieRadiusBlocks
        ).toBe(4);
    });
});
