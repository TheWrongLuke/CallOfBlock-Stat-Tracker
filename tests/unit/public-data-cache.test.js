import { describe, expect, it, vi } from "vitest";
import { readPublicStatsCache, writePublicStatsCache } from "../../src/utils/public-data-cache.js";

function memoryStorage() {
    const entries = new Map();
    return {
        getItem: (key) => entries.get(key) ?? null,
        setItem: (key, value) => entries.set(key, value),
        removeItem: (key) => entries.delete(key)
    };
}

describe("public statistics cache", () => {
    it("stores public slices and reports freshness", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-08-17T10:00:00Z"));
        const storage = memoryStorage();

        expect(writePublicStatsCache("home", { totalTrackedPlayers: 8 }, { storage })).toBe(true);
        expect(readPublicStatsCache("home", { storage, maxAgeMs: 60_000 })).toMatchObject({
            payload: { totalTrackedPlayers: 8 },
            stale: false
        });

        vi.advanceTimersByTime(61_000);
        expect(readPublicStatsCache("home", { storage, maxAgeMs: 60_000 })).toBeNull();
        expect(readPublicStatsCache("home", { storage, maxAgeMs: 60_000, allowStale: true })).toMatchObject({
            stale: true
        });
        vi.useRealTimers();
    });

    it("rejects payloads above the storage bound", () => {
        const storage = memoryStorage();
        expect(writePublicStatsCache("live", { value: "x".repeat(1_000) }, { storage, maxBytes: 100 })).toBe(false);
        expect(readPublicStatsCache("live", { storage })).toBeNull();
    });
});
