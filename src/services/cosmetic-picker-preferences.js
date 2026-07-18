export const COSMETIC_PICKER_PREFERENCES_KEY = "cob_cosmetic_picker_preferences_v1";

export function loadCosmeticPickerPreferences(storage = globalThis.localStorage) {
    if (!storage?.getItem) return { showUnowned: false };

    try {
        const saved = JSON.parse(storage.getItem(COSMETIC_PICKER_PREFERENCES_KEY) || "null");
        return { showUnowned: saved?.showUnowned === true };
    } catch (_error) {
        return { showUnowned: false };
    }
}

export function saveCosmeticPickerPreferences(preferences, storage = globalThis.localStorage) {
    if (!storage?.setItem) return false;

    try {
        storage.setItem(
            COSMETIC_PICKER_PREFERENCES_KEY,
            JSON.stringify({ showUnowned: preferences?.showUnowned === true })
        );
        return true;
    } catch (_error) {
        return false;
    }
}
