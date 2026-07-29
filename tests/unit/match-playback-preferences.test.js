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
                filters: { vehicles: false }
            })
        ).toMatchObject({
            speed: 2,
            skipIdle: false,
            filters: {
                engagements: true,
                vehicles: false,
                eliminations: true
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
            skipIdle: true,
            filters: { zone: false, vehicles: true }
        });
    });
});
