const STORAGE_KEY = "cob_match_playback_preferences_v1";
const FILTER_KEYS = ["engagements", "eliminations", "vehicles", "zone", "streaks", "respawns"];

export const DEFAULT_MATCH_PLAYBACK_PREFERENCES = Object.freeze({
    speed: 1,
    skipIdle: true,
    filters: Object.freeze(Object.fromEntries(FILTER_KEYS.map((key) => [key, true]))),
    markers: Object.freeze({
        size: 2,
        showIcons: true,
        showNames: true
    })
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
    const rawMarkerSize = Number(value?.markers?.size);
    const markerSize = Number.isFinite(rawMarkerSize)
        ? Math.max(0, Math.min(4, Math.round(rawMarkerSize)))
        : DEFAULT_MATCH_PLAYBACK_PREFERENCES.markers.size;
    return {
        speed,
        skipIdle: value?.skipIdle !== false,
        filters: Object.fromEntries(FILTER_KEYS.map((key) => [key, value?.filters?.[key] !== false])),
        markers: {
            size: value?.markers?.size === undefined ? 2 : markerSize,
            showIcons:
                value?.markers?.showIcons === undefined
                    ? DEFAULT_MATCH_PLAYBACK_PREFERENCES.markers.showIcons
                    : value.markers.showIcons === true,
            showNames:
                value?.markers?.showNames === undefined
                    ? DEFAULT_MATCH_PLAYBACK_PREFERENCES.markers.showNames
                    : value.markers.showNames === true
        }
    };
}
