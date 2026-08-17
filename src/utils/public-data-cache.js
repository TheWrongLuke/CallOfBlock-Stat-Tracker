const CACHE_VERSION = 1;
const CACHE_PREFIX = "cob-public-stats:";
const DEFAULT_MAX_BYTES = 1_500_000;
const DEFAULT_MAX_STALE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function readPublicStatsCache(
    id,
    { maxAgeMs = Number.POSITIVE_INFINITY, allowStale = false, maxStaleAgeMs = DEFAULT_MAX_STALE_AGE_MS, storage } = {}
) {
    const cacheStorage = resolveStorage(storage);
    if (!cacheStorage) return null;

    try {
        const serialized = cacheStorage.getItem(cacheKey(id));
        if (!serialized) return null;
        const entry = JSON.parse(serialized);
        if (entry?.version !== CACHE_VERSION || !entry.payload || !Number.isFinite(Number(entry.storedAt))) {
            cacheStorage.removeItem(cacheKey(id));
            return null;
        }

        const storedAt = Number(entry.storedAt);
        const ageMs = Math.max(0, Date.now() - storedAt);
        const stale = ageMs > maxAgeMs;
        if ((stale && !allowStale) || ageMs > maxStaleAgeMs) return null;
        return { payload: entry.payload, storedAt, stale };
    } catch (_error) {
        return null;
    }
}

export function writePublicStatsCache(id, payload, { maxBytes = DEFAULT_MAX_BYTES, storage } = {}) {
    const cacheStorage = resolveStorage(storage);
    if (!cacheStorage || !payload || typeof payload !== "object") return false;

    try {
        const serialized = JSON.stringify({ version: CACHE_VERSION, storedAt: Date.now(), payload });
        if (new TextEncoder().encode(serialized).byteLength > maxBytes) return false;
        cacheStorage.setItem(cacheKey(id), serialized);
        return true;
    } catch (_error) {
        return false;
    }
}

function cacheKey(id) {
    return `${CACHE_PREFIX}${encodeURIComponent(String(id || "live"))}`;
}

function resolveStorage(storage) {
    if (storage !== undefined) return storage;
    try {
        return globalThis.localStorage || null;
    } catch (_error) {
        return null;
    }
}
