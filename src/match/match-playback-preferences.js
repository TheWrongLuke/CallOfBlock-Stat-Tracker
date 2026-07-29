const STORAGE_KEY = "cob_match_playback_preferences_v1";
const FILTER_KEYS = ["engagements", "eliminations", "vehicles", "zone", "streaks", "respawns"];

export const DEFAULT_MATCH_PLAYBACK_PREFERENCES = Object.freeze({
    speed: 1,
    skipIdle: true,
    filters: Object.freeze(Object.fromEntries(FILTER_KEYS.map((key) => [key, true])))
});

export function loadMatchPlaybackPreferences(storage = globalThis.localStorage) {
    try {
        return normalizeMatchPlaybackPreferences(JSON.parse(storage?.getItem(STORAGE_KEY) || "null"));
    } catch (_error) {
        return normalizeMatchPlaybackPreferences();
    }
}

export function saveMatchPlaybackPreferences(value, storage = globalThis.localStorage) {
    const preferences = normalizeMatchPlaybackPreferences(value);
    try {
        storage?.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch (_error) {
        // Playback still works when browser storage is unavailable.
    }
    return preferences;
}

export function normalizeMatchPlaybackPreferences(value = {}) {
    const speed = [0.5, 1, 2].includes(Number(value?.speed)) ? Number(value.speed) : 1;
    return {
        speed,
        skipIdle: value?.skipIdle !== false,
        filters: Object.fromEntries(FILTER_KEYS.map((key) => [key, value?.filters?.[key] !== false]))
    };
}
